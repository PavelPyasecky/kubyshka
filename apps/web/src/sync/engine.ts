import { emptyChanges, shouldApplyRemote, syncRetryDelay, syncTableNames } from '@kubyshka/shared';
import type { SyncChanges, SyncResponse, SyncTable, Syncable } from '@kubyshka/shared';
import { api } from '../api/client.ts';
import { local, readMeta, writeMeta } from '../db/local.ts';
import { createStore } from '../state/store.ts';
import { syncClock } from './clock.ts';

const CURSOR_KEY = 'syncCursor';
const DEBOUNCE_MS = 2000;

export const syncStore = createStore({ offline: false, lastSyncedAt: 0 });

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryAttempt = 0;
let running = false;
let pending = false;

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
      const key = `${table}:${row.id}`;
      const localRow = pendingKeys.has(key) ? await tableOf(table).get(row.id) : undefined;
      if (shouldApplyRemote({ pending: pendingKeys.has(key), localUpdatedAt: localRow?.updatedAt, remoteUpdatedAt: row.updatedAt })) {
        accepted.push(row);
      }
    }

    if (accepted.length > 0) await tableOf(table).bulkPut(accepted);
  }
};

const settleOutbox = async (keys: string[], changes: SyncChanges): Promise<void> => {
  const remoteByKey = new Map<string, Syncable>();
  for (const table of syncTableNames) {
    for (const row of changes[table] as Syncable[]) remoteByKey.set(`${table}:${row.id}`, row);
  }

  const settled: string[] = [];
  for (const key of keys) {
    const remote = remoteByKey.get(key);
    if (!remote) continue;
    const separator = key.indexOf(':');
    const table = key.slice(0, separator) as SyncTable;
    const id = key.slice(separator + 1);
    const localRow = await tableOf(table).get(id);
    if (shouldApplyRemote({ pending: true, localUpdatedAt: localRow?.updatedAt, remoteUpdatedAt: remote.updatedAt })) {
      settled.push(key);
    }
  }

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
};

const clearRetry = (): void => {
  clearTimeout(retryTimer);
  retryTimer = undefined;
};

const armRetry = (): void => {
  if (document.visibilityState === 'hidden') return;
  const delay = syncRetryDelay(retryAttempt);
  retryAttempt += 1;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void sync(), delay);
};

export const sync = async (): Promise<void> => {
  clearRetry();
  if (running) {
    pending = true;
    return;
  }

  running = true;

  try {
    await runOnce();
    retryAttempt = 0;
    syncStore.set({ offline: false, lastSyncedAt: Date.now() });
  } catch {
    syncStore.set({ ...syncStore.get(), offline: true });
    armRetry();
  } finally {
    running = false;
    if (pending) {
      pending = false;
      void sync();
    }
  }
};

export const requestSync = (): void => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void sync(), DEBOUNCE_MS);
};

let started = false;

export const startSync = (): void => {
  void sync();
  if (started) return;
  started = true;

  window.addEventListener('online', () => void sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearRetry();
      retryAttempt = 0;
      return;
    }
    void sync();
  });
};

export const resetLocalData = async (): Promise<void> => {
  await local.delete();
  location.reload();
};
