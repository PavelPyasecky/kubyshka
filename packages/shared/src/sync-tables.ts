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
export type SyncResponse = { cursor: number; serverTime: number; changes: SyncBatch };

export const emptyChanges = (): SyncChanges => ({
  families: [],
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
});

export const syncMetaKeys = ['id', 'familyId', 'updatedAt', 'updatedBy', 'deleted', 'seq'] as const;

/** Поля, которые уезжают в ciphertext. Список сверяется тестом со схемами сущностей. */
export const contentKeys = {
  families: ['name', 'savingsNorm', 'expectedIncome'],
  accounts: ['name', 'kind', 'scope', 'ownerMemberId', 'openingBalance', 'creditLimit', 'icon', 'color', 'sort', 'archived'],
  categories: ['name', 'flow', 'icon', 'color', 'sort', 'archived'],
  transactions: ['flow', 'amount', 'accountId', 'counterAccountId', 'categoryId', 'memberId', 'occurredAt', 'note', 'tags'],
  budgets: ['categoryId', 'periodMonth', 'amount'],
} as const satisfies Record<SyncTable, readonly string[]>;

export type SyncEnvelope = {
  id: string;
  familyId: string;
  updatedAt: number;
  updatedBy: string | null;
  deleted: boolean;
  seq: number;
  ciphertext: string | null;
  legacy: Record<string, unknown> | null;
};

export type SyncBatch = Record<SyncTable, SyncEnvelope[]>;

export const emptyBatch = (): SyncBatch => ({
  families: [],
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
});
