import { useLiveQuery } from 'dexie-react-hooks';
import type { Account, Category, Family, Transaction } from '@kubyshka/shared';
import { local } from '../db/local.ts';

const alive = <T extends { deleted: boolean }>(items: T[]): T[] => items.filter((item) => !item.deleted);

export const useAccounts = (): Account[] =>
  useLiveQuery(async () => alive(await local.accounts.toArray()).sort((a, b) => a.sort - b.sort), [], []);

export const useCategories = (): Category[] =>
  useLiveQuery(async () => alive(await local.categories.toArray()).sort((a, b) => a.sort - b.sort), [], []);

export const useTransactions = (): Transaction[] =>
  useLiveQuery(async () => alive(await local.transactions.toArray()).sort((a, b) => b.occurredAt - a.occurredAt), [], []);

export const useFamily = (): Family | undefined =>
  useLiveQuery(async () => (await local.families.toArray())[0], [], undefined);

export const byId = <T extends { id: string }>(items: T[]): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]));
