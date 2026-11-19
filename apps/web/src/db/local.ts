import Dexie, { type Table } from 'dexie';
import type { Account, Budget, Category, Family, SyncTable, Transaction } from '@kubyshka/shared';

export type OutboxEntry = { key: string; table: SyncTable; id: string };
export type MetaEntry = { key: string; value: unknown };

class LocalDatabase extends Dexie {
  families!: Table<Family, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super('kubyshka');
    this.version(1).stores({
      families: 'id',
      accounts: 'id, sort',
      categories: 'id, flow, sort',
      transactions: 'id, occurredAt, categoryId, accountId',
      budgets: 'id, periodMonth',
      outbox: 'key',
      meta: 'key',
    });
  }
}

export const local = new LocalDatabase();

export const readMeta = async <T>(key: string, fallback: T): Promise<T> => {
  const row = await local.meta.get(key);
  return row ? (row.value as T) : fallback;
};

export const writeMeta = async (key: string, value: unknown): Promise<void> => {
  await local.meta.put({ key, value });
};
