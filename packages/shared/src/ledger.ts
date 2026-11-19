import type { Money } from './money.ts';
import type { Account, Transaction } from './entities.ts';
import type { MonthKey } from './period.ts';
import { monthKeyOf } from './period.ts';

const alive = <T extends { deleted: boolean }>(items: T[]): T[] => items.filter((item) => !item.deleted);

const signedFor = (transaction: Transaction, accountId: string): Money => {
  if (transaction.flow === 'income') return transaction.amount;
  if (transaction.flow === 'expense') return -transaction.amount;
  return transaction.accountId === accountId ? -transaction.amount : transaction.amount;
};

export const accountBalances = (accounts: Account[], transactions: Transaction[]): Map<string, Money> => {
  const balances = new Map(alive(accounts).map((account) => [account.id, account.openingBalance]));

  for (const transaction of alive(transactions)) {
    for (const accountId of [transaction.accountId, transaction.counterAccountId]) {
      if (!accountId || !balances.has(accountId)) continue;
      balances.set(accountId, balances.get(accountId)! + signedFor(transaction, accountId));
    }
  }

  return balances;
};

export const totalBalance = (accounts: Account[], transactions: Transaction[]): Money =>
  [...accountBalances(accounts, transactions).values()].reduce((sum, value) => sum + value, 0);

export const savingsBalance = (accounts: Account[], transactions: Transaction[]): Money => {
  const balances = accountBalances(accounts, transactions);
  return alive(accounts)
    .filter((account) => account.kind === 'savings')
    .reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0);
};

export const spentByCategory = (transactions: Transaction[], month: MonthKey): Map<string, Money> => {
  const totals = new Map<string, Money>();

  for (const transaction of alive(transactions)) {
    if (transaction.flow !== 'expense' || !transaction.categoryId) continue;
    if (monthKeyOf(new Date(transaction.occurredAt)) !== month) continue;
    totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0) + transaction.amount);
  }

  return totals;
};
