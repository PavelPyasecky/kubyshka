import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { verifyPublishedBuild } from './verify.ts';

type Phase = 'idle' | 'checking' | 'ready' | 'blocked';

export const UpdateBanner = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [phase, setPhase] = useState<Phase>('idle');
  const [detail, setDetail] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!needRefresh) return;
    let cancelled = false;
    setPhase('checking');
    void verifyPublishedBuild().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPhase('ready');
        setDetail('');
        return;
      }
      setPhase('blocked');
      setDetail(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [needRefresh, attempt]);

  if (!needRefresh || phase === 'idle') return null;

  const activate = () => {
    if (phase !== 'ready') return;
    void updateServiceWorker(true);
    window.setTimeout(() => window.location.reload(), 400);
  };

  return (
    <div className={phase === 'blocked' ? 'update-banner blocked' : 'update-banner'}>
      <p>{phase === 'blocked' ? detail : 'Доступна новая версия'}</p>
      {phase === 'checking' && <span>Сверяем публикацию</span>}
      {phase === 'ready' && (
        <button type="button" onClick={activate}>
          Обновить
        </button>
      )}
      {phase === 'blocked' && (
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Проверить снова
        </button>
      )}
    </div>
  );
};
