import { useState } from 'react';
import { parseAmount } from '@kubyshka/shared';
import { useAccounts } from '../../data/hooks.ts';
import { persist } from '../../db/repo.ts';
import { finishOnboarding } from '../../state/onboarding.ts';

export const OnboardingScreen = () => {
  const accounts = useAccounts();
  const [balances, setBalances] = useState<Record<string, string>>({});

  const save = async () => {
    for (const account of accounts) {
      const openingBalance = parseAmount(balances[account.id] ?? '0');
      if (openingBalance !== account.openingBalance) await persist('accounts', { ...account, openingBalance });
    }
    await finishOnboarding();
  };

  return (
    <div className="scroll">
      <div className="title-row">
        <h1>Сколько сейчас есть</h1>
      </div>
      <p className="caption">
        Укажите остатки, чтобы приложение считало реальные деньги, а не только движение с сегодняшнего дня. Любое поле
        можно оставить пустым и поправить позже.
      </p>

      <div className="card" style={{ padding: 0, marginTop: 16 }}>
        {accounts.map((account) => (
          <label className="field" key={account.id}>
            <span>
              {account.icon} {account.name}
            </span>
            <input
              inputMode="numeric"
              placeholder="0"
              value={balances[account.id] ?? ''}
              onChange={(event) => setBalances({ ...balances, [account.id]: event.target.value })}
            />
          </label>
        ))}
      </div>

      <div className="form">
        <button type="button" className="primary" onClick={() => void save()}>
          Готово
        </button>
      </div>
    </div>
  );
};
