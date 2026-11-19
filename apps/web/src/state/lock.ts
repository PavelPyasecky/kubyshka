import { readMeta, writeMeta } from '../db/local.ts';
import { createStore } from './store.ts';

const PIN_KEY = 'pinDigest';
const UNLOCK_KEY = 'unlockedAt';
const LOCK_AFTER_MS = 24 * 60 * 60 * 1000;
const ITERATIONS = 150_000;

type Digest = { salt: string; hash: string };

export const lockStore = createStore<'unknown' | 'locked' | 'open'>('unknown');

const encode = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const derive = async (pin: string, salt: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return encode(bits);
};

export const rememberPin = async (pin: string): Promise<void> => {
  const salt = encode(crypto.getRandomValues(new Uint8Array(16)).buffer);
  await writeMeta(PIN_KEY, { salt, hash: await derive(pin, salt) } satisfies Digest);
  await unlock();
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  const digest = await readMeta<Digest | null>(PIN_KEY, null);
  if (!digest) return false;
  return (await derive(pin, digest.salt)) === digest.hash;
};

export const unlock = async (): Promise<void> => {
  await writeMeta(UNLOCK_KEY, Date.now());
  lockStore.set('open');
};

export const evaluateLock = async (): Promise<void> => {
  const digest = await readMeta<Digest | null>(PIN_KEY, null);
  if (!digest) {
    lockStore.set('open');
    return;
  }

  const unlockedAt = await readMeta(UNLOCK_KEY, 0);
  lockStore.set(Date.now() - unlockedAt < LOCK_AFTER_MS ? 'open' : 'locked');
};
