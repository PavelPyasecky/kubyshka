import { readMeta, writeMeta } from '../db/local.ts';
import { createStore } from './store.ts';

const KEY = 'onboarded';

export const onboardingStore = createStore<'unknown' | 'needed' | 'done'>('unknown');

export const evaluateOnboarding = async (): Promise<void> => {
  onboardingStore.set((await readMeta(KEY, false)) ? 'done' : 'needed');
};

export const skipOnboarding = async (): Promise<void> => {
  await writeMeta(KEY, true);
  onboardingStore.set('done');
};

export const finishOnboarding = skipOnboarding;
