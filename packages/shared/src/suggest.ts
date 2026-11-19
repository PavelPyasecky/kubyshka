import type { Transaction } from './entities.ts';

const HISTORY_SIZE = 500;
const RECENT_WINDOW_DAYS = 90;
const DAY = 86_400_000;

const WEIGHTS = {
  frequency: 1,
  recency: 0.8,
  amount: 0.6,
  hour: 0.4,
  weekday: 0.2,
};

type Candidate = {
  categoryId: string;
  count: number;
  lastAt: number;
  amounts: number[];
  hours: number[];
  weekdays: number[];
};

export type SuggestionContext = { amount: number; now: Date };

const closeness = (value: number, samples: number[], tolerance: number): number => {
  if (samples.length === 0) return 0;
  const best = samples.reduce((min, sample) => Math.min(min, Math.abs(sample - value)), Infinity);
  return Math.max(0, 1 - best / tolerance);
};

const cyclicCloseness = (value: number, samples: number[], span: number): number => {
  if (samples.length === 0) return 0;
  const best = samples.reduce((min, sample) => {
    const raw = Math.abs(sample - value);
    return Math.min(min, Math.min(raw, span - raw));
  }, Infinity);
  return Math.max(0, 1 - best / (span / 2));
};

export const buildSuggestionIndex = (transactions: Transaction[], now: Date): Candidate[] => {
  const since = now.getTime() - RECENT_WINDOW_DAYS * DAY;
  const byCategory = new Map<string, Candidate>();

  const recent = transactions
    .filter((item) => !item.deleted && item.flow === 'expense' && item.categoryId && item.occurredAt >= since)
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, HISTORY_SIZE);

  for (const transaction of recent) {
    const date = new Date(transaction.occurredAt);
    const candidate = byCategory.get(transaction.categoryId!) ?? {
      categoryId: transaction.categoryId!,
      count: 0,
      lastAt: 0,
      amounts: [],
      hours: [],
      weekdays: [],
    };

    candidate.count += 1;
    candidate.lastAt = Math.max(candidate.lastAt, transaction.occurredAt);
    candidate.amounts.push(transaction.amount);
    candidate.hours.push(date.getHours());
    candidate.weekdays.push(date.getDay());
    byCategory.set(candidate.categoryId, candidate);
  }

  return [...byCategory.values()];
};

export const suggestCategories = (
  index: Candidate[],
  context: SuggestionContext,
  limit = 6,
): string[] => {
  if (index.length === 0) return [];

  const maxCount = Math.max(...index.map((candidate) => candidate.count));
  const hour = context.now.getHours();
  const weekday = context.now.getDay();

  return index
    .map((candidate) => {
      const ageDays = (context.now.getTime() - candidate.lastAt) / DAY;
      const score =
        WEIGHTS.frequency * (candidate.count / maxCount) +
        WEIGHTS.recency * Math.max(0, 1 - ageDays / RECENT_WINDOW_DAYS) +
        WEIGHTS.amount * closeness(context.amount, candidate.amounts, Math.max(context.amount, 100_00)) +
        WEIGHTS.hour * cyclicCloseness(hour, candidate.hours, 24) +
        WEIGHTS.weekday * cyclicCloseness(weekday, candidate.weekdays, 7);

      return { categoryId: candidate.categoryId, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.categoryId);
};
