import { useState } from 'react';
import { accountBalances, minorToRaw, parseAmount } from '@kubyshka/shared';
import type { Account } from '@kubyshka/shared';
import { useAccounts, useTransactions } from '../../data/hooks.ts';
import { persist, softDelete } from '../../db/repo.ts';
import { closeOverlay } from '../../app/navigation.ts';
import { IconPicker } from '../../ui/IconPicker.tsx';
import { MoneyAmount } from '../../ui/CurrencySign.tsx';
import { SortableList } from '../../ui/SortableList.tsx';

const KINDS: { id: Account['kind']; label: string }[] = [
  { id: 'cash', label: 'Наличные' },
  { id: 'debit', label: 'Карта' },
  { id: 'credit', label: 'Кредитная' },
  { id: 'savings', label: 'Накопительный' },
];

const kindLabel = (kind: Account['kind']): string => KINDS.find((item) => item.id === kind)?.label ?? kind;

const AccountList = ({ onCreate, onEdit }: { onCreate: () => void; onEdit: (account: Account) => void }) => {
  const accounts = useAccounts();
  const transactions = useTransactions();
  const balances = accountBalances(accounts, transactions);
  const visible = accounts.filter((account) => !account.archived);
  const archived = accounts.filter((account) => account.archived);

  return (
    <div className="screen overlay">
      <div className="scroll">
        <button type="button" className="nav-back" onClick={closeOverlay}>
          ‹ Ещё
        </button>
        <div className="title-row">
          <h1>Счета</h1>
        </div>
        <p className="caption">Архивный счёт пропадает из ввода и остаётся в истории операций. Порядок меняется за ручку справа.</p>

        <div style={{ marginTop: 14 }}>
          <SortableList
            items={visible}
            label={(account) => `Перетащить ${account.name}`}
            onReorder={(next) => {
              const ordered = [...next, ...archived];
              void Promise.all(
                ordered.map((account, sort) => (account.sort === sort ? Promise.resolve() : persist('accounts', { ...account, sort }))),
              );
            }}
          >
            {(account) => (
              <button type="button" className="op-main" onClick={() => onEdit(account)}>
                <div className="ic" style={{ background: `${account.color}1A` }}>
                  {account.icon}
                </div>
                <div className="txt">
                  <b>{account.name}</b>
                  <span>{kindLabel(account.kind)}</span>
                </div>
                <div className="sum">
                  <MoneyAmount minor={balances.get(account.id) ?? 0} />
                </div>
              </button>
            )}
          </SortableList>
        </div>

        {archived.length > 0 && (
          <>
            <div className="section-head">
              <h2>В архиве</h2>
            </div>
            <div className="list">
              {archived.map((account) => (
                <button type="button" className="op" key={account.id} onClick={() => onEdit(account)}>
                  <div className="ic" style={{ background: `${account.color}1A` }}>
                    {account.icon}
                  </div>
                  <div className="txt">
                    <b>{account.name}</b>
                    <span>{kindLabel(account.kind)}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="form">
          <button type="button" className="primary" onClick={onCreate}>
            Новый счёт
          </button>
        </div>
      </div>
    </div>
  );
};

const AccountEditor = ({ account, onClose }: { account?: Account; onClose: () => void }) => {
  const transactions = useTransactions();
  const accounts = useAccounts();
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<Account['kind']>(account?.kind ?? 'debit');
  const [icon, setIcon] = useState(account?.icon ?? '💳');
  const [color, setColor] = useState(account?.color ?? '#3478F6');
  const [balance, setBalance] = useState(account ? minorToRaw(account.openingBalance) : '');
  const [error, setError] = useState('');
  const used = account ? transactions.some((item) => item.accountId === account.id || item.counterAccountId === account.id) : false;

  const save = async (archived = account?.archived ?? false) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Введите название счёта');
      return;
    }

    await persist('accounts', {
      ...(account ?? {}),
      name: trimmed,
      kind,
      scope: account?.scope ?? 'shared',
      ownerMemberId: account?.ownerMemberId ?? null,
      openingBalance: parseAmount(balance || '0'),
      creditLimit: account?.creditLimit ?? null,
      icon,
      color,
      sort: account?.sort ?? accounts.reduce((max, item) => Math.max(max, item.sort), -1) + 1,
      archived,
    });
    onClose();
  };

  const remove = async () => {
    if (!account || used) return;
    await softDelete('accounts', account.id);
    onClose();
  };

  return (
    <div className="screen overlay">
      <div className="scroll">
        <button type="button" className="nav-back" onClick={onClose}>
          ‹ Счета
        </button>
        <div className="title-row">
          <h1>{account ? 'Счёт' : 'Новый счёт'}</h1>
        </div>

        <div className="form">
          <input placeholder="Название" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          <input
            inputMode="decimal"
            placeholder="Начальный остаток"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
          />
        </div>

        <div className="chips" style={{ paddingTop: 0 }}>
          {KINDS.map((item) => (
            <button key={item.id} type="button" className="chip" aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <IconPicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
        {error && <p className="error">{error}</p>}

        <div className="form">
          <button type="button" className="primary" onClick={() => void save()}>
            Сохранить
          </button>
          {account && (
            <button type="button" className="danger" onClick={() => void save(!account.archived)}>
              {account.archived ? 'Вернуть из архива' : 'В архив'}
            </button>
          )}
          {account && !used && (
            <button type="button" className="danger" onClick={() => void remove()}>
              Удалить счёт
            </button>
          )}
          {account && used && <p className="note">По счёту есть операции, его можно только архивировать.</p>}
        </div>
      </div>
    </div>
  );
};

export const AccountsScreen = () => {
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  if (editing) return <AccountEditor account={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />;
  return <AccountList onCreate={() => setEditing('new')} onEdit={setEditing} />;
};
