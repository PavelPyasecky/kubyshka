import type { Budget, Category, Transaction } from './entities.ts';
import type { MonthKey } from './period.ts';
import { daysInMonth, elapsedDays, formatDay, lastMonths, monthKeyOf } from './period.ts';
import { formatMoney } from './money.ts';
import { spentByCategory } from './ledger.ts';
import type { SavingsSnapshot } from './savings.ts';

export type Insight = {
  id: string;
  tone: 'warn' | 'info';
  title: string;
  body: string;
  weight: number;
};

export type InsightInput = {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  savings: SavingsSnapshot;
  month: MonthKey;
  now: Date;
};

type Rule = (input: InsightInput) => Insight[];

/** Полосы приоритета: правило важнее любого правила из полосы ниже, как бы ни была велика его величина. */
const PRIORITY = { savings: 400, limit: 300, anomaly: 200, large: 100 };
const MAX_SEVERITY = 99;

const severity = (value: number, base: number): number => Math.min(MAX_SEVERITY, (value / Math.max(base, 1)) * 10);

const ANOMALY_RATIO = 1.4;
const ANOMALY_FLOOR = 100_000;
const LARGE_RATIO = 3;
const LARGE_FLOOR = 500_000;

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const ratio = (value: number, base: number): string => (value / base).toFixed(1).replace('.', ',');

const limitPace: Rule = ({ budgets, categories, transactions, month, now }) => {
  const spent = spentByCategory(transactions, month);
  const elapsed = Math.max(1, elapsedDays(month, now));
  const total = daysInMonth(month);

  return budgets
    .filter((budget) => !budget.deleted && budget.periodMonth === month && budget.amount > 0)
    .flatMap((budget) => {
      const used = spent.get(budget.categoryId) ?? 0;
      const perDay = used / elapsed;
      const projected = perDay * total;
      if (used === 0 || projected <= budget.amount) return [];

      const category = categories.find((item) => item.id === budget.categoryId);
      const exhaustionDay = Math.min(total, Math.ceil(budget.amount / perDay));

      return [
        {
          id: `limit:${budget.categoryId}`,
          tone: 'warn' as const,
          title: `${category?.name ?? 'Категория'}: ${formatMoney(used)} из ${formatMoney(budget.amount)}`,
          body:
            exhaustionDay <= elapsed
              ? 'Лимит уже исчерпан'
              : `При таком темпе лимит кончится ${formatDay(month, exhaustionDay)}`,
          weight: PRIORITY.limit + severity(projected, budget.amount),
        },
      ];
    });
};

const anomaly: Rule = ({ transactions, categories, month }) => {
  const current = spentByCategory(transactions, month);
  const history = lastMonths(month, 4).slice(0, 3).map((key) => spentByCategory(transactions, key));

  return [...current.entries()].flatMap(([categoryId, amount]) => {
    const previous = history.map((map) => map.get(categoryId) ?? 0).filter((value) => value > 0);
    if (previous.length < 2) return [];

    const usual = median(previous);
    if (usual === 0 || amount < usual * ANOMALY_RATIO || amount - usual < ANOMALY_FLOOR) return [];

    const category = categories.find((item) => item.id === categoryId);
    return [
      {
        id: `anomaly:${categoryId}`,
        tone: 'info' as const,
        title: `${category?.name ?? 'Категория'}: ${formatMoney(amount)}`,
        body: `В ${ratio(amount, usual)} раза больше, чем обычно за месяц`,
        weight: PRIORITY.anomaly + severity(amount, usual),
      },
    ];
  });
};

const savingsPace: Rule = ({ savings }) => {
  if (savings.norm <= 0 || savings.forecastSaved >= savings.norm) return [];

  const gap = savings.norm - savings.forecastSaved;
  return [
    {
      id: 'savings:pace',
      tone: 'warn',
      title:
        savings.forecastSaved < 0
          ? 'Расходы обгоняют доход'
          : `Отложится ${formatMoney(savings.forecastSaved)} вместо ${formatMoney(savings.norm)}`,
      body:
        savings.forecastSaved < 0
          ? 'При таком темпе месяц закончится в минусе'
          : `Не хватает ${formatMoney(gap)}, это ${formatMoney(Math.round(gap / 30))} в день`,
      weight: PRIORITY.savings + severity(gap, savings.norm),
    },
  ];
};

const largeExpense: Rule = ({ transactions, categories, month }) => {
  const inMonth = transactions.filter(
    (item) => !item.deleted && item.flow === 'expense' && monthKeyOf(new Date(item.occurredAt)) === month,
  );
  if (inMonth.length === 0) return [];

  const biggest = inMonth.reduce((max, item) => (item.amount > max.amount ? item : max));
  const peers = transactions
    .filter((item) => !item.deleted && item.flow === 'expense' && item.categoryId === biggest.categoryId)
    .map((item) => item.amount);

  if (peers.length < 4) return [];

  const usual = median(peers);
  if (usual === 0 || biggest.amount < Math.max(usual * LARGE_RATIO, LARGE_FLOOR)) return [];

  const category = categories.find((item) => item.id === biggest.categoryId);
  return [
    {
      id: `large:${biggest.id}`,
      tone: 'info',
      title: `Крупная трата: ${formatMoney(biggest.amount)}`,
      body: `${category?.name ?? 'Без категории'}, обычно около ${formatMoney(usual)}`,
      weight: PRIORITY.large + severity(biggest.amount, usual),
    },
  ];
};

const rules: Rule[] = [savingsPace, limitPace, anomaly, largeExpense];

export const buildInsights = (input: InsightInput): Insight[] =>
  rules.flatMap((rule) => rule(input)).sort((a, b) => b.weight - a.weight);
