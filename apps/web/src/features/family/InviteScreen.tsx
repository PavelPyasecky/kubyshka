import { useEffect, useState } from 'react';
import { createInvite } from '../../state/session.ts';
import { closeOverlay } from '../../app/navigation.ts';
import { plural } from '../../ui/plural.ts';

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
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void createInvite()
      .then((result) => {
        if (!cancelled) setInvite(result);
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

  const share = async () => {
    if (!invite) return;
    const text = `Код приглашения в Кубышку: ${invite.code}. Откройте приложение, выберите «У меня есть код приглашения» и введите эти шесть цифр.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Кубышка', text });
      } catch {
        return;
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(invite.code);
      setHint('Код скопирован');
    } catch {
      setHint('Не удалось скопировать код. Запишите его с экрана.');
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

        <p className="lead">Откройте Кубышку на втором телефоне, выберите «У меня есть код приглашения» и введите эти шесть цифр.</p>

        {error ? <p className="error">{error}</p> : null}

        <div className="form">
          <button type="button" className="primary" disabled={!invite} onClick={() => void share()}>
            Поделиться
          </button>
        </div>
        {hint ? <p className="note">{hint}</p> : null}
        <p className="lead">После использования код сгорает. Новый можно выпустить в любой момент.</p>
      </div>
    </div>
  );
};
