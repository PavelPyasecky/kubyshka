import { readMeta, writeMeta } from '../db/local.ts';

const OFFSET_KEY = 'clockOffset';
let offset = 0;

export const loadClock = async (): Promise<void> => {
  offset = await readMeta(OFFSET_KEY, 0);
};

export const syncClock = async (serverTime: number): Promise<void> => {
  const next = serverTime - Date.now();
  if (Math.abs(next - offset) < 1000) return;
  offset = next;
  await writeMeta(OFFSET_KEY, next);
};

export const now = (): number => Date.now() + offset;
