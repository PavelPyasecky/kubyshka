import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInsights } from './insights.ts';
import { savingsSnapshot } from './savings.ts';
import { formatMoney, minorToRaw, parseAmount, sharePercent, toMinor } from './money.ts';
import {
  accountBalances,
  fullestSpendingAccount,
  savingsMovement,
  topExpenses,
  totalBalance,
  untransferred,
} from './ledger.ts';
import { shouldApplyRemote } from './merge.ts';
import { syncRetryDelay } from './retry.ts';
import { buildSuggestionIndex, offeredCategories, suggestCategories } from './suggest.ts';
import type { Account, Budget, Category, Transaction } from './entities.ts';

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

const account = (id: string, kind: Account['kind'], rubles: number, sort = 0, archived = false): Account => ({
  id,
  familyId: 'family',
  updatedAt: 0,
  updatedBy: null,
  deleted: false,
  seq: 0,
  name: id,
  kind,
  scope: 'shared',
  ownerMemberId: null,
  openingBalance: toMinor(rubles),
  creditLimit: null,
  icon: '•',
  color: '#15724C',
  sort,
  archived,
});

const transfer = (rubles: number, from: string, to: string, date = 6): Transaction => ({
  ...entry('transfer', rubles, date, 'food'),
  id: `transfer-${from}-${to}-${rubles}`,
  accountId: from,
  counterAccountId: to,
  categoryId: null,
});

test('перевод уменьшает счёт списания и увеличивает счёт зачисления', () => {
  const accounts = [account('card', 'debit', 10_000), account('pot', 'savings', 1_000)];
  const balances = accountBalances(accounts, [transfer(3_000, 'card', 'pot')]);

  assert.equal(balances.get('card'), toMinor(7_000));
  assert.equal(balances.get('pot'), toMinor(4_000));
  assert.equal(totalBalance(accounts, [transfer(3_000, 'card', 'pot')]), toMinor(11_000));
});

test('расход и доход двигают только свой счёт', () => {
  const accounts = [account('card', 'debit', 10_000), account('cash', 'cash', 500)];
  const balances = accountBalances(accounts, [
    { ...entry('expense', 1_500, 4), accountId: 'card' },
    { ...entry('income', 200, 5), accountId: 'cash' },
  ]);

  assert.equal(balances.get('card'), toMinor(8_500));
  assert.equal(balances.get('cash'), toMinor(700));
});

test('разрыв копилки — это отложенное минус переведённое в этом месяце', () => {
  const accounts = [account('card', 'debit', 50_000), account('pot', 'savings', 10_000)];
  const transactions = [entry('income', 80_000, 2), entry('expense', 20_000, 3), transfer(15_000, 'card', 'pot', 4)];
  const movement = savingsMovement(accounts, transactions, MONTH);

  assert.equal(movement.transferred, toMinor(15_000));
  assert.equal(movement.delta, toMinor(15_000));
  assert.equal(untransferred(toMinor(60_000), movement.transferred), toMinor(45_000));
  assert.equal(untransferred(toMinor(10_000), movement.transferred), 0);
});

test('для перевода выбирается самый полный расчётный счёт', () => {
  const accounts = [
    account('cash', 'cash', 1_000, 0),
    account('card', 'debit', 40_000, 1),
    account('pot', 'savings', 200_000, 2),
    account('old', 'debit', 90_000, 3, true),
  ];
  const balances = accountBalances(accounts, []);

  assert.equal(fullestSpendingAccount(accounts, balances)?.id, 'card');
});

test('крупные траты периода идут по убыванию суммы', () => {
  const found = topExpenses(
    [entry('expense', 100, 2), entry('expense', 900, 3), entry('income', 5_000, 4), entry('expense', 400, 1)],
    MONTH,
    2,
  );

  assert.deepEqual(
    found.map((item) => item.amount),
    [toMinor(900), toMinor(400)],
  );
});

test('подсказка ставит недавнюю и частую категорию выше старой и разовой', () => {
  const at = (dayOfMonth: number, hour = 12) => new Date(2026, 10, dayOfMonth, hour).getTime();
  const spend = (categoryId: string, dayOfMonth: number, index: number): Transaction => ({
    ...entry('expense', 1_000, dayOfMonth, categoryId),
    id: `${categoryId}-${index}`,
    occurredAt: at(dayOfMonth),
  });

  const history = [
    ...Array.from({ length: 6 }, (_, index) => spend('food', 18 - (index % 2), index)),
    ...Array.from({ length: 6 }, (_, index) => ({ ...spend('cafe', 1, index), occurredAt: new Date(2026, 8, 20, 12).getTime() })),
    spend('taxi', 18, 0),
  ];

  const ranked = suggestCategories(buildSuggestionIndex(history, NOW), { amount: toMinor(1_000), now: NOW }, 3);

  assert.equal(ranked[0], 'food');
  assert.ok(ranked.indexOf('food') < ranked.indexOf('cafe'));
  assert.ok(ranked.indexOf('food') < ranked.indexOf('taxi'));
});

test('архивная категория не попадает в предложения', () => {
  const roster: Category[] = [
    { ...categories[0], id: 'old', name: 'Старая', archived: true, sort: 0 },
    { ...categories[0], id: 'food', archived: false, sort: 1 },
    { ...categories[0], id: 'cafe', name: 'Кафе', archived: false, sort: 2 },
  ];

  assert.deepEqual(offeredCategories(['old', 'cafe'], roster, 'expense', 2), ['cafe', 'food']);
});

test('локальная правка новее серверной не затирается ответом', () => {
  assert.equal(shouldApplyRemote({ pending: true, localUpdatedAt: 2_000, remoteUpdatedAt: 1_000 }), false);
});

test('более свежая серверная запись заменяет локальную', () => {
  assert.equal(shouldApplyRemote({ pending: true, localUpdatedAt: 1_000, remoteUpdatedAt: 2_000 }), true);
  assert.equal(shouldApplyRemote({ pending: true, localUpdatedAt: 1_000, remoteUpdatedAt: 1_000 }), true);
  assert.equal(shouldApplyRemote({ pending: false, localUpdatedAt: 2_000, remoteUpdatedAt: 1_000 }), true);
});

test('повтор синхронизации удлиняет паузу до минуты', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(syncRetryDelay), [2_000, 5_000, 15_000, 60_000, 60_000]);
});

test('сумма в копейках переживает строку клавиатуры', () => {
  assert.equal(minorToRaw(124_050), '1240,50');
  assert.equal(parseAmount(minorToRaw(124_050)), 124_050);
  assert.equal(sharePercent(toMinor(32), toMinor(100)), 32);
});
