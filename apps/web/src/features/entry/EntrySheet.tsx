import { useMemo, useState } from 'react';
import { buildSuggestionIndex, parseAmount, suggestCategories } from '@kubyshka/shared';
import type { Transaction } from '@kubyshka/shared';
import { Keypad, appendDigit, formatRaw } from '../../ui/Keypad.tsx';
import { byId, useAccounts, useCategories, useTransactions } from '../../data/hooks.ts';
import { persist } from '../../db/repo.ts';
import { now } from '../../sync/clock.ts';
import { session } from '../../state/session.ts';
import { closeOverlay } from '../../app/navigation.ts';

type Flow = Transaction['flow'];

const FLOW_LABELS: Record<Flow, string> = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' };

const tap = (): void => void navigator.vibrate?.(8);

export const EntrySheet = ({ onSaved }: { onSaved: (message: string) => void }) => {
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useTransactions();

  const [flow, setFlow] = useState<Flow>('expense');
  const [raw, setRaw] = useState('');
  const [accountId, setAccountId] = useState<string>('');
  const [picking, setPicking] = useState<'none' | 'account' | 'category'>('none');

  const amount = parseAmount(raw || '0');
  const activeAccount = accounts.find((account) => account.id === accountId) ?? accounts[0];

  const suggestionIndex = useMemo(() => buildSuggestionIndex(transactions, new Date()), [transactions]);
  const categoriesById = byId(categories);

  const options = useMemo(() => {
    if (flow === 'income') return categories.filter((category) => category.flow === 'income').slice(0, 5);

    const suggested = suggestCategories(suggestionIndex, { amount, now: new Date() }, 5)
      .map((id) => categoriesById.get(id))
      .filter((category) => category !== undefined);

    const fill = categories.filter((category) => category.flow === 'expense' && !suggested.includes(category));
    return [...suggested, ...fill].slice(0, 5);
  }, [flow, categories, suggestionIndex, amount, categoriesById]);

  const save = async (categoryId: string | null, counterAccountId: string | null) => {
    if (amount <= 0 || !activeAccount) return;

    await persist('transactions', {
      flow,
      amount,
      accountId: activeAccount.id,
      counterAccountId,
      categoryId,
      memberId: session.memberId,
      occurredAt: now(),
      note: '',
      tags: [],
    });

    tap();
    const label = categoryId ? (categoriesById.get(categoryId)?.name ?? 'Операция') : 'Перевод';
    onSaved(`${label}, ${formatRaw(raw)} ₽`);
    closeOverlay();
  };

  const picker = picking === 'account' ? accounts : picking === 'category' ? categories.filter((c) => c.flow === flow) : [];

  return (
    <>
      <div className="backdrop" onClick={closeOverlay} />
      <div className="sheet" role="dialog" aria-label="Новая операция">
        <div className="grabber" />

        <div className="segmented">
          {(Object.keys(FLOW_LABELS) as Flow[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={flow === option}
              onClick={() => {
                setFlow(option);
                setPicking('none');
              }}
            >
              {FLOW_LABELS[option]}
            </button>
          ))}
        </div>

        <div className="entry-amount">
          <div className="value">
            {formatRaw(raw)}
            <i> ₽</i>
          </div>
          <button type="button" className="meta" onClick={() => setPicking(picking === 'account' ? 'none' : 'account')}>
            {activeAccount?.name ?? 'Нет счетов'}, сегодня
          </button>
        </div>

        {picking === 'none' && flow !== 'transfer' && (
          <div className="chips">
            {options.map((category) => (
              <button key={category.id} type="button" className="chip" onClick={() => void save(category.id, null)}>
                <em>{category.icon}</em>
                <span>{category.name}</span>
              </button>
            ))}
            <button type="button" className="chip ghost" onClick={() => setPicking('category')}>
              Другое
            </button>
          </div>
        )}

        {picking === 'none' && flow === 'transfer' && (
          <div className="chips">
            {accounts
              .filter((account) => account.id !== activeAccount?.id)
              .map((account) => (
                <button key={account.id} type="button" className="chip" onClick={() => void save(null, account.id)}>
                  <em>{account.icon}</em>
                  <span>{account.name}</span>
                </button>
              ))}
          </div>
        )}

        {picking !== 'none' && (
          <div className="chips scrollable">
            {picker.map((item) => (
              <button
                key={item.id}
                type="button"
                className="chip"
                onClick={() => {
                  if (picking === 'account') setAccountId(item.id);
                  else void save(item.id, null);
                  setPicking('none');
                }}
              >
                <em>{item.icon}</em>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        )}

        {picking === 'none' && <Keypad onKey={(key) => setRaw((current) => appendDigit(current, key))} />}
      </div>
    </>
  );
};
