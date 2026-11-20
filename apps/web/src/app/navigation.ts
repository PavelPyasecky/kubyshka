import type { Transaction } from '@kubyshka/shared';
import { createStore } from '../state/store.ts';

export type Tab = 'home' | 'transactions' | 'analytics' | 'more';

export type EntrySeed = {
  id?: string;
  flow?: Transaction['flow'];
  amount?: number;
  accountId?: string;
  counterAccountId?: string | null;
  categoryId?: string | null;
  memberId?: string;
  occurredAt?: number;
  note?: string;
  tags?: string[];
};

export type Overlay =
  | { kind: 'savings' }
  | { kind: 'limits' }
  | { kind: 'transaction'; id: string }
  | { kind: 'accounts' }
  | { kind: 'categories' }
  | { kind: 'invite' }
  | { kind: 'recovery' }
  | null;

export const tabStore = createStore<Tab>('home');
export const overlayStore = createStore<Overlay>(null);
export const entryStore = createStore<EntrySeed | null>(null);

export const openEntry = (seed: EntrySeed = {}): void => entryStore.set(seed);
export const closeEntry = (): void => entryStore.set(null);
export const openSavings = (): void => overlayStore.set({ kind: 'savings' });
export const openLimits = (): void => overlayStore.set({ kind: 'limits' });
export const openTransaction = (id: string): void => overlayStore.set({ kind: 'transaction', id });
export const openAccounts = (): void => overlayStore.set({ kind: 'accounts' });
export const openCategories = (): void => overlayStore.set({ kind: 'categories' });
export const openInvite = (): void => overlayStore.set({ kind: 'invite' });
export const openRecovery = (): void => overlayStore.set({ kind: 'recovery' });
export const closeOverlay = (): void => overlayStore.set(null);
