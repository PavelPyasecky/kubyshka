import {
  formatMoney,
  monthKeyOf,
  monthName,
  savingsSnapshot,
  spentByCategory,
  totalBalance,
} from '@kubyshka/shared';
import { byId, useAccounts, useCategories, useFamily, useTransactions } from '../../data/hooks.ts';
import { openSavings, tabStore } from '../../app/navigation.ts';
import { sessionStore } from '../../state/session.ts';
import { TransactionRow } from '../transactions/TransactionRow.tsx';

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const HomeScreen = () => {
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useTransactions();
  const family = useFamily();
  const state = sessionStore.use();

  const month = monthKeyOf(new Date());
  const snapshot = savingsSnapshot({
    entries: transactions,
    month,
    now: new Date(),
    expectedIncome: family?.expectedIncome ?? 0,
    norm: family?.savingsNorm ?? 0,
  });

  const limits = [...spentByCategory(transactions, month).values()].reduce((sum, value) => sum + value, 0);
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
        <div className="amount-xl">{formatMoney(totalBalance(accounts, transactions))}</div>
      </div>

      <div className="card month">
        <button type="button" onClick={() => tabStore.set('analytics')}>
          <span className="caption">Потрачено</span>
          <div className="amount-m">{formatMoney(snapshot.expense)}</div>
          <div className="track">
            <b style={{ width: `${Math.min(100, (snapshot.expense / Math.max(1, limits || snapshot.expense)) * 100)}%`, background: 'var(--label-2)' }} />
          </div>
          <span className="caption">за {monthName(month)}</span>
        </button>

        <button type="button" onClick={openSavings}>
          <span className="caption">Отложено</span>
          <div className="amount-m">{formatMoney(snapshot.saved)}</div>
          <div className="track">
            <b
              style={{
                width: `${Math.max(0, Math.min(100, snapshot.normProgress * 100))}%`,
                background: onTrack ? 'var(--accent)' : 'var(--warn)',
              }}
            />
          </div>
          <span className="caption">норма {formatMoney(snapshot.norm)}</span>
        </button>

        <p className="forecast">
          К концу месяца при таком темпе отложится <b>{formatMoney(snapshot.forecastSaved)}</b>
        </p>
      </div>

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
            />
          ))}
        </div>
      )}
    </div>
  );
};
