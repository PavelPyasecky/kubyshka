type InviteLink = { code: string; recoveryKey: string };

const empty: InviteLink = { code: '', recoveryKey: '' };
let captured = empty;

/** Фрагмент после # браузер на сервер не отправляет. Сразу убираем его из адреса. */
export const captureInviteLink = (): void => {
  const raw = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  const params = new URLSearchParams(raw);
  captured = {
    code: (params.get('c') ?? '').replace(/\D/g, '').slice(0, 6),
    recoveryKey: params.get('k') ?? '',
  };
  if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
};

export const inviteLink = (): InviteLink => captured;

export const clearInviteLink = (): void => {
  captured = empty;
};

export const inviteUrl = (code: string, recoveryKey: string): string => {
  const hash = new URLSearchParams({ c: code, k: recoveryKey.replace(/\s/g, '') }).toString();
  return `${location.origin}/#${hash}`;
};
