import { ApiError, api } from '../api/client.ts';
import { clearInviteLink } from '../crypto/link.ts';
import { seedLocalFamily } from '../db/seed.ts';
import { clearVault, readVault, saveVault } from '../db/vault.ts';
import { requeueAll, startSync } from '../sync/engine.ts';
import { canonicalRecoveryKey, createFamilyVault, RecoveryKeyError, unwrapFamilyKey } from '@kubyshka/shared';
import { evaluateOnboarding, skipOnboarding } from './onboarding.ts';
import { markRecoveryPending } from './recovery.ts';
import { createStore } from './store.ts';

export type Member = { id: string; name: string; color: string; deviceCount: number };

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; needsBootstrap: boolean; needsSetupCode: boolean }
  | { status: 'needs-key'; memberId: string; familyId: string; members: Member[] }
  | { status: 'ready'; memberId: string; familyId: string; members: Member[] };

export const sessionStore = createStore<SessionState>({ status: 'loading' });

/** Читается синхронно при каждой записи в локальную базу, поэтому вынесено из React. */
export const session = { memberId: '', familyId: '' };

type Me = { memberId: string; familyId: string; members: Member[] };
type Credentials = { name: string; pin: string; device: string };

export class FamilyKeyRejected extends Error {
  constructor() {
    super('key');
    this.name = 'FamilyKeyRejected';
  }
}

const publishWrappedKey = async (wrappedKey: string): Promise<'ok' | 'conflict'> => {
  try {
    await api('/auth/key');
    return 'ok';
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) return 'ok';
  }

  try {
    await api('/auth/key', { wrappedKey });
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return 'conflict';
    return 'ok';
  }
};

const installRecoveryKey = async (recoveryKey: string): Promise<void> => {
  let wrappedKey: string;
  try {
    wrappedKey = (await api<{ wrappedKey: string }>('/auth/key')).wrappedKey;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw new FamilyKeyRejected();
    throw error;
  }

  try {
    const key = await unwrapFamilyKey(wrappedKey, recoveryKey);
    await saveVault({ key, recoveryKey: await canonicalRecoveryKey(recoveryKey), wrappedKey });
  } catch (error) {
    if (error instanceof RecoveryKeyError) throw error;
    throw new FamilyKeyRejected();
  }
};

const ensureVault = async (): Promise<'ready' | 'needs-key'> => {
  const existing = await readVault();
  if (existing) {
    if ((await publishWrappedKey(existing.wrappedKey)) === 'conflict') {
      await clearVault();
      return 'needs-key';
    }
    return 'ready';
  }

  let remote: { wrappedKey: string };
  try {
    remote = await api<{ wrappedKey: string }>('/auth/key');
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    const created = await createFamilyVault();
    if ((await publishWrappedKey(created.wrappedKey)) === 'conflict') return 'needs-key';
    await saveVault({ key: created.key, recoveryKey: created.recoveryKey, wrappedKey: created.wrappedKey });
    await markRecoveryPending();
    await requeueAll();
    return 'ready';
  }

  void remote;
  return 'needs-key';
};

const adopt = async (me: Me): Promise<void> => {
  session.memberId = me.memberId;
  session.familyId = me.familyId;
  if ((await ensureVault()) === 'needs-key') {
    sessionStore.set({ status: 'needs-key', ...me });
    return;
  }
  sessionStore.set({ status: 'ready', ...me });
  void navigator.storage?.persist?.();
  startSync();
};

export const refreshSession = async (): Promise<void> => {
  try {
    await adopt(await api<Me>('/auth/me'));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const state = await api<{ needsBootstrap: boolean; needsSetupCode: boolean }>('/auth/state');
    sessionStore.set({ status: 'anonymous', ...state });
  }
};

const leaveIfKeyRejected = async (recoveryKey: string): Promise<void> => {
  try {
    await installRecoveryKey(recoveryKey);
  } catch (error) {
    await api('/auth/logout', {}).catch(() => undefined);
    throw error;
  }
};

export const bootstrapFamily = async (input: Credentials & { setupCode: string }): Promise<void> => {
  const created = await createFamilyVault();
  await api('/auth/bootstrap', { ...input, wrappedKey: created.wrappedKey });
  await saveVault({ key: created.key, recoveryKey: created.recoveryKey, wrappedKey: created.wrappedKey });
  const me = await api<Me>('/auth/me');
  session.memberId = me.memberId;
  session.familyId = me.familyId;
  await seedLocalFamily();
  await markRecoveryPending();
  await evaluateOnboarding();
  await adopt(me);
};

export const joinFamily = async (input: Credentials & { code: string; recoveryKey: string }): Promise<void> => {
  const recoveryKey = await canonicalRecoveryKey(input.recoveryKey);
  await api('/auth/join', { name: input.name, pin: input.pin, device: input.device, code: input.code });
  await leaveIfKeyRejected(recoveryKey);
  clearInviteLink();
  await skipOnboarding();
  await refreshSession();
};

export const restoreAccess = async (input: Credentials & { recoveryKey: string }): Promise<void> => {
  const recoveryKey = await canonicalRecoveryKey(input.recoveryKey);
  await api('/auth/restore', { name: input.name, pin: input.pin, device: input.device });
  await leaveIfKeyRejected(recoveryKey);
  await skipOnboarding();
  await refreshSession();
};

export const unlockWithRecoveryKey = async (recoveryKey: string): Promise<void> => {
  await installRecoveryKey(await canonicalRecoveryKey(recoveryKey));
  clearInviteLink();
  await refreshSession();
};

export const createInvite = (): Promise<{ code: string; expiresAt: number }> => api('/auth/invite', {});

export const deviceLabel = (): string => (/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : 'Браузер');
