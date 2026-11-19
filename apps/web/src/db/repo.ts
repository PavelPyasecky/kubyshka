import type { Account, Budget, Category, Family, SyncTable, Syncable, Transaction } from '@kubyshka/shared';
import { local } from './local.ts';
import { now } from '../sync/clock.ts';
import { session } from '../state/session.ts';
import { requestSync } from '../sync/engine.ts';

type EntityOf = {
  families: Family;
  accounts: Account;
  categories: Category;
  transactions: Transaction;
  budgets: Budget;
};

type Draft<T> = Omit<T, keyof Syncable> & Partial<Syncable>;

const tableOf = (table: SyncTable) =>
  local[table] as unknown as {
    get: (id: string) => Promise<Syncable | undefined>;
    put: (value: unknown) => Promise<unknown>;
  };

export const persist = async <K extends SyncTable>(table: K, draft: Draft<EntityOf[K]>): Promise<string> => {
  const id = draft.id ?? crypto.randomUUID();

  const entity = {
    ...draft,
    id,
    familyId: session.familyId,
    updatedAt: now(),
    updatedBy: session.memberId,
    deleted: draft.deleted ?? false,
    seq: draft.seq ?? 0,
  };

  await local.transaction('rw', local[table], local.outbox, async () => {
    await tableOf(table).put(entity);
    await local.outbox.put({ key: `${table}:${id}`, table, id });
  });

  requestSync();
  return id;
};

export const softDelete = async (table: SyncTable, id: string): Promise<void> => {
  const existing = await tableOf(table).get(id);
  if (existing) await persist(table, { ...existing, deleted: true } as Draft<EntityOf[SyncTable]>);
};
