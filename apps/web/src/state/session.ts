import type { Family } from '@kubyshka/shared';
import { ApiError, api } from '../api/client.ts';
import { startSync } from '../sync/engine.ts';
import { evaluateOnboarding, skipOnboarding } from './onboarding.ts';
import { createStore } from './store.ts';

export type Member = { id: string; name: string; color: string; deviceCount: number };

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; needsBootstrap: boolean; needsSetupCode: boolean }
  | { status: 'ready'; memberId: string; family: Family; members: Member[] };

export const sessionStore = createStore<SessionState>({ status: 'loading' });

/** Читается синхронно при каждой записи в локальную базу, поэтому вынесено из React. */
export const session = { memberId: '', familyId: '' };

type Me = { memberId: string; family: Family; members: Member[] };

const adopt = (me: Me): void => {
  session.memberId = me.memberId;
  session.familyId = me.family.id;
  sessionStore.set({ status: 'ready', ...me });
  void navigator.storage?.persist?.();
  startSync();
};

export const refreshSession = async (): Promise<void> => {
  try {
    adopt(await api<Me>('/auth/me'));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const state = await api<{ needsBootstrap: boolean; needsSetupCode: boolean }>('/auth/state');
    sessionStore.set({ status: 'anonymous', ...state });
  }
};

type Credentials = { name: string; pin: string; device: string };

export const bootstrapFamily = async (input: Credentials & { setupCode: string }): Promise<void> => {
  await api('/auth/bootstrap', input);
  await evaluateOnboarding();
  await refreshSession();
};

export const joinFamily = async (input: Credentials & { code: string }): Promise<void> => {
  await api('/auth/join', input);
  await skipOnboarding();
  await refreshSession();
};

export const restoreAccess = async (input: Credentials): Promise<void> => {
  await api('/auth/restore', input);
  await skipOnboarding();
  await refreshSession();
};

export const createInvite = (): Promise<{ code: string; expiresAt: number }> => api('/auth/invite', {});

export const deviceLabel = (): string => (/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : 'Браузер');
