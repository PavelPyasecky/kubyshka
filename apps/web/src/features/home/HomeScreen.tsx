import {
  buildInsights,
  daysInMonth,
  monthKeyOf,
  monthName,
  savingsSnapshot,
  totalBalance,
} from '@kubyshka/shared';
import { byId, useAccounts, useBudgets, useCategories, useFamily, useTransactions } from '../../data/hooks.ts';
import { openSavings, openTransaction, tabStore } from '../../app/navigation.ts';
import { sessionStore } from '../../state/session.ts';
import { TransactionRow } from '../transactions/TransactionRow.tsx';
import { InsightList } from '../insights/InsightList.tsx';
import { MoneyAmount } from '../../ui/CurrencySign.tsx';

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const HomeScreen = () => {
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useTransactions();
  const budgets = useBudgets();
  const family = useFamily();
  const state = sessionStore.use();

  const month = monthKeyOf(new Date());
  const now = new Date();

  const snapshot = savingsSnapshot({
    entries: transactions,
    month,
    now,
    expectedIncome: family?.expectedIncome ?? 0,
    norm: family?.savingsNorm ?? 0,
  });

  const limit = budgets
    .filter((budget) => budget.periodMonth === month)
    .reduce((sum, budget) => sum + budget.amount, 0);

  const insights = buildInsights({ transactions, categories, budgets, savings: snapshot, month, now });
  const members = state.status === 'ready' ? state.members : [];
  const recent = transactions.slice(0, 3);
  const onTrack = snapshot.normProgress >= 1;

  return (
    <div className="scroll">
      <div className="title-row">
        <h1>{capitalize(monthName(month))}</h1>
        <div className="people">
          {members.map((member) => (
            <i key={member.id} style={{ background: member.color }}>
              {member.name.charAt(0)}
            </i>
          ))}
        </div>
      </div>

      <div className="hero">
        <span className="caption">Все счета</span>
        <div className="amount-xl">
          <MoneyAmount minor={totalBalance(accounts, transactions)} />
        </div>
      </div>

      <div className="card month">
        <button type="button" onClick={() => tabStore.set('analytics')}>
          <span className="caption">Потрачено</span>
          <div className="amount-m">
            <MoneyAmount minor={snapshot.expense} />
          </div>
          {limit > 0 && (
            <div className="track">
              <b style={{ width: `${Math.min(100, (snapshot.expense / limit) * 100)}%`, background: 'var(--label-2)' }} />
              <u style={{ left: `${(now.getDate() / daysInMonth(month)) * 100}%` }} />
            </div>
          )}
          <span className="caption">{limit > 0 ? <>из <MoneyAmount minor={limit} /></> : `за ${monthName(month)}`}</span>
        </button>

        <button type="button" onClick={openSavings}>
          <span className="caption">Отложится</span>
          <div className="amount-m">
            ≈ <MoneyAmount minor={snapshot.forecastSaved} />
          </div>
          <div className="track">
            <b
              style={{
                width: `${Math.max(0, Math.min(100, snapshot.normProgress * 100))}%`,
                background: onTrack ? 'var(--accent)' : 'var(--warn)',
              }}
            />
          </div>
          <span className="caption">
            норма <MoneyAmount minor={snapshot.norm} />
          </span>
        </button>

        <p className="forecast">
          Сейчас отложено{' '}
          <b>
            <MoneyAmount minor={snapshot.saved} />
          </b>
        </p>
      </div>

      <InsightList insights={insights} month={month} />

      <div className="section-head">
        <h2>Последние</h2>
        {transactions.length > 0 && (
          <button type="button" onClick={() => tabStore.set('transactions')}>
            Все
          </button>
        )}
      </div>

      {recent.length === 0 ? (
        <p className="empty">Пока ничего не записано. Нажмите плюс и внесите первую трату.</p>
      ) : (
        <div className="list">
          {recent.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              categories={byId(categories)}
              accounts={byId(accounts)}
              members={members}
              onSelect={() => openTransaction(transaction.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
