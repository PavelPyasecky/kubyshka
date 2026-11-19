import type { Money } from './money.ts';
import type { MonthKey } from './period.ts';
import { daysInMonth, elapsedDays, monthKeyOf } from './period.ts';
import type { Transaction } from './entities.ts';

export type LedgerEntry = Pick<Transaction, 'flow' | 'amount' | 'occurredAt' | 'deleted'>;

export type SavingsSnapshot = {
  income: Money;
  expense: Money;
  saved: Money;
  forecastExpense: Money;
  forecastSaved: Money;
  norm: Money;
  normProgress: number;
};

const inMonth = (entry: LedgerEntry, month: MonthKey): boolean =>
  !entry.deleted && monthKeyOf(new Date(entry.occurredAt)) === month;

const sumFlow = (entries: LedgerEntry[], month: MonthKey, flow: Transaction['flow']): Money =>
  entries.reduce((total, entry) => (inMonth(entry, month) && entry.flow === flow ? total + entry.amount : total), 0);

export const savingsSnapshot = (input: {
  entries: LedgerEntry[];
  month: MonthKey;
  now: Date;
  expectedIncome: Money;
  norm: Money;
}): SavingsSnapshot => {
  const { entries, month, now, expectedIncome, norm } = input;
  const income = sumFlow(entries, month, 'income');
  const expense = sumFlow(entries, month, 'expense');

  const elapsed = Math.max(1, elapsedDays(month, now));
  // Прогноз округляется до рублей: копейки в оценке создают ложную точность.
  const forecastExpense = Math.round((expense / elapsed) * daysInMonth(month) / 100) * 100;
  const forecastIncome = Math.max(income, expectedIncome);
  const forecastSaved = forecastIncome - forecastExpense;

  return {
    income,
    expense,
    saved: income - expense,
    forecastExpense,
    forecastSaved,
    norm,
    normProgress: norm > 0 ? forecastSaved / norm : 0,
  };
};

export const savedByMonth = (entries: LedgerEntry[], months: MonthKey[]): Map<MonthKey, Money> =>
  new Map(months.map((month) => [month, sumFlow(entries, month, 'income') - sumFlow(entries, month, 'expense')]));

export const averageSaved = (entries: LedgerEntry[], months: MonthKey[]): Money => {
  if (months.length === 0) return 0;
  const total = [...savedByMonth(entries, months).values()].reduce((sum, value) => sum + value, 0);
  return Math.round(total / months.length);
};
