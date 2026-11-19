import { useState } from 'react';
import { formatMoney, monthKeyOf, monthName, savingsSnapshot, shiftMonth, spentByCategory } from '@kubyshka/shared';
import { byId, useCategories, useFamily, useTransactions } from '../../data/hooks.ts';

const RADIUS = 15.9;

export const AnalyticsScreen = () => {
  const transactions = useTransactions();
  const categories = byId(useCategories());
  const family = useFamily();
  const [offset, setOffset] = useState(0);

  const month = shiftMonth(monthKeyOf(new Date()), offset);
  const snapshot = savingsSnapshot({
    entries: transactions,
    month,
    now: new Date(),
    expectedIncome: family?.expectedIncome ?? 0,
    norm: family?.savingsNorm ?? 0,
  });

  const totals = [...spentByCategory(transactions, month).entries()]
    .map(([categoryId, amount]) => ({ category: categories.get(categoryId), amount }))
    .sort((a, b) => b.amount - a.amount);

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
          <strong style={{ color: snapshot.saved >= 0 ? 'var(--income)' : 'var(--expense)' }}>
            {formatMoney(snapshot.saved)}
          </strong>
        </div>
      </div>

      {totals.length === 0 ? (
        <p className="empty">За этот месяц расходов нет</p>
      ) : (
        <div className="card">
          <div className="donut-wrap">
            <svg width="190" height="190" viewBox="0 0 42 42" aria-hidden="true">
              {totals.map(({ category, amount }) => {
                const share = (amount / snapshot.expense) * 100;
                const circle = (
                  <circle
                    key={category?.id ?? 'other'}
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
            {totals.map(({ category, amount }) => (
              <div className="cat-row" key={category?.id ?? 'other'}>
                <div className="name">
                  <i style={{ background: category?.color ?? '#8E8E93' }} />
                  {category?.name ?? 'Без категории'}
                </div>
                <div className="val">{formatMoney(amount)}</div>
                <div className="sub">{Math.round((amount / snapshot.expense) * 100)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
