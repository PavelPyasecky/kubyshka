import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt) as (secret: string, salt: string, length: number) => Promise<Buffer>;
const KEY_LENGTH = 32;

export const hashPin = async (pin: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(pin, salt, KEY_LENGTH);
  return `${salt}:${key.toString('hex')}`;
};

export const verifyPin = async (pin: string, stored: string): Promise<boolean> => {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const candidate = await derive(pin, salt, KEY_LENGTH);
  const expected = Buffer.from(key, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
};

export const newToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const newInviteCode = (): string => String(randomInt(100_000, 1_000_000));

export const newId = (): string => randomUUID();
