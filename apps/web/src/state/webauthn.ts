import { readMeta, writeMeta } from '../db/local.ts';
import { local } from '../db/local.ts';
import { unlock } from './lock.ts';

const KEY = 'webauthn';

type StoredCredential = { id: string; spki: string; alg: number };

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const base64UrlToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const derToP1363 = (der: Uint8Array): Uint8Array<ArrayBuffer> => {
  if (der.length < 8 || der[0] !== 0x30) return new Uint8Array(der);
  let offset = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;

  const read = (): Uint8Array<ArrayBuffer> => {
    if (der[offset] !== 0x02) throw new Error('signature');
    const length = der[offset + 1] ?? 0;
    offset += 2;
    let bytes = der.subarray(offset, offset + length);
    offset += length;
    if (bytes[0] === 0x00) bytes = bytes.subarray(1);
    if (bytes.length > 32) throw new Error('signature');
    const padded = new Uint8Array(32);
    padded.set(bytes, 32 - bytes.length);
    return padded;
  };

  const raw = new Uint8Array(64);
  raw.set(read(), 0);
  raw.set(read(), 32);
  return raw;
};

const isPublicKey = (value: Credential | null): value is PublicKeyCredential => value?.type === 'public-key';

export const platformAuthenticatorAvailable = async (): Promise<boolean> => {
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

export const hasBiometric = async (): Promise<boolean> => Boolean(await readMeta<StoredCredential | null>(KEY, null));

export const clearBiometric = async (): Promise<void> => {
  await local.meta.delete(KEY);
};

const verifyAssertion = async (stored: StoredCredential, assertion: AuthenticatorAssertionResponse, challenge: Uint8Array): Promise<boolean> => {
  const client = JSON.parse(new TextDecoder().decode(assertion.clientDataJSON)) as { type?: string; challenge?: string };
  if (client.type !== 'webauthn.get' || client.challenge !== bytesToBase64Url(challenge)) return false;

  const authenticatorData = new Uint8Array(assertion.authenticatorData);
  const flags = authenticatorData[32] ?? 0;
  if ((flags & 0x05) !== 0x05) return false;

  const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', assertion.clientDataJSON));
  const signed = new Uint8Array(authenticatorData.length + clientHash.length);
  signed.set(authenticatorData, 0);
  signed.set(clientHash, authenticatorData.length);

  const signature = new Uint8Array(assertion.signature);
  const spki = base64UrlToBytes(stored.spki);

  if (stored.alg === -7) {
    const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToP1363(signature), signed);
  }

  if (stored.alg === -257) {
    const key = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
  }

  return false;
};

export const enrollBiometric = async (): Promise<'ok' | 'cancelled' | 'unsupported'> => {
  if (!(await platformAuthenticatorAvailable())) return 'unsupported';

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Кубышка' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'kubyshka', displayName: 'Кубышка' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
        attestation: 'none',
      },
    });

    if (!isPublicKey(credential)) return 'cancelled';
    const attestation = credential.response as AuthenticatorAttestationResponse;
    const spki = attestation.getPublicKey();
    const alg = attestation.getPublicKeyAlgorithm();
    if (!spki || (alg !== -7 && alg !== -257)) return 'unsupported';

    await writeMeta(KEY, {
      id: bytesToBase64Url(new Uint8Array(credential.rawId)),
      spki: bytesToBase64Url(new Uint8Array(spki)),
      alg,
    } satisfies StoredCredential);
    return 'ok';
  } catch {
    return 'cancelled';
  }
};

export const unlockWithBiometric = async (): Promise<'ok' | 'cancelled' | 'unavailable'> => {
  const stored = await readMeta<StoredCredential | null>(KEY, null);
  if (!stored) return 'unavailable';

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: base64UrlToBytes(stored.id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    if (!isPublicKey(credential)) return 'cancelled';
    const valid = await verifyAssertion(stored, credential.response as AuthenticatorAssertionResponse, challenge);
    if (!valid) return 'cancelled';
    await unlock();
    return 'ok';
  } catch {
    return 'cancelled';
  }
};
