import { emptyChanges, syncTableNames } from '@kubyshka/shared';
import type { SyncChanges, SyncResponse, SyncTable, Syncable } from '@kubyshka/shared';
import { api } from '../api/client.ts';
import { local, readMeta, writeMeta } from '../db/local.ts';
import { syncClock } from './clock.ts';

const CURSOR_KEY = 'syncCursor';
const DEBOUNCE_MS = 2000;

type Status = 'idle' | 'running' | 'offline';

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let pending = false;
let status: Status = 'idle';
let lastSyncedAt = 0;
const listeners = new Set<() => void>();

export const syncState = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: () => ({ status, lastSyncedAt }),
};

const announce = (next: Status) => {
  status = next;
  for (const listener of listeners) listener();
};

const tableOf = (table: SyncTable) =>
  local[table] as unknown as {
    get: (id: string) => Promise<Syncable | undefined>;
    bulkPut: (values: unknown[]) => Promise<unknown>;
  };

const collectOutgoing = async (): Promise<{ changes: SyncChanges; keys: string[] }> => {
  const entries = await local.outbox.toArray();
  const changes = emptyChanges();

  for (const entry of entries) {
    const row = await tableOf(entry.table).get(entry.id);
    if (row) (changes[entry.table] as unknown[]).push(row);
  }

  return { changes, keys: entries.map((entry) => entry.key) };
};

const applyIncoming = async (changes: SyncChanges, pendingKeys: Set<string>): Promise<void> => {
  for (const table of syncTableNames) {
    const rows = changes[table] as Syncable[];
    if (rows.length === 0) continue;

    const accepted: Syncable[] = [];
    for (const row of rows) {
      if (!pendingKeys.has(`${table}:${row.id}`)) {
        accepted.push(row);
        continue;
      }
      const localRow = await tableOf(table).get(row.id);
      if (!localRow || row.updatedAt >= localRow.updatedAt) accepted.push(row);
    }

    if (accepted.length > 0) await tableOf(table).bulkPut(accepted);
  }
};

const settleOutbox = async (keys: string[], changes: SyncChanges): Promise<void> => {
  const confirmed = new Set<string>();

  for (const table of syncTableNames) {
    for (const row of changes[table] as Syncable[]) confirmed.add(`${table}:${row.id}`);
  }

  const settled = keys.filter((key) => confirmed.has(key));
  if (settled.length > 0) await local.outbox.bulkDelete(settled);
};

const runOnce = async (): Promise<void> => {
  const cursor = await readMeta(CURSOR_KEY, 0);
  const { changes: outgoing, keys } = await collectOutgoing();

  const response = await api<SyncResponse>('/sync', { cursor, changes: outgoing });

  await syncClock(response.serverTime);
  await applyIncoming(response.changes, new Set(keys));
  await settleOutbox(keys, response.changes);
  await writeMeta(CURSOR_KEY, response.cursor);

  lastSyncedAt = Date.now();
};

export const sync = async (): Promise<void> => {
  if (running) {
    pending = true;
    return;
  }

  running = true;
  announce('running');

  try {
    await runOnce();
    announce('idle');
  } catch {
    announce('offline');
  } finally {
    running = false;
    if (pending) {
      pending = false;
      void sync();
    }
  }
};

export const requestSync = (): void => {
  clearTimeout(timer);
  timer = setTimeout(() => void sync(), DEBOUNCE_MS);
};

let started = false;

export const startSync = (): void => {
  void sync();
  if (started) return;
  started = true;
  window.addEventListener('online', () => void sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync();
  });
};

export const resetLocalData = async (): Promise<void> => {
  await local.delete();
  location.reload();
};
