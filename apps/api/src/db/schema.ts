import { bigint, boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
  ciphertext: text('ciphertext'),
  legacy: jsonb('legacy').$type<Record<string, unknown> | null>(),
};

export const families = pgTable('families', { ...syncColumns }, (table) => [index('families_seq_idx').on(table.familyId, table.seq)]);

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

export const familyKeys = pgTable('family_keys', {
  familyId: uuid('family_id').primaryKey(),
  wrappedKey: text('wrapped_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable('accounts', { ...syncColumns }, (table) => [index('accounts_seq_idx').on(table.familyId, table.seq)]);

export const categories = pgTable('categories', { ...syncColumns }, (table) => [index('categories_seq_idx').on(table.familyId, table.seq)]);

export const transactions = pgTable('transactions', { ...syncColumns }, (table) => [index('transactions_seq_idx').on(table.familyId, table.seq)]);

export const budgets = pgTable('budgets', { ...syncColumns }, (table) => [index('budgets_seq_idx').on(table.familyId, table.seq)]);

export const syncedTables = { families, accounts, categories, transactions, budgets } as const;
