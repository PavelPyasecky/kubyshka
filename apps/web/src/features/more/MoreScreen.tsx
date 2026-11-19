import { useState } from 'react';
import { formatMoney, parseAmount, toMajor } from '@kubyshka/shared';
import { useAccounts, useFamily } from '../../data/hooks.ts';
import { persist } from '../../db/repo.ts';
import { createInvite, sessionStore } from '../../state/session.ts';
import { api } from '../../api/client.ts';
import { resetLocalData, sync, syncState } from '../../sync/engine.ts';

const MoneyField = ({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) => {
  const [draft, setDraft] = useState(String(toMajor(value)));

  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onChange(parseAmount(draft))}
      />
    </label>
  );
};

export const MoreScreen = () => {
  const family = useFamily();
  const accounts = useAccounts();
  const state = sessionStore.use();
  const [invite, setInvite] = useState<string>();

  const saveFamily = (patch: Partial<{ savingsNorm: number; expectedIncome: number }>) => {
    if (!family) return;
    void persist('families', { ...family, ...patch });
  };

  return (
    <div className="scroll">
      <div className="title-row">
        <h1>Ещё</h1>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <MoneyField
          label="Норма накопления в месяц"
          value={family?.savingsNorm ?? 0}
          onChange={(savingsNorm) => saveFamily({ savingsNorm })}
        />
        <MoneyField
          label="Ожидаемый доход в месяц"
          value={family?.expectedIncome ?? 0}
          onChange={(expectedIncome) => saveFamily({ expectedIncome })}
        />
      </div>

      <div className="section-head">
        <h2>Счета</h2>
      </div>
      <div className="list">
        {accounts.map((account) => (
          <div className="op" key={account.id}>
            <div className="ic" style={{ background: `${account.color}1A` }}>
              {account.icon}
            </div>
            <div className="txt">
              <b>{account.name}</b>
              <span>{account.kind === 'savings' ? 'копилка' : 'расчётный'}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h2>Семья</h2>
      </div>
      <div className="list">
        {state.status === 'ready' &&
          state.members.map((member) => (
            <div className="op" key={member.id}>
              <div className="ic" style={{ background: member.color, color: '#fff' }}>
                {member.name.charAt(0)}
              </div>
              <div className="txt">
                <b>{member.name}</b>
              </div>
            </div>
          ))}
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        {invite ? (
          <>
            <span className="caption">Код действует сутки</span>
            <div className="amount-l">{invite}</div>
            <p className="note">Введите его на втором телефоне при первом открытии</p>
          </>
        ) : (
          <button type="button" className="pill" onClick={() => void createInvite().then((result) => setInvite(result.code))}>
            Пригласить члена семьи
          </button>
        )}
      </div>

      <div className="card">
        <div className="row-between">
          <span className="caption">Синхронизация</span>
          <span className="caption">{syncState.snapshot().status === 'offline' ? 'нет сети' : 'в порядке'}</span>
        </div>
        <p className="note">Данные хранятся на устройстве и уходят на сервер в фоне</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="pill" onClick={() => void sync()}>
            Синхронизировать
          </button>
          <button
            type="button"
            className="link"
            onClick={() => void api('/auth/logout', {}).then(() => void resetLocalData())}
          >
            Выйти на этом устройстве
          </button>
        </div>
      </div>
    </div>
  );
};
