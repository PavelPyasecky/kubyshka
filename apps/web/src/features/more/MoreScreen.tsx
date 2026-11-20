import { useEffect, useState } from 'react';
import { accountBalances, minorToRaw, monthKeyOf, parseAmount } from '@kubyshka/shared';
import { MoneyAmount } from '../../ui/CurrencySign.tsx';
import { useAccounts, useBudgets, useCategories, useFamily, useOutboxCount, useTransactions } from '../../data/hooks.ts';
import { persist } from '../../db/repo.ts';
import { api } from '../../api/client.ts';
import { resetLocalData, sync, syncStore } from '../../sync/engine.ts';
import { syncLine } from '../../sync/caption.ts';
import { openAccounts, openCategories, openInvite, openLimits, openRecovery } from '../../app/navigation.ts';
import { sessionStore } from '../../state/session.ts';
import { plural } from '../../ui/plural.ts';
import { clearBiometric, enrollBiometric, hasBiometric, platformAuthenticatorAvailable } from '../../state/webauthn.ts';

const MoneyField = ({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) => {
  const [draft, setDraft] = useState(() => (value === 0 ? '' : minorToRaw(value)));

  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="numeric"
        placeholder="0"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onChange(parseAmount(draft))}
      />
    </label>
  );
};

const devicePhrase = (count: number): string => `${count} ${plural(count, 'устройство', 'устройства', 'устройств')}`;

export const MoreScreen = () => {
  const family = useFamily();
  const accounts = useAccounts();
  const categories = useCategories();
  const budgets = useBudgets();
  const transactions = useTransactions();
  const pending = useOutboxCount();
  const syncState = syncStore.use();
  const state = sessionStore.use();
  const [biometric, setBiometric] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricError, setBiometricError] = useState('');

  useEffect(() => {
    void platformAuthenticatorAvailable().then(setBiometricReady);
    void hasBiometric().then(setBiometric);
  }, []);

  const saveFamily = (patch: Partial<{ savingsNorm: number; expectedIncome: number }>) => {
    if (!family) return;
    void persist('families', { ...family, ...patch });
  };

  const month = monthKeyOf(new Date());
  const expenseCategories = categories.filter((category) => category.flow === 'expense' && !category.archived);
  const limited = budgets.filter(
    (budget) => budget.periodMonth === month && budget.amount > 0 && expenseCategories.some((category) => category.id === budget.categoryId),
  ).length;
  const balances = accountBalances(accounts, transactions);
  const visibleAccounts = accounts.filter((account) => !account.archived);
  const line = syncLine(syncState.offline, pending, syncState.lastSyncedAt);
  const members = state.status === 'ready' ? state.members : [];

  const toggleBiometric = async () => {
    setBiometricError('');
    if (biometric) {
      await clearBiometric();
      setBiometric(false);
      return;
    }
    const result = await enrollBiometric();
    if (result === 'ok') setBiometric(true);
    else if (result === 'cancelled') setBiometricError('Не получилось включить Face ID. PIN по-прежнему открывает приложение.');
  };

  return (
    <div className="scroll">
      <div className="title-row">
        <h1>Ещё</h1>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <MoneyField label="Норма накопления" value={family?.savingsNorm ?? 0} onChange={(savingsNorm) => saveFamily({ savingsNorm })} />
        <MoneyField
          label="Ожидаемый доход"
          value={family?.expectedIncome ?? 0}
          onChange={(expectedIncome) => saveFamily({ expectedIncome })}
        />
        <button type="button" className="field" onClick={openLimits}>
          <span>Лимиты по категориям</span>
          <span className="value">
            {limited} из {expenseCategories.length} ›
          </span>
        </button>
        <button type="button" className="field" onClick={openCategories}>
          <span>Категории</span>
          <span className="value">›</span>
        </button>
      </div>

      <div className="section-head">
        <h2>Счета</h2>
        <button type="button" onClick={openAccounts}>
          Править
        </button>
      </div>
      <div className="list">
        {visibleAccounts.map((account) => (
          <button type="button" className="op" key={account.id} onClick={openAccounts}>
            <div className="ic" style={{ background: `${account.color}1A` }}>
              {account.icon}
            </div>
            <div className="txt">
              <b>{account.name}</b>
              <span>{account.kind === 'savings' ? 'накопительный' : 'общий'}</span>
            </div>
            <div className="sum">
              <MoneyAmount minor={balances.get(account.id) ?? 0} />
            </div>
          </button>
        ))}
      </div>

      <div className="section-head">
        <h2>Семья</h2>
      </div>
      <div className="list">
        {members.map((member) => (
          <div className="op" key={member.id}>
            <div className="ic" style={{ background: member.color, color: '#fff' }}>
              {member.name.charAt(0)}
            </div>
            <div className="txt">
              <b>{member.name}</b>
              <span>{devicePhrase(member.deviceCount)}</span>
            </div>
          </div>
        ))}
        <button type="button" className="op" onClick={openInvite}>
          <div className="ic" style={{ background: 'var(--fill)', color: 'var(--accent)' }}>
            +
          </div>
          <div className="txt">
            <b style={{ color: 'var(--accent)' }}>Пригласить</b>
          </div>
        </button>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        {syncState.offline ? (
          <span className="caption">
            {line.title}, {line.detail}
          </span>
        ) : (
          <div className="row-between">
            <span className="caption">{line.title}</span>
            <span className="caption">{line.detail}</span>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <button type="button" className="field" onClick={() => void toggleBiometric()} disabled={!biometricReady && !biometric}>
          <span>Вход по Face ID</span>
          <span className="value">{biometric ? 'включён' : biometricReady ? 'выключен' : 'недоступен'}</span>
        </button>
        <button type="button" className="field" onClick={openRecovery}>
          <span>Ключ восстановления</span>
          <span className="value">›</span>
        </button>
      </div>
      <p className="note" style={{ padding: '0 4px' }}>
        {biometricError || 'PIN остаётся запасным способом и работает без сети.'}
      </p>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="pill" onClick={() => void sync()}>
            Синхронизировать
          </button>
          <button type="button" className="link" onClick={() => void api('/auth/logout', {}).then(() => void resetLocalData())}>
            Выйти на этом устройстве
          </button>
        </div>
        <p className="note">На сервере останется зашифрованная копия. На новом телефоне понадобится ключ восстановления.</p>
      </div>
    </div>
  );
};
