import type { Account, Category, Transaction } from '@kubyshka/shared';
import type { Member } from '../../state/session.ts';
import { MoneyAmount } from '../../ui/CurrencySign.tsx';

type Props = {
  transaction: Transaction;
  categories: Map<string, Category>;
  accounts: Map<string, Account>;
  members: Member[];
  onSelect?: (transaction: Transaction) => void;
};

export const TransactionRow = ({ transaction, categories, accounts, members, onSelect }: Props) => {
  const category = transaction.categoryId ? categories.get(transaction.categoryId) : undefined;
  const account = accounts.get(transaction.accountId);
  const counter = transaction.counterAccountId ? accounts.get(transaction.counterAccountId) : undefined;
  const member = members.find((item) => item.id === transaction.memberId);

  const title = counter ? `В ${counter.name.toLowerCase()}` : (category?.name ?? 'Без категории');
  const subtitle = [account?.name, member?.name].filter(Boolean).join(', ');
  const income = transaction.flow === 'income';
  const shown = transaction.flow === 'expense' ? -transaction.amount : transaction.amount;

  return (
    <button type="button" className="op" onClick={() => onSelect?.(transaction)}>
      <div className="ic" style={{ background: `${category?.color ?? '#8E8E93'}1A` }}>
        {counter ? '⇄' : (category?.icon ?? '•')}
      </div>
      <div className="txt">
        <b>{title}</b>
        <span>{subtitle}</span>
      </div>
      <div className={`sum${income ? ' in' : ''}`} style={counter ? { color: 'var(--label-2)' } : undefined}>
        <MoneyAmount minor={shown} signed={income} />
      </div>
    </button>
  );
};
