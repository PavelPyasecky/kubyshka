import { useEffect, useState } from 'react';
import { readVault } from '../../db/vault.ts';
import { acknowledgeRecovery } from '../../state/recovery.ts';
import { verifyPin } from '../../state/lock.ts';
import { hasBiometric, unlockWithBiometric } from '../../state/webauthn.ts';
import { closeOverlay } from '../../app/navigation.ts';

const copyKey = async (value: string): Promise<string> => {
  try {
    await navigator.clipboard.writeText(value);
    return 'Ключ скопирован. Сохраните его в менеджере паролей или распечатайте.';
  } catch {
    return 'Не удалось скопировать. Запишите ключ с экрана.';
  }
};

export const RecoveryScreen = ({ mode }: { mode: 'acknowledge' | 'reveal' }) => {
  const [recoveryKey, setRecoveryKey] = useState('');
  const [pin, setPin] = useState('');
  const [confirmed, setConfirmed] = useState(mode === 'acknowledge');
  const [biometric, setBiometric] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    void readVault().then((vault) => setRecoveryKey(vault?.recoveryKey ?? ''));
    if (mode === 'reveal') void hasBiometric().then(setBiometric);
  }, [mode]);

  const confirmPin = async () => {
    if (await verifyPin(pin)) {
      setConfirmed(true);
      setError('');
      return;
    }
    setPin('');
    setError('Неверный PIN');
  };

  const confirmFace = async () => {
    const result = await unlockWithBiometric();
    if (result === 'ok') {
      setConfirmed(true);
      setError('');
      return;
    }
    setError('Не удалось подтвердить лицо. Введите PIN.');
  };

  return (
    <div className="screen overlay">
      <div className="scroll">
        {mode === 'reveal' && (
          <button type="button" className="nav-back" onClick={closeOverlay}>
            ‹ Ещё
          </button>
        )}
        <div className="title-row">
          <h1>Ключ восстановления</h1>
        </div>
        <p className="lead">
          Сохраните его в менеджере паролей или распечатайте. Он нужен, чтобы открыть записи на новом телефоне. Если не останется ни
          одного устройства с Кубышкой и этот ключ потеряется, записи прочитать нельзя. Сервер хранит только зашифрованную копию и сам их
          не восстановит.
        </p>

        {confirmed ? (
          <>
            <div className="card">
              <p className="recovery-key">{recoveryKey || 'Ключ ещё не записан на этом телефоне'}</p>
            </div>
            <div className="form">
              <button type="button" className="primary" disabled={!recoveryKey} onClick={() => void copyKey(recoveryKey).then(setHint)}>
                Скопировать
              </button>
              <button type="button" className="link" onClick={() => window.print()}>
                Распечатать
              </button>
              {mode === 'acknowledge' ? (
                <button type="button" className="primary" onClick={() => void acknowledgeRecovery()}>
                  Я сохранил ключ
                </button>
              ) : (
                <button type="button" className="link" onClick={closeOverlay}>
                  Закрыть
                </button>
              )}
            </div>
            {hint ? <p className="note">{hint}</p> : null}
          </>
        ) : (
          <div className="form">
            <p className="caption">Чтобы показать ключ, подтвердите, что это вы.</p>
            <input
              placeholder="PIN из четырёх цифр"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            {error ? <p className="error">{error}</p> : null}
            <button type="button" className="primary" disabled={pin.length !== 4} onClick={() => void confirmPin()}>
              Показать ключ
            </button>
            {biometric && (
              <button type="button" className="link" onClick={() => void confirmFace()}>
                Подтвердить Face ID
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
