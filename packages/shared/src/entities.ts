import { z } from 'zod';

const id = z.string().uuid();
const money = z.number().int();
const timestamp = z.number().int().nonnegative();

export const syncableShape = {
  id,
  familyId: id,
  updatedAt: timestamp,
  updatedBy: id.nullable(),
  deleted: z.boolean(),
  seq: z.number().int().nonnegative(),
};

export const accountKinds = ['cash', 'debit', 'credit', 'savings'] as const;
export const accountScopes = ['shared', 'personal'] as const;
export const flows = ['expense', 'income', 'transfer'] as const;

export const familySchema = z.object({
  ...syncableShape,
  name: z.string().min(1).max(60),
  savingsNorm: money.nonnegative(),
  expectedIncome: money.nonnegative(),
});

export const accountSchema = z.object({
  ...syncableShape,
  name: z.string().min(1).max(40),
  kind: z.enum(accountKinds),
  scope: z.enum(accountScopes),
  ownerMemberId: id.nullable(),
  openingBalance: money,
  creditLimit: money.nullable(),
  icon: z.string().max(8),
  color: z.string().max(9),
  sort: z.number().int(),
  archived: z.boolean(),
});

export const categorySchema = z.object({
  ...syncableShape,
  name: z.string().min(1).max(40),
  flow: z.enum(['expense', 'income']),
  icon: z.string().max(8),
  color: z.string().max(9),
  sort: z.number().int(),
  archived: z.boolean(),
});

export const transactionSchema = z.object({
  ...syncableShape,
  flow: z.enum(flows),
  amount: money.positive(),
  accountId: id,
  counterAccountId: id.nullable(),
  categoryId: id.nullable(),
  memberId: id,
  occurredAt: timestamp,
  note: z.string().max(200),
  tags: z.array(z.string().max(30)),
});

export const budgetSchema = z.object({
  ...syncableShape,
  categoryId: id,
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/),
  amount: money.nonnegative(),
});

export type Family = z.infer<typeof familySchema>;
export type Account = z.infer<typeof accountSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type Syncable = { [K in keyof typeof syncableShape]: z.infer<(typeof syncableShape)[K]> };

export const syncTables = {
  families: familySchema,
  accounts: accountSchema,
  categories: categorySchema,
  transactions: transactionSchema,
  budgets: budgetSchema,
} as const;

/** На сервер уходит только конверт. Содержимое записи сидит внутри ciphertext. */
export const syncEnvelopeSchema = z.object({
  id,
  familyId: id,
  updatedAt: timestamp,
  updatedBy: id.nullable(),
  deleted: z.boolean(),
  ciphertext: z.string().min(1).max(100_000),
});

const batch = z.array(syncEnvelopeSchema).default([]);

export const syncRequestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  changes: z.object({
    families: batch,
    accounts: batch,
    categories: batch,
    transactions: batch,
    budgets: batch,
  }),
});
