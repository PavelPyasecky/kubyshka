import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const syncColumns = {
  id: uuid('id').primaryKey(),
  familyId: uuid('family_id').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  updatedBy: uuid('updated_by'),
  deleted: boolean('deleted').notNull().default(false),
  seq: bigint('seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
};

export const families = pgTable(
  'families',
  {
    ...syncColumns,
    name: text('name').notNull(),
    savingsNorm: bigint('savings_norm', { mode: 'number' }).notNull().default(0),
    expectedIncome: bigint('expected_income', { mode: 'number' }).notNull().default(0),
  },
  (table) => [index('families_seq_idx').on(table.familyId, table.seq)],
);

export const members = pgTable('members', {
  id: uuid('id').primaryKey(),
  familyId: uuid('family_id').notNull(),
  name: text('name').notNull(),
  pinHash: text('pin_hash').notNull(),
  color: text('color').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  memberId: uuid('member_id').notNull(),
  label: text('label').notNull(),
  tokenHash: text('token_hash').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey(),
  familyId: uuid('family_id').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
});

export const accounts = pgTable(
  'accounts',
  {
    ...syncColumns,
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    scope: text('scope').notNull(),
    ownerMemberId: uuid('owner_member_id'),
    openingBalance: bigint('opening_balance', { mode: 'number' }).notNull().default(0),
    creditLimit: bigint('credit_limit', { mode: 'number' }),
    icon: text('icon').notNull().default(''),
    color: text('color').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    archived: boolean('archived').notNull().default(false),
  },
  (table) => [index('accounts_seq_idx').on(table.familyId, table.seq)],
);

export const categories = pgTable(
  'categories',
  {
    ...syncColumns,
    name: text('name').notNull(),
    flow: text('flow').notNull(),
    icon: text('icon').notNull().default(''),
    color: text('color').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    archived: boolean('archived').notNull().default(false),
  },
  (table) => [index('categories_seq_idx').on(table.familyId, table.seq)],
);

export const transactions = pgTable(
  'transactions',
  {
    ...syncColumns,
    flow: text('flow').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    accountId: uuid('account_id').notNull(),
    counterAccountId: uuid('counter_account_id'),
    categoryId: uuid('category_id'),
    memberId: uuid('member_id').notNull(),
    occurredAt: bigint('occurred_at', { mode: 'number' }).notNull(),
    note: text('note').notNull().default(''),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
  },
  (table) => [index('transactions_seq_idx').on(table.familyId, table.seq)],
);

export const budgets = pgTable(
  'budgets',
  {
    ...syncColumns,
    categoryId: uuid('category_id').notNull(),
    periodMonth: text('period_month').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('budgets_seq_idx').on(table.familyId, table.seq),
    uniqueIndex('budgets_period_idx').on(table.familyId, table.categoryId, table.periodMonth),
  ],
);

export const syncedTables = { families, accounts, categories, transactions, budgets } as const;
