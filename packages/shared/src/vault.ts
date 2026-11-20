const KEY_BYTES = 32;
const CHECK_BYTES = 3;

export class RecoveryKeyError extends Error {
  constructor() {
    super('recovery');
    this.name = 'RecoveryKeyError';
  }
}

export type FamilyVault = {
  key: CryptoKey;
  recoveryKey: string;
  wrappedKey: string;
};

const rawBytes = (value: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
};

export const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

export const base64UrlToBytes = (value: string): Uint8Array => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const checksum = async (raw: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rawBytes(raw)));
  return bytesToBase64Url(digest.slice(0, CHECK_BYTES));
};

const grouped = (compact: string): string => compact.match(/.{1,4}/g)?.join(' ') ?? compact;

/** Контрольная сумма ловит опечатку до того, как одноразовый код приглашения сгорит. */
export const formatRecoveryKey = async (raw: Uint8Array): Promise<string> => grouped(`${bytesToBase64Url(raw)}${await checksum(raw)}`);

const extractKey = (input: string): string => {
  const trimmed = input.trim();
  const hash = trimmed.includes('#') ? trimmed.slice(trimmed.indexOf('#') + 1) : trimmed;
  if (hash.includes('=') && (hash.startsWith('k=') || hash.includes('&k=') || hash.includes('?k='))) {
    return new URLSearchParams(hash).get('k') ?? '';
  }
  return trimmed;
};

export const decodeRecoveryKey = async (input: string): Promise<Uint8Array> => {
  const compact = extractKey(input).replace(/\s/g, '');
  const bodyLength = bytesToBase64Url(new Uint8Array(KEY_BYTES)).length;
  if (compact.length !== bodyLength + 4) throw new RecoveryKeyError();
  let raw: Uint8Array;
  try {
    raw = base64UrlToBytes(compact.slice(0, bodyLength));
  } catch {
    throw new RecoveryKeyError();
  }
  if (raw.length !== KEY_BYTES || compact.slice(bodyLength) !== (await checksum(raw))) throw new RecoveryKeyError();
  return raw;
};

export const canonicalRecoveryKey = async (input: string): Promise<string> => formatRecoveryKey(await decodeRecoveryKey(input));

const importKek = (raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', rawBytes(raw), { name: 'AES-KW' }, false, usages);

export const wrapFamilyKey = async (dek: CryptoKey, recoveryRaw: Uint8Array): Promise<string> => {
  const kek = await importKek(recoveryRaw, ['wrapKey']);
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW'));
  return bytesToBase64Url(wrapped);
};

export const unwrapFamilyKey = async (wrappedKey: string, recoveryKey: string): Promise<CryptoKey> => {
  const kek = await importKek(await decodeRecoveryKey(recoveryKey), ['unwrapKey']);
  return crypto.subtle.unwrapKey('raw', rawBytes(base64UrlToBytes(wrappedKey)), kek, 'AES-KW', { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export const createFamilyVault = async (): Promise<FamilyVault> => {
  const recoveryRaw = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const wrappedKey = await wrapFamilyKey(extractable, recoveryRaw);
  const raw = rawBytes(new Uint8Array(await crypto.subtle.exportKey('raw', extractable)));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  raw.fill(0);
  const recoveryKey = await formatRecoveryKey(recoveryRaw);
  recoveryRaw.fill(0);
  return { key, recoveryKey, wrappedKey };
};

/** Привязка не даёт подменить шифротекст между записями или версиями одной записи. */
export const recordAad = (table: string, id: string, familyId: string, updatedAt: number): Uint8Array<ArrayBuffer> =>
  rawBytes(new TextEncoder().encode(`${table}\0${id}\0${familyId}\0${updatedAt}`));

export const encryptJson = async (key: CryptoKey, aad: Uint8Array, value: unknown): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = rawBytes(new TextEncoder().encode(JSON.stringify(value)));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: rawBytes(aad) }, key, plaintext));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return bytesToBase64Url(packed);
};

export const decryptJson = async (key: CryptoKey, aad: Uint8Array, ciphertext: string): Promise<unknown> => {
  const packed = base64UrlToBytes(ciphertext);
  if (packed.length < 13) throw new Error('cipher');
  const iv = rawBytes(packed.slice(0, 12));
  const cipher = rawBytes(packed.slice(12));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: rawBytes(aad) }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
};
