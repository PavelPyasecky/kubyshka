import {
  decryptJson,
  emptyBatch,
  encryptJson,
  openContent,
  recordAad,
  sealContent,
  shouldApplyRemote,
  syncRetryDelay,
  syncTableNames,
} from '@kubyshka/shared';
import type { SyncBatch, SyncEnvelope, SyncTable, Syncable, SyncResponse } from '@kubyshka/shared';
import { api } from '../api/client.ts';
import { local, readMeta, writeMeta } from '../db/local.ts';
import { readVault } from '../db/vault.ts';
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

type WireRow = {
  id: string;
  familyId: string;
  updatedAt: number;
  updatedBy: string | null;
  deleted: boolean;
  ciphertext: string;
};

const tableOf = (table: SyncTable) =>
  local[table] as unknown as {
    get: (id: string) => Promise<Syncable | undefined>;
    bulkPut: (values: unknown[]) => Promise<unknown>;
    toArray: () => Promise<Syncable[]>;
  };

const collectOutgoing = async (key: CryptoKey): Promise<{ changes: Record<SyncTable, WireRow[]>; keys: string[] }> => {
  const entries = await local.outbox.toArray();
  const changes = emptyBatch() as unknown as Record<SyncTable, WireRow[]>;

  for (const entry of entries) {
    const row = await tableOf(entry.table).get(entry.id);
    if (!row) continue;
    const ciphertext = await encryptJson(key, recordAad(entry.table, row.id, row.familyId, row.updatedAt), sealContent(entry.table, row));
    changes[entry.table].push({
      id: row.id,
      familyId: row.familyId,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      deleted: row.deleted,
      ciphertext,
    });
  }

  return { changes, keys: entries.map((entry) => entry.key) };
};

const materialize = async (table: SyncTable, row: SyncEnvelope, key: CryptoKey): Promise<Syncable | null> => {
  if (!row.ciphertext && !row.legacy) return null;
  const content = row.ciphertext
    ? openContent(table, await decryptJson(key, recordAad(table, row.id, row.familyId, row.updatedAt), row.ciphertext))
    : openContent(table, row.legacy);
  return {
    id: row.id,
    familyId: row.familyId,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    deleted: row.deleted,
    seq: row.seq,
    ...content,
  } as Syncable;
};

const applyIncoming = async (changes: SyncBatch, pendingKeys: Set<string>, key: CryptoKey): Promise<void> => {
  const migrated: { table: SyncTable; id: string }[] = [];

  for (const table of syncTableNames) {
    const rows = changes[table];
    if (rows.length === 0) continue;

    const accepted: Syncable[] = [];
    for (const row of rows) {
      const pendingKey = `${table}:${row.id}`;
      const localRow = pendingKeys.has(pendingKey) ? await tableOf(table).get(row.id) : undefined;
      if (!shouldApplyRemote({ pending: pendingKeys.has(pendingKey), localUpdatedAt: localRow?.updatedAt, remoteUpdatedAt: row.updatedAt })) {
        continue;
      }
      const entity = await materialize(table, row, key);
      if (!entity) continue;
      accepted.push(entity);
      if (!row.ciphertext) migrated.push({ table, id: row.id });
    }

    if (accepted.length > 0) await tableOf(table).bulkPut(accepted);
  }

  if (migrated.length === 0) return;
  await local.transaction('rw', local.outbox, async () => {
    for (const item of migrated) await local.outbox.put({ key: `${item.table}:${item.id}`, table: item.table, id: item.id });
  });
  requestSync();
};

const settleOutbox = async (keys: string[], changes: SyncBatch): Promise<void> => {
  const remoteByKey = new Map<string, SyncEnvelope>();
  for (const table of syncTableNames) {
    for (const row of changes[table]) remoteByKey.set(`${table}:${row.id}`, row);
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
  const vault = await readVault();
  if (!vault) throw new Error('vault');

  const cursor = await readMeta(CURSOR_KEY, 0);
  const { changes: outgoing, keys } = await collectOutgoing(vault.key);
  const response = await api<SyncResponse>('/sync', { cursor, changes: outgoing });

  await syncClock(response.serverTime);
  await applyIncoming(response.changes, new Set(keys), vault.key);
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

export const requeueAll = async (): Promise<void> => {
  await local.transaction('rw', [local.families, local.accounts, local.categories, local.transactions, local.budgets, local.outbox], async () => {
    for (const table of syncTableNames) {
      for (const row of await tableOf(table).toArray()) {
        await local.outbox.put({ key: `${table}:${row.id}`, table, id: row.id });
      }
    }
  });
  requestSync();
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
