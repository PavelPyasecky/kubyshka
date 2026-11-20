import { useMemo, useState } from 'react';
import { buildSuggestionIndex, currencyMark, minorToRaw, offeredCategories, parseAmount, suggestCategories } from '@kubyshka/shared';
import { CurrencySign } from '../../ui/CurrencySign.tsx';
import type { Transaction } from '@kubyshka/shared';
import { Keypad, appendDigit, formatRaw } from '../../ui/Keypad.tsx';
import { byId, useAccounts, useCategories, useTransactions } from '../../data/hooks.ts';
import { persist } from '../../db/repo.ts';
import { now } from '../../sync/clock.ts';
import { session } from '../../state/session.ts';
import { closeEntry, type EntrySeed } from '../../app/navigation.ts';
import { atNoon, dateLabel, dayOffset, isoDate, shiftCalendarDay } from './when.ts';

type Flow = Transaction['flow'];

const FLOW_LABELS: Record<Flow, string> = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' };

const tap = (): void => void navigator.vibrate?.(8);

export const EntrySheet = ({ seed, onSaved }: { seed: EntrySeed; onSaved: (message: string) => void }) => {
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useTransactions();

  const [flow, setFlow] = useState<Flow>(seed.flow ?? 'expense');
  const [raw, setRaw] = useState(seed.amount ? minorToRaw(seed.amount) : '');
  const [accountId, setAccountId] = useState(seed.accountId ?? '');
  const [counterId, setCounterId] = useState(seed.counterAccountId ?? '');
  const [occurredAt, setOccurredAt] = useState(seed.occurredAt ?? now());
  const [note, setNote] = useState(seed.note ?? '');
  const [picking, setPicking] = useState<'none' | 'account' | 'category'>('none');
  const [extras, setExtras] = useState(false);
  const [calendar, setCalendar] = useState(seed.occurredAt !== undefined && dayOffset(seed.occurredAt) > 1);

  const amount = parseAmount(raw || '0');
  const usable = accounts.filter((account) => !account.archived);
  const lastAccountId = transactions.find((item) => usable.some((account) => account.id === item.accountId))?.accountId;
  const activeAccount = usable.find((account) => account.id === accountId) ?? usable.find((account) => account.id === lastAccountId) ?? usable[0];
  const savings = usable.filter((account) => account.kind === 'savings' && account.id !== activeAccount?.id);
  const counter = usable.find((account) => account.id === counterId) ?? savings[0] ?? usable.find((account) => account.id !== activeAccount?.id);

  const suggestionIndex = useMemo(() => buildSuggestionIndex(transactions, new Date(occurredAt)), [transactions, occurredAt]);
  const categoriesById = byId(categories);
  const flowKind = flow === 'income' ? 'income' : 'expense';

  const options = useMemo(() => {
    const suggested = flow === 'income' ? [] : suggestCategories(suggestionIndex, { amount, now: new Date(occurredAt) }, 5);
    return offeredCategories(suggested, categories, flowKind, 5)
      .map((id) => categoriesById.get(id))
      .filter((category) => category !== undefined);
  }, [flow, flowKind, categories, suggestionIndex, amount, occurredAt, categoriesById]);

  const destinations = [
    ...usable.filter((account) => account.kind === 'savings' && account.id !== activeAccount?.id),
    ...usable.filter((account) => account.kind !== 'savings' && account.id !== activeAccount?.id),
  ];

  const save = async (categoryId: string | null, destinationId: string | null) => {
    if (amount <= 0 || !activeAccount) return;
    if (flow === 'transfer' && (!destinationId || destinationId === activeAccount.id)) return;
    const known = categoryId ? categoriesById.get(categoryId) : undefined;
    const resolvedCategory = flow === 'transfer' ? null : known && known.flow === flow ? known.id : null;
    if (flow !== 'transfer' && !resolvedCategory) return;

    await persist('transactions', {
      id: seed.id,
      flow,
      amount,
      accountId: activeAccount.id,
      counterAccountId: flow === 'transfer' ? destinationId : null,
      categoryId: resolvedCategory,
      memberId: seed.memberId ?? session.memberId,
      occurredAt,
      note: note.trim(),
      tags: seed.tags ?? [],
    });

    tap();
    onSaved(`${resolvedCategory ? known?.name : 'Перевод'}, ${formatRaw(raw)} ${currencyMark}`);
    closeEntry();
  };

  const chooseDate = (mode: 'today' | 'yesterday' | 'calendar') => {
    if (mode === 'calendar') {
      setCalendar(true);
      return;
    }
    setCalendar(false);
    setOccurredAt(mode === 'today' ? now() : shiftCalendarDay(now(), -1));
  };

  const dateMode = calendar || dayOffset(occurredAt) > 1 ? 'calendar' : dayOffset(occurredAt) === 1 ? 'yesterday' : 'today';
  const accountLabel =
    flow === 'transfer' && counter
      ? `${activeAccount?.name ?? 'Счёт'} → ${counter.name}`
      : (activeAccount?.name ?? 'Нет счетов');

  const picker = picking === 'account' ? usable : categories.filter((category) => category.flow === flow && !category.archived);

  return (
    <>
      <div className="backdrop raised" onClick={closeEntry} />
      <div className="sheet raised" role="dialog" aria-label={seed.id ? 'Изменить операцию' : 'Новая операция'}>
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

        <div className="sheet-body">
          <div className="entry-amount">
            <div className="value">
              {formatRaw(raw)}
              <i>
                <CurrencySign />
              </i>
              <span className="sr-only"> {currencyMark}</span>
            </div>
            <div className="entry-tools">
              <button
                type="button"
                className="meta"
                onClick={() => {
                  setPicking(picking === 'account' ? 'none' : 'account');
                  setExtras(false);
                }}
              >
                {accountLabel} · {dateLabel(occurredAt)}
              </button>
              <button
                type="button"
                className="meta-more"
                aria-label="Дата и заметка"
                aria-pressed={extras}
                onClick={() => {
                  setExtras((open) => !open);
                  setPicking('none');
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="4" y="5" width="16" height="15" rx="2" />
                  <path d="M8 3v4M16 3v4M4 10h16" />
                </svg>
              </button>
            </div>
          </div>

          {extras && (
            <div className="extras">
              <div className="segmented">
                <button type="button" aria-pressed={dateMode === 'today'} onClick={() => chooseDate('today')}>
                  Сегодня
                </button>
                <button type="button" aria-pressed={dateMode === 'yesterday'} onClick={() => chooseDate('yesterday')}>
                  Вчера
                </button>
                <button type="button" aria-pressed={dateMode === 'calendar'} onClick={() => chooseDate('calendar')}>
                  Дата
                </button>
              </div>
              {dateMode === 'calendar' && (
                <input type="date" value={isoDate(occurredAt)} onChange={(event) => event.target.value && setOccurredAt(atNoon(event.target.value))} />
              )}
              <input
                type="text"
                placeholder="Заметка"
                maxLength={200}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          )}

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
              {destinations.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className="chip"
                  aria-pressed={account.id === counter?.id}
                  onClick={() => void save(null, account.id)}
                >
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
        </div>

        {seed.id && picking === 'none' && (
          <div className="pad-inline">
            <button type="button" className="primary" onClick={() => void save(seed.categoryId ?? null, counter?.id ?? null)}>
              Сохранить
            </button>
          </div>
        )}

        {picking === 'none' && <Keypad onKey={(key) => setRaw((current) => appendDigit(current, key))} />}
      </div>
    </>
  );
};
