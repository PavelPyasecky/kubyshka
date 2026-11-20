import { useEffect, useState } from 'react';
import { inviteUrl } from '../../crypto/link.ts';
import { readVault } from '../../db/vault.ts';
import { createInvite } from '../../state/session.ts';
import { closeOverlay } from '../../app/navigation.ts';
import { plural } from '../../ui/plural.ts';
import { QrCode } from './QrCode.tsx';

const remainingLabel = (ms: number): string => {
  if (ms <= 0) return 'срок действия истёк';
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `действует ещё ${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')}`;
  const hours = Math.max(1, Math.round(minutes / 60));
  return `действует ещё ${hours} ${plural(hours, 'час', 'часа', 'часов')}`;
};

const spaced = (code: string): string => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);

export const InviteScreen = () => {
  const [invite, setInvite] = useState<{ code: string; expiresAt: number }>();
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void Promise.all([createInvite(), readVault()])
      .then(([result, vault]) => {
        if (cancelled) return;
        if (!vault) {
          setError('На этом телефоне нет ключа семьи. Откройте его в разделе «Ещё» после ввода ключа восстановления.');
          return;
        }
        setInvite(result);
        setRecoveryKey(vault.recoveryKey);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось выпустить код. Проверьте сеть и откройте экран ещё раз.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const url = invite && recoveryKey ? inviteUrl(invite.code, recoveryKey) : '';

  const share = async () => {
    if (!url || !invite) return;
    const text = `Ссылка для входа в Кубышку. Шести цифр без неё недостаточно, ключ находится в ссылке и на сервер не уходит.\n${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Кубышка', text });
      } catch {
        return;
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setHint('Ссылка скопирована');
    } catch {
      setHint('Не удалось скопировать ссылку. Передайте её с экрана.');
    }
  };

  return (
    <div className="screen overlay">
      <div className="scroll">
        <button type="button" className="nav-back" onClick={closeOverlay}>
          ‹ Ещё
        </button>
        <div className="title-row">
          <h1>Приглашение</h1>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '20px 14px' }}>
          <div className="code">{invite ? spaced(invite.code) : '··· ···'}</div>
          <span className="caption">{invite ? remainingLabel(invite.expiresAt - now) : 'выпускаем код'}</span>
        </div>

        {url ? (
          <div className="qr-wrap">
            <QrCode text={url} />
          </div>
        ) : null}

        <p className="lead">
          Код из шести цифр только открывает вход. Ключ семьи лежит в ссылке после решётки и на картинке, на сервер он не уходит. На
          втором телефоне откройте ссылку или наведите камеру на картинку.
        </p>

        {url ? <input className="link-field" readOnly aria-label="Ссылка для второго телефона" value={url} /> : null}

        {error ? <p className="error">{error}</p> : null}

        <div className="form">
          <button type="button" className="primary" disabled={!url} onClick={() => void share()}>
            Поделиться
          </button>
        </div>
        {hint ? <p className="note">{hint}</p> : null}
        <p className="lead">Отправьте ссылку только человеку из семьи. После использования код сгорает, ключ семьи остаётся тем же.</p>
      </div>
    </div>
  );
};
