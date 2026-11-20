import { MoneyAmount } from '../../ui/CurrencySign.tsx';
import { byId, useAccounts, useCategories, useTransactions } from '../../data/hooks.ts';
import { persist, softDelete } from '../../db/repo.ts';
import { closeOverlay, openEntry } from '../../app/navigation.ts';
import { sessionStore } from '../../state/session.ts';
import { clockLabel } from '../entry/when.ts';

export const TransactionSheet = ({ id, onRemoved }: { id: string; onRemoved: (text: string, undo: () => void) => void }) => {
  const transactions = useTransactions();
  const categories = byId(useCategories());
  const accounts = byId(useAccounts());
  const state = sessionStore.use();
  const transaction = transactions.find((item) => item.id === id);

  if (!transaction) return null;

  const category = transaction.categoryId ? categories.get(transaction.categoryId) : undefined;
  const account = accounts.get(transaction.accountId);
  const counter = transaction.counterAccountId ? accounts.get(transaction.counterAccountId) : undefined;
  const member = state.status === 'ready' ? state.members.find((item) => item.id === transaction.memberId) : undefined;
  const income = transaction.flow === 'income';
  const shown = transaction.flow === 'expense' ? -transaction.amount : transaction.amount;
  const title = counter ? `${account?.name ?? 'Счёт'} → ${counter.name}` : (category?.name ?? 'Без категории');

  const edit = () =>
    openEntry({
      id: transaction.id,
      flow: transaction.flow,
      amount: transaction.amount,
      accountId: transaction.accountId,
      counterAccountId: transaction.counterAccountId,
      categoryId: transaction.categoryId,
      memberId: transaction.memberId,
      occurredAt: transaction.occurredAt,
      note: transaction.note,
      tags: transaction.tags,
    });

  const remove = () => {
    const snapshot = transaction;
    void softDelete('transactions', snapshot.id);
    onRemoved('Операция удалена', () => {
      void persist('transactions', { ...snapshot, deleted: false });
    });
    closeOverlay();
  };

  return (
    <>
      <div className="backdrop" onClick={closeOverlay} />
      <div className="sheet compact" role="dialog" aria-label="Операция">
        <div className="grabber" />
        <div className="detail-amount">
          <div className={`value${income ? ' in' : ''}`} style={counter ? { color: 'var(--label)' } : undefined}>
            <MoneyAmount minor={shown} signed={income} />
          </div>
          <div className="what">
            {counter ? '⇄' : (category?.icon ?? '•')} {title}
          </div>
        </div>
        <div className="sheet-pad">
          <div className="card" style={{ padding: 0 }}>
            <div className="field">
              <span>Счёт</span>
              <span className="value">{counter ? `${account?.name ?? 'Счёт'} → ${counter.name}` : (account?.name ?? 'Счёт удалён')}</span>
            </div>
            <div className="field">
              <span>Когда</span>
              <span className="value">{clockLabel(transaction.occurredAt)}</span>
            </div>
            <div className="field">
              <span>Кто внёс</span>
              <span className="value">{member?.name ?? 'Участник'}</span>
            </div>
            <div className="field">
              <span>Заметка</span>
              <span className="value">{transaction.note || 'без заметки'}</span>
            </div>
          </div>
          <div className="actions">
            <button type="button" className="primary" onClick={edit}>
              Изменить
            </button>
            <button type="button" className="danger" onClick={remove}>
              Удалить
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
