import type { SyncTable, Syncable } from '@kubyshka/shared';
import { local } from './local.ts';
import { now } from '../sync/clock.ts';
import { session } from '../state/session.ts';
import { requestSync } from '../sync/engine.ts';

type Draft<T> = Omit<T, keyof Syncable> & Partial<Pick<Syncable, 'id'>>;

const tableOf = (table: SyncTable) => local[table] as unknown as { put: (value: unknown) => Promise<unknown> };

export const persist = async <T extends Syncable>(table: SyncTable, draft: Draft<T> | T): Promise<string> => {
  const id = 'id' in draft && draft.id ? draft.id : crypto.randomUUID();

  const entity = {
    ...draft,
    id,
    familyId: session.familyId,
    updatedAt: now(),
    updatedBy: session.memberId,
    deleted: 'deleted' in draft ? draft.deleted : false,
    seq: 0,
  };

  await local.transaction('rw', local[table], local.outbox, async () => {
    await tableOf(table).put(entity);
    await local.outbox.put({ key: `${table}:${id}`, table, id });
  });

  void requestSync();
  return id;
};

export const softDelete = async (table: SyncTable, id: string): Promise<void> => {
  const existing = await (local[table] as unknown as { get: (id: string) => Promise<Syncable | undefined> }).get(id);
  if (!existing) return;
  await persist(table, { ...existing, deleted: true });
};
