import type { Account, Budget, Category, Family, Transaction } from './entities.ts';

/** Без зависимости от zod: этот модуль попадает в клиентский бандл. */
export const syncTableNames = ['families', 'accounts', 'categories', 'transactions', 'budgets'] as const;

export type SyncTable = (typeof syncTableNames)[number];

export type SyncChanges = {
  families: Family[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
};

export type SyncRequest = { cursor: number; changes: SyncChanges };
export type SyncResponse = { cursor: number; serverTime: number; changes: SyncChanges };

export const emptyChanges = (): SyncChanges => ({
  families: [],
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
});
