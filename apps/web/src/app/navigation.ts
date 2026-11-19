import { createStore } from '../state/store.ts';

export type Tab = 'home' | 'transactions' | 'analytics' | 'more';
export type Overlay = { kind: 'entry' } | { kind: 'savings' } | { kind: 'limits' } | null;

export const tabStore = createStore<Tab>('home');
export const overlayStore = createStore<Overlay>(null);

export const openEntry = (): void => overlayStore.set({ kind: 'entry' });
export const openSavings = (): void => overlayStore.set({ kind: 'savings' });
export const openLimits = (): void => overlayStore.set({ kind: 'limits' });
export const closeOverlay = (): void => overlayStore.set(null);
