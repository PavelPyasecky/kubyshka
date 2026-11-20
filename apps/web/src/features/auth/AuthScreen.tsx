import { useState } from 'react';
import { RecoveryKeyError } from '@kubyshka/shared';
import { inviteLink } from '../../crypto/link.ts';
import { FamilyKeyRejected, bootstrapFamily, deviceLabel, joinFamily, restoreAccess } from '../../state/session.ts';
import { rememberPin } from '../../state/lock.ts';

type Mode = 'bootstrap' | 'join' | 'restore';

const TITLES: Record<Mode, string> = {
  bootstrap: 'Создайте кубышку',
  join: 'Присоединиться к семье',
  restore: 'Вернуть доступ',
};

const HINTS: Record<Mode, string> = {
  bootstrap: 'Дальше приложение один раз покажет ключ восстановления. Без него и без телефона с Кубышкой записи не прочитать.',
  join: 'Откройте ссылку с первого телефона или введите шесть цифр и ключ восстановления. Одних цифр недостаточно.',
  restore: 'Нужны прежние имя и PIN и ключ восстановления. Если не осталось устройств и ключ потерян, записи не восстановить.',
};

export const AuthScreen = ({ needsBootstrap, needsSetupCode }: { needsBootstrap: boolean; needsSetupCode: boolean }) => {
  const link = inviteLink();
  const [mode, setMode] = useState<Mode>(needsBootstrap ? 'bootstrap' : 'join');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState(link.code);
  const [recoveryKey, setRecoveryKey] = useState(link.recoveryKey);
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const linked = mode === 'join' && link.recoveryKey.length > 0 && recoveryKey === link.recoveryKey;

  const ready =
    name.trim().length > 0 &&
    /^\d{4}$/.test(pin) &&
    (mode === 'bootstrap' || recoveryKey.trim().length > 0) &&
    (mode !== 'join' || /^\d{6}$/.test(code));

  const submit = async () => {
    setBusy(true);
    setError('');
    const credentials = { name: name.trim(), pin, device: deviceLabel() };

    try {
      if (mode === 'bootstrap') await bootstrapFamily({ ...credentials, setupCode });
      else if (mode === 'join') await joinFamily({ ...credentials, code, recoveryKey });
      else await restoreAccess({ ...credentials, recoveryKey });
      await rememberPin(pin);
    } catch (caught) {
      if (caught instanceof RecoveryKeyError) {
        setError('Ключ восстановления не сходится. Проверьте, что он скопирован целиком.');
      } else if (caught instanceof FamilyKeyRejected) {
        setError(
          mode === 'join'
            ? 'Ключ не подошёл к семье, а код приглашения уже использован. Попросите новую ссылку и тот же ключ.'
            : 'Ключ не подошёл к этой семье. Нужен ключ, который показали при создании.',
        );
      } else if (mode === 'join') {
        setError('Код не подошёл или истёк. Попросите новую ссылку.');
      } else if (mode === 'restore') {
        setError('Не удалось войти. Проверьте имя, PIN и ключ восстановления.');
      } else {
        setError('Не удалось создать семью. Проверьте сеть и попробуйте ещё раз.');
      }
      setBusy(false);
    }
  };

  return (
    <div className="scroll">
      <div className="title-row">
        <h1>{TITLES[mode]}</h1>
      </div>
      <p className="caption">{HINTS[mode]}</p>

      <div className="form">
        <input placeholder="Имя" value={name} onChange={(event) => setName(event.target.value)} autoComplete="given-name" />
        <input
          placeholder="PIN из четырёх цифр"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        {mode === 'join' && (
          <input
            placeholder="Код приглашения"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        )}
        {mode !== 'bootstrap' &&
          (linked ? (
            <p className="note">Ключ уже в ссылке и на сервер не отправляется.</p>
          ) : (
            <textarea
              placeholder="Ключ восстановления"
              autoComplete="off"
              spellCheck={false}
              value={recoveryKey}
              onChange={(event) => setRecoveryKey(event.target.value)}
            />
          ))}
        {mode === 'bootstrap' && needsSetupCode && (
          <input placeholder="Код установки с сервера" value={setupCode} onChange={(event) => setSetupCode(event.target.value)} />
        )}

        {error && <p className="error">{error}</p>}

        <button type="button" className="primary" disabled={!ready || busy} onClick={() => void submit()}>
          {mode === 'bootstrap' ? 'Создать' : 'Войти'}
        </button>

        {!needsBootstrap && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === 'join' ? 'restore' : 'join');
              setError('');
            }}
          >
            {mode === 'join' ? 'Я уже был здесь, вернуть доступ' : 'У меня есть код приглашения'}
          </button>
        )}
      </div>
    </div>
  );
};
