import { useState } from 'react';
import { formatMoney, monthKeyOf, monthName, parseAmount, spentByCategory, toMajor } from '@kubyshka/shared';
import type { Budget, Category } from '@kubyshka/shared';
import { useBudgets, useCategories, useTransactions } from '../../data/hooks.ts';
import { persist } from '../../db/repo.ts';
import { closeOverlay } from '../../app/navigation.ts';

type RowProps = {
  category: Category;
  budget: Budget | undefined;
  spent: number;
  month: string;
};

const LimitRow = ({ category, budget, spent, month }: RowProps) => {
  const [draft, setDraft] = useState(budget ? String(toMajor(budget.amount)) : '');

  const commit = () => {
    const amount = parseAmount(draft || '0');
    if (amount === (budget?.amount ?? 0)) return;
    void persist('budgets', { ...(budget ?? {}), categoryId: category.id, periodMonth: month, amount });
  };

  const limit = budget?.amount ?? 0;
  const over = limit > 0 && spent > limit;

  return (
    <div className="field" style={{ display: 'block' }}>
      <div className="row-between">
        <span>
          {category.icon} {category.name}
        </span>
        <input
          inputMode="numeric"
          placeholder="без лимита"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          style={{ maxWidth: 120 }}
        />
      </div>
      {limit > 0 && (
        <>
          <div className="track">
            <b
              style={{
                width: `${Math.min(100, (spent / limit) * 100)}%`,
                background: over ? 'var(--expense)' : 'var(--label-2)',
              }}
            />
          </div>
          <span className="caption">
            {formatMoney(spent)} из {formatMoney(limit)}
          </span>
        </>
      )}
    </div>
  );
};

export const LimitsScreen = () => {
  const categories = useCategories().filter((category) => category.flow === 'expense');
  const budgets = useBudgets();
  const transactions = useTransactions();

  const month = monthKeyOf(new Date());
  const spent = spentByCategory(transactions, month);

  return (
    <div className="screen" style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 8 }}>
      <div className="scroll">
        <button type="button" className="nav-back" onClick={closeOverlay}>
          ‹ Ещё
        </button>
        <div className="title-row">
          <h1>Лимиты</h1>
        </div>
        <p className="caption">Месячный потолок по категории на {monthName(month)}. Пустое поле — без ограничения.</p>

        <div className="card" style={{ padding: 0, marginTop: 14 }}>
          {categories.map((category) => (
            <LimitRow
              key={category.id}
              category={category}
              budget={budgets.find((item) => item.categoryId === category.id && item.periodMonth === month)}
              spent={spent.get(category.id) ?? 0}
              month={month}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
