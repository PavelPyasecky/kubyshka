import { formatSigned } from '@kubyshka/shared';
import type { Transaction } from '@kubyshka/shared';
import { byId, useAccounts, useCategories, useTransactions } from '../../data/hooks.ts';
import { sessionStore } from '../../state/session.ts';
import { openTransaction } from '../../app/navigation.ts';
import { TransactionRow } from './TransactionRow.tsx';

const dayFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

const dayTitle = (time: number): string => {
  const today = new Date();
  const date = new Date(time);
  const difference = Math.round((today.setHours(0, 0, 0, 0) - new Date(time).setHours(0, 0, 0, 0)) / 86_400_000);
  if (difference === 0) return `Сегодня, ${dayFormatter.format(date)}`;
  if (difference === 1) return `Вчера, ${dayFormatter.format(date)}`;
  return dayFormatter.format(date);
};

const groupByDay = (transactions: Transaction[]): [string, Transaction[]][] => {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const key = new Date(transaction.occurredAt).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }
  return [...groups.values()].map((group) => [dayTitle(group[0].occurredAt), group]);
};

const dayTotal = (group: Transaction[]): number =>
  group.reduce((sum, item) => {
    if (item.flow === 'income') return sum + item.amount;
    if (item.flow === 'expense') return sum - item.amount;
    return sum;
  }, 0);

export const TransactionsScreen = () => {
  const transactions = useTransactions();
  const categories = byId(useCategories());
  const accounts = byId(useAccounts());
  const state = sessionStore.use();
  const members = state.status === 'ready' ? state.members : [];

  if (transactions.length === 0) {
    return (
      <div className="scroll">
        <div className="title-row">
          <h1>Операции</h1>
        </div>
        <p className="empty">Здесь появятся все записи. Начните с кнопки плюс.</p>
      </div>
    );
  }

  return (
    <div className="scroll">
      <div className="title-row">
        <h1>Операции</h1>
      </div>

      {groupByDay(transactions).map(([title, group]) => (
        <section key={title}>
          <div className="day-head">
            <span>{title}</span>
            <span>{formatSigned(dayTotal(group))}</span>
          </div>
          <div className="list">
            {group.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                categories={categories}
                accounts={accounts}
                members={members}
                onSelect={() => openTransaction(transaction.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
