import { useState } from 'react';
import { bootstrapFamily, deviceLabel, joinFamily, restoreAccess } from '../../state/session.ts';
import { rememberPin } from '../../state/lock.ts';

type Mode = 'bootstrap' | 'join' | 'restore';

const TITLES: Record<Mode, string> = {
  bootstrap: 'Создайте кубышку',
  join: 'Присоединиться к семье',
  restore: 'Вернуть доступ',
};

const HINTS: Record<Mode, string> = {
  bootstrap: 'Имя и PIN нужны, чтобы второй телефон мог отличить вас от другого члена семьи.',
  join: 'Попросите код у того, у кого приложение уже открыто.',
  restore: 'Введите имя и PIN, которые задавали раньше.',
};

export const AuthScreen = ({ needsBootstrap, needsSetupCode }: { needsBootstrap: boolean; needsSetupCode: boolean }) => {
  const [mode, setMode] = useState<Mode>(needsBootstrap ? 'bootstrap' : 'join');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = name.trim().length > 0 && /^\d{4}$/.test(pin) && (mode !== 'join' || /^\d{6}$/.test(code));

  const submit = async () => {
    setBusy(true);
    setError('');

    const credentials = { name: name.trim(), pin, device: deviceLabel() };

    try {
      if (mode === 'bootstrap') await bootstrapFamily({ ...credentials, setupCode });
      else if (mode === 'join') await joinFamily({ ...credentials, code });
      else await restoreAccess(credentials);
      await rememberPin(pin);
    } catch {
      setError(mode === 'join' ? 'Код не подошёл или истёк' : 'Не удалось войти, проверьте имя и PIN');
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
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        {mode === 'join' && (
          <input
            placeholder="Код приглашения"
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        )}
        {mode === 'bootstrap' && needsSetupCode && (
          <input placeholder="Код установки с сервера" value={setupCode} onChange={(event) => setSetupCode(event.target.value)} />
        )}

        {error && <p className="error">{error}</p>}

        <button type="button" className="primary" disabled={!ready || busy} onClick={() => void submit()}>
          {mode === 'bootstrap' ? 'Создать' : 'Войти'}
        </button>

        {!needsBootstrap && (
          <button type="button" className="link" onClick={() => setMode(mode === 'join' ? 'restore' : 'join')}>
            {mode === 'join' ? 'Я уже был здесь, вернуть доступ' : 'У меня есть код приглашения'}
          </button>
        )}
      </div>
    </div>
  );
};
