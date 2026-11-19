import { useState } from 'react';
import {
  elapsedDays,
  formatMoney,
  monthKeyOf,
  monthName,
  monthNameIn,
  monthNameShort,
  roundToRubles,
  savingsSnapshot,
  sharePercent,
  shiftMonth,
  spentByAccount,
  spentByCategory,
  spentByMember,
  topExpenses,
} from '@kubyshka/shared';
import { byId, useAccounts, useCategories, useFamily, useTransactions } from '../../data/hooks.ts';
import { openEntry, openTransaction } from '../../app/navigation.ts';
import { sessionStore } from '../../state/session.ts';
import { EmptyState } from '../../ui/EmptyState.tsx';

const RADIUS = 15.9;

const barShare = (part: number, whole: number): number => {
  if (part <= 0 || whole <= 0) return 0;
  const percent = sharePercent(part, whole);
  return percent === 0 ? 2 : percent;
};

const deltaText = (current: number, previous: number, previousName: string): string => {
  if (previous === 0) return 'в прошлом месяце не было';
  if (current === previous) return `как в ${previousName}`;
  const delta = current - previous;
  return delta > 0 ? `на ${formatMoney(delta)} больше` : `на ${formatMoney(-delta)} меньше`;
};

export const AnalyticsScreen = () => {
  const transactions = useTransactions();
  const categories = byId(useCategories());
  const accounts = byId(useAccounts());
  const family = useFamily();
  const state = sessionStore.use();
  const members = state.status === 'ready' ? state.members : [];
  const [offset, setOffset] = useState(0);

  const now = new Date();
  const month = shiftMonth(monthKeyOf(now), offset);
  const previous = shiftMonth(month, -1);
  const snapshot = savingsSnapshot({
    entries: transactions,
    month,
    now,
    expectedIncome: family?.expectedIncome ?? 0,
    norm: family?.savingsNorm ?? 0,
  });

  const currentSpend = spentByCategory(transactions, month);
  const previousSpend = spentByCategory(transactions, previous);
  const totals = [...currentSpend.entries()]
    .map(([categoryId, amount]) => ({ category: categories.get(categoryId), amount, previous: previousSpend.get(categoryId) ?? 0 }))
    .sort((a, b) => b.amount - a.amount);

  const months = Array.from({ length: 12 }, (_, index) => shiftMonth(month, index - 11));
  const flows = months.map((key) =>
    savingsSnapshot({ entries: transactions, month: key, now, expectedIncome: 0, norm: 0 }),
  );
  const peak = flows.reduce((max, item) => Math.max(max, item.income, item.expense), 0);
  const largest = topExpenses(transactions, month, 10);
  const byMember = [...spentByMember(transactions, month).entries()].sort((a, b) => b[1] - a[1]);
  const byAccount = [...spentByAccount(transactions, month).entries()].sort((a, b) => b[1] - a[1]);
  const perDay = roundToRubles(Number(BigInt(snapshot.expense) / BigInt(Math.max(1, elapsedDays(month, now)))));
  let dashOffset = 25;

  return (
    <div className="scroll">
      <div className="month-nav">
        <button type="button" onClick={() => setOffset(offset - 1)} aria-label="Предыдущий месяц">
          ‹
        </button>
        <span>{monthName(month)}</span>
        <button type="button" onClick={() => setOffset(Math.min(0, offset + 1))} aria-label="Следующий месяц" disabled={offset >= 0}>
          ›
        </button>
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          title="Пока нечего сравнивать"
          text="Запишите расходы за пару недель, и здесь будет видно, на что уходят деньги."
          action="Добавить операцию"
          onAction={() => openEntry()}
        />
      ) : (
        <>
          <div className="card totals">
            <div>
              <span className="caption">Пришло</span>
              <strong style={{ color: 'var(--income)' }}>{formatMoney(snapshot.income)}</strong>
            </div>
            <div>
              <span className="caption">Ушло</span>
              <strong>{formatMoney(snapshot.expense)}</strong>
            </div>
            <div>
              <span className="caption">Разница</span>
              <strong style={{ color: snapshot.saved >= 0 ? 'var(--income)' : 'var(--expense)' }}>{formatMoney(snapshot.saved)}</strong>
            </div>
          </div>

          {totals.length === 0 ? (
            <EmptyState
              title="В этом месяце расходов нет"
              text="Запишите трату, и она появится в кольце категорий."
              action="Добавить операцию"
              onAction={() => openEntry()}
            />
          ) : (
            <div className="card">
              <div className="donut-wrap">
                <svg width="190" height="190" viewBox="0 0 42 42" aria-hidden="true">
                  {totals.map(({ category, amount }) => {
                    const share = snapshot.expense === 0 ? 0 : (amount / snapshot.expense) * 100;
                    const circle = (
                      <circle
                        key={category?.id ?? amount}
                        cx="21"
                        cy="21"
                        r={RADIUS}
                        fill="none"
                        stroke={category?.color ?? '#8E8E93'}
                        strokeWidth="5.5"
                        strokeDasharray={`${share} ${100 - share}`}
                        strokeDashoffset={dashOffset}
                      />
                    );
                    dashOffset -= share;
                    return circle;
                  })}
                </svg>
                <div className="donut-center">
                  <span className="caption">Расходы</span>
                  <b>{formatMoney(snapshot.expense)}</b>
                </div>
              </div>

              <div style={{ margin: '0 -14px' }}>
                {totals.map(({ category, amount, previous: previousAmount }) => (
                  <div className="cat-row" key={category?.id ?? 'other'}>
                    <div className="name">
                      <i style={{ background: category?.color ?? '#8E8E93' }} />
                      {category?.name ?? 'Без категории'}
                    </div>
                    <div className="val">{formatMoney(amount)}</div>
                    <div className="sub">
                      {sharePercent(amount, snapshot.expense)}%, {deltaText(amount, previousAmount, monthNameIn(previous))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <span className="caption">Доходы и расходы за год</span>
            <div className="bars" aria-hidden="true">
              {flows.map((item, index) => (
                <div key={months[index]}>
                  <div className="pair">
                    <u style={{ height: `${barShare(item.income, peak)}%`, background: 'var(--income)' }} />
                    <u style={{ height: `${barShare(item.expense, peak)}%`, background: 'var(--label-3)' }} />
                  </div>
                  <span>{monthNameShort(months[index] ?? month)}</span>
                </div>
              ))}
            </div>
          </div>

          {largest.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="section-head" style={{ padding: '12px 14px 0' }}>
                <h2>Крупные траты</h2>
              </div>
              {largest.map((transaction) => {
                const category = transaction.categoryId ? categories.get(transaction.categoryId) : undefined;
                return (
                  <button type="button" className="op" key={transaction.id} onClick={() => openTransaction(transaction.id)}>
                    <div className="ic" style={{ background: `${category?.color ?? '#8E8E93'}1A` }}>
                      {category?.icon ?? '•'}
                    </div>
                    <div className="txt">
                      <b>{category?.name ?? 'Без категории'}</b>
                      <span>{transaction.note || monthName(month)}</span>
                    </div>
                    <div className="sum">−{formatMoney(transaction.amount)}</div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="card">
            <span className="caption">По людям</span>
            {byMember.length === 0 ? (
              <p className="note">Расходов за месяц нет</p>
            ) : (
              byMember.map(([memberId, amount]) => (
                <div className="cat-row" key={memberId}>
                  <div className="name">{members.find((member) => member.id === memberId)?.name ?? 'Участник'}</div>
                  <div className="val">{formatMoney(amount)}</div>
                  <div className="sub">{sharePercent(amount, snapshot.expense)}%</div>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <span className="caption">По счетам</span>
            {byAccount.length === 0 ? (
              <p className="note">Расходов за месяц нет</p>
            ) : (
              byAccount.map(([accountId, amount]) => (
                <div className="cat-row" key={accountId}>
                  <div className="name">{accounts.get(accountId)?.name ?? 'Счёт'}</div>
                  <div className="val">{formatMoney(amount)}</div>
                  <div className="sub">{sharePercent(amount, snapshot.expense)}%</div>
                </div>
              ))
            )}
          </div>

          {offset === 0 && snapshot.expense > 0 && (
            <p className="note" style={{ padding: '0 4px 12px' }}>
              В среднем {formatMoney(perDay)} в день, к концу месяца около {formatMoney(snapshot.forecastExpense)}
            </p>
          )}
        </>
      )}
    </div>
  );
};
