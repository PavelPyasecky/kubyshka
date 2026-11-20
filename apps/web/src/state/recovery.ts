import { readMeta, writeMeta } from '../db/local.ts';
import { createStore } from './store.ts';

const KEY = 'recoveryAck';

export const recoveryStore = createStore<'unknown' | 'pending' | 'done'>('unknown');

export const evaluateRecovery = async (): Promise<void> => {
  recoveryStore.set((await readMeta(KEY, true)) ? 'done' : 'pending');
};

export const markRecoveryPending = async (): Promise<void> => {
  await writeMeta(KEY, false);
  recoveryStore.set('pending');
};

export const acknowledgeRecovery = async (): Promise<void> => {
  await writeMeta(KEY, true);
  recoveryStore.set('done');
};
