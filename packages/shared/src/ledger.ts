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

const inMonth = (transaction: Transaction, month: MonthKey): boolean =>
  monthKeyOf(new Date(transaction.occurredAt)) === month;

const add = (totals: Map<string, Money>, key: string | null, amount: Money): void => {
  if (!key) return;
  totals.set(key, (totals.get(key) ?? 0) + amount);
};

export const spentByCategory = (transactions: Transaction[], month: MonthKey): Map<string, Money> => {
  const totals = new Map<string, Money>();

  for (const transaction of alive(transactions)) {
    if (transaction.flow !== 'expense' || !inMonth(transaction, month)) continue;
    add(totals, transaction.categoryId, transaction.amount);
  }

  return totals;
};

export const spentByMember = (transactions: Transaction[], month: MonthKey): Map<string, Money> => {
  const totals = new Map<string, Money>();

  for (const transaction of alive(transactions)) {
    if (transaction.flow !== 'expense' || !inMonth(transaction, month)) continue;
    add(totals, transaction.memberId, transaction.amount);
  }

  return totals;
};

export const spentByAccount = (transactions: Transaction[], month: MonthKey): Map<string, Money> => {
  const totals = new Map<string, Money>();

  for (const transaction of alive(transactions)) {
    if (transaction.flow !== 'expense' || !inMonth(transaction, month)) continue;
    add(totals, transaction.accountId, transaction.amount);
  }

  return totals;
};

export const topExpenses = (transactions: Transaction[], month: MonthKey, limit = 10): Transaction[] =>
  alive(transactions)
    .filter((transaction) => transaction.flow === 'expense' && inMonth(transaction, month))
    .sort((a, b) => b.amount - a.amount || b.occurredAt - a.occurredAt)
    .slice(0, limit);

export const fullestSpendingAccount = (accounts: Account[], balances: Map<string, Money>): Account | undefined => {
  let best: Account | undefined;

  for (const account of alive(accounts)) {
    if (account.archived || account.kind === 'savings') continue;
    if (!best) {
      best = account;
      continue;
    }

    const balance = balances.get(account.id) ?? 0;
    const bestBalance = balances.get(best.id) ?? 0;
    if (balance > bestBalance || (balance === bestBalance && account.sort < best.sort)) best = account;
  }

  return best;
};

export type SavingsMovement = { transferred: Money; delta: Money };

export const savingsMovement = (accounts: Account[], transactions: Transaction[], month: MonthKey): SavingsMovement => {
  const savingsIds = new Set(alive(accounts).filter((account) => account.kind === 'savings').map((account) => account.id));
  let transferred: Money = 0;
  let delta: Money = 0;

  for (const transaction of alive(transactions)) {
    if (!inMonth(transaction, month)) continue;

    for (const accountId of [transaction.accountId, transaction.counterAccountId]) {
      if (accountId && savingsIds.has(accountId)) delta += signedFor(transaction, accountId);
    }

    if (transaction.flow !== 'transfer' || !transaction.counterAccountId) continue;
    const into = savingsIds.has(transaction.counterAccountId);
    const outOf = savingsIds.has(transaction.accountId);
    if (into && !outOf) transferred += transaction.amount;
    if (outOf && !into) transferred -= transaction.amount;
  }

  return { transferred, delta };
};

export const untransferred = (saved: Money, transferred: Money): Money => {
  const gap = saved - transferred;
  return gap > 0 ? gap : 0;
};
