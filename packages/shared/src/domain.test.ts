import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInsights } from './insights.ts';
import { savingsSnapshot } from './savings.ts';
import { formatMoney, toMinor } from './money.ts';
import type { Budget, Category, Transaction } from './entities.ts';

const MONTH = '2026-11';
const NOW = new Date(2026, 10, 19, 12);
const day = (date: number) => new Date(2026, 10, date, 10).getTime();

const entry = (flow: Transaction['flow'], rubles: number, date: number, categoryId = 'food'): Transaction =>
  ({
    id: `${flow}-${date}-${rubles}`,
    familyId: 'family',
    updatedAt: 0,
    updatedBy: null,
    deleted: false,
    seq: 0,
    flow,
    amount: toMinor(rubles),
    accountId: 'account',
    counterAccountId: null,
    categoryId,
    memberId: 'member',
    occurredAt: day(date),
    note: '',
    tags: [],
  }) satisfies Transaction;

const snapshotOf = (entries: Transaction[], expectedIncome: number, norm: number) =>
  savingsSnapshot({ entries, month: MONTH, now: NOW, expectedIncome: toMinor(expectedIncome), norm: toMinor(norm) });

test('отложенное — это разница между доходами и расходами месяца', () => {
  const snapshot = snapshotOf([entry('income', 142_000, 5), entry('expense', 62_400, 10)], 142_000, 40_000);

  assert.equal(snapshot.income, toMinor(142_000));
  assert.equal(snapshot.expense, toMinor(62_400));
  assert.equal(snapshot.saved, toMinor(79_600));
});

test('перевод между счетами не влияет на отложенное', () => {
  const withTransfer = snapshotOf([entry('income', 100_000, 5), entry('transfer', 30_000, 6)], 100_000, 10_000);

  assert.equal(withTransfer.saved, toMinor(100_000));
});

test('до прихода зарплаты прогноз опирается на ожидаемый доход', () => {
  const snapshot = snapshotOf([entry('expense', 19_000, 10)], 142_000, 40_000);

  assert.equal(snapshot.saved, toMinor(-19_000));
  // 19 000 за 19 дней — это 1 000 в день, то есть 30 000 за месяц.
  assert.equal(snapshot.forecastExpense, toMinor(30_000));
  assert.equal(snapshot.forecastSaved, toMinor(112_000));
});

test('фактический доход побеждает ожидаемый, когда он больше', () => {
  const snapshot = snapshotOf([entry('income', 180_000, 5), entry('expense', 19_000, 10)], 142_000, 40_000);

  assert.equal(snapshot.forecastSaved, toMinor(150_000));
});

test('прогноз округляется до рублей', () => {
  const snapshot = snapshotOf([entry('expense', 1_240, 10)], 142_000, 40_000);

  assert.equal(snapshot.forecastSaved % 100, 0);
  assert.ok(!formatMoney(snapshot.forecastSaved).includes(','));
});

const categories: Category[] = [
  {
    id: 'food',
    familyId: 'family',
    updatedAt: 0,
    updatedBy: null,
    deleted: false,
    seq: 0,
    name: 'Продукты',
    flow: 'expense',
    icon: '🛒',
    color: '#15724C',
    sort: 0,
    archived: false,
  },
];

const budget = (rubles: number): Budget => ({
  id: 'budget',
  familyId: 'family',
  updatedAt: 0,
  updatedBy: null,
  deleted: false,
  seq: 0,
  categoryId: 'food',
  periodMonth: MONTH,
  amount: toMinor(rubles),
});

const insightsFor = (transactions: Transaction[], budgets: Budget[], norm: number, expectedIncome = 142_000) =>
  buildInsights({
    transactions,
    categories,
    budgets,
    savings: snapshotOf(transactions, expectedIncome, norm),
    month: MONTH,
    now: NOW,
  });

test('темп трат предупреждает до того, как лимит исчерпан', () => {
  const found = insightsFor([entry('expense', 8_900, 15)], [budget(9_000)], 0);

  assert.equal(found.length, 1);
  assert.match(found[0].title, /Продукты/);
  assert.match(found[0].body, /лимит кончится 20 ноября/);
});

test('при укладывающемся темпе предупреждения нет', () => {
  assert.deepEqual(insightsFor([entry('expense', 3_000, 15)], [budget(9_000)], 0), []);
});

test('отставание от нормы поднимается выше остальных рекомендаций', () => {
  const found = insightsFor([entry('expense', 100_000, 10)], [budget(9_000)], 40_000);

  assert.equal(found[0].id, 'savings:pace');
  assert.match(found[0].title, /Расходы обгоняют доход/);
});
