import { useState } from 'react';
import { RecoveryKeyError } from '@kubyshka/shared';
import { inviteLink } from '../../crypto/link.ts';
import { FamilyKeyRejected, unlockWithRecoveryKey } from '../../state/session.ts';

export const NeedsKeyScreen = () => {
  const link = inviteLink();
  const [recoveryKey, setRecoveryKey] = useState(link.recoveryKey);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await unlockWithRecoveryKey(recoveryKey);
    } catch (caught) {
      setError(
        caught instanceof RecoveryKeyError
          ? 'Ключ восстановления не сходится. Проверьте, что он скопирован целиком.'
          : caught instanceof FamilyKeyRejected
            ? 'Этот ключ не подходит к семье. Нужен ключ, который показали при создании.'
            : 'Не удалось открыть ключ. Проверьте сеть и попробуйте ещё раз.',
      );
      setBusy(false);
    }
  };

  return (
    <div className="scroll">
      <div className="title-row">
        <h1>Ключ семьи</h1>
      </div>
      <p className="lead">
        На этом телефоне ещё нет ключа семьи. Введите ключ восстановления, иначе записи останутся нечитаемыми. Если ключа нет и других
        устройств тоже нет, восстановить записи нельзя.
      </p>
      <div className="form">
        <textarea
          placeholder="Ключ восстановления"
          autoComplete="off"
          spellCheck={false}
          value={recoveryKey}
          onChange={(event) => setRecoveryKey(event.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button type="button" className="primary" disabled={recoveryKey.trim().length === 0 || busy} onClick={() => void submit()}>
          Открыть записи
        </button>
      </div>
    </div>
  );
};
