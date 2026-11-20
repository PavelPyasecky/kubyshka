import {
  accountBalances,
  averageSaved,
  fullestSpendingAccount,
  lastMonths,
  monthKeyOf,
  monthName,
  monthNameIn,
  monthNameShort,
  savedByMonth,
  savingsBalance,
  savingsMovement,
  savingsSnapshot,
  untransferred,
} from '@kubyshka/shared';
import type { MonthKey } from '@kubyshka/shared';
import { useAccounts, useFamily, useTransactions } from '../../data/hooks.ts';
import { closeOverlay, openEntry } from '../../app/navigation.ts';
import { EmptyState } from '../../ui/EmptyState.tsx';
import { MoneyAmount } from '../../ui/CurrencySign.tsx';

const columnPercent = (value: number, span: number): number => {
  if (span <= 0 || value === 0) return 0;
  const percent = Number((BigInt(Math.abs(value)) * 100n) / BigInt(span));
  return percent > 100 ? 100 : percent;
};

const HistoryChart = ({
  months,
  values,
  norm,
  plannedIndex,
}: {
  months: MonthKey[];
  values: number[];
  norm: number;
  plannedIndex: number;
}) => {
  const max = Math.max(norm, ...values, 0);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const zero = min >= 0 ? 0 : Number((BigInt(-min) * 100n) / BigInt(span));
  const normAt = Number((BigInt(Math.max(0, norm - min)) * 100n) / BigInt(span));

  return (
    <div className="history">
      <div className="plots">
        {norm > 0 && <i style={{ bottom: `${normAt}%` }} />}
        {months.map((key, index) => {
          const value = values[index] ?? 0;
          const height = Math.max(columnPercent(value, span), value > 0 ? 2 : 0);
          const down = value < 0;
          return (
            <div className="plot" key={key}>
              <u
                className={[index === plannedIndex ? 'plan' : '', down ? 'down' : ''].filter(Boolean).join(' ') || undefined}
                style={
                  down
                    ? { height: `${columnPercent(value, span)}%`, bottom: `${zero - columnPercent(value, span)}%` }
                    : { height: `${height}%`, bottom: `${zero}%` }
                }
              />
            </div>
          );
        })}
      </div>
      <div className="labels">
        {months.map((key) => (
          <span key={key}>{monthNameShort(key)}</span>
        ))}
      </div>
    </div>
  );
};

export const SavingsScreen = () => {
  const accounts = useAccounts().filter((account) => !account.archived);
  const transactions = useTransactions();
  const family = useFamily();

  const month = monthKeyOf(new Date());
  const snapshot = savingsSnapshot({
    entries: transactions,
    month,
    now: new Date(),
    expectedIncome: family?.expectedIncome ?? 0,
    norm: family?.savingsNorm ?? 0,
  });

  const months = lastMonths(month, 12);
  const history = savedByMonth(transactions, months);
  const values = months.map((key, index) => (index === months.length - 1 ? snapshot.forecastSaved : (history.get(key) ?? 0)));
  const completed = months.slice(-4, -1);
  const average = averageSaved(transactions, completed);
  const movement = savingsMovement(accounts, transactions, month);
  const gap = untransferred(snapshot.saved, movement.transferred);
  const pot = accounts.find((account) => account.kind === 'savings');
  const source = fullestSpendingAccount(accounts, accountBalances(accounts, transactions));
  const inPot = savingsBalance(accounts, transactions);
  const onTrack = snapshot.normProgress >= 1;
  const negative = values.some((value) => value < 0);

  const transfer = () =>
    openEntry({
      flow: 'transfer',
      amount: gap,
      accountId: source?.id,
      counterAccountId: pot?.id,
    });

  return (
    <div className="screen overlay">
      <div className="scroll">
        <button type="button" className="nav-back" onClick={closeOverlay}>
          ‹ Главная
        </button>
        <div className="title-row">
          <h1>Накопления</h1>
        </div>

        <div className="card">
          <span className="caption">В копилке</span>
          <div className="amount-xl">
            <MoneyAmount minor={inPot} />
          </div>
          {movement.delta !== 0 && (
            <div className="delta" style={movement.delta < 0 ? { color: 'var(--expense)' } : undefined}>
              <MoneyAmount minor={movement.delta} signed /> в {monthNameIn(month)}
            </div>
          )}
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            title="Копилка посчитается сама"
            text="Запишите доход и расход. Здесь будет видно, сколько получается откладывать и что ещё лежит на картах."
            action="Добавить операцию"
            onAction={() => openEntry()}
          />
        ) : (
          <>
            <div className="card">
              <div className="row-between">
                <span className="caption">Отложено в {monthNameIn(month)}</span>
                <span className="caption">
                  норма <MoneyAmount minor={snapshot.norm} />
                </span>
              </div>
              <div className="amount-l">
                <MoneyAmount minor={snapshot.saved} />
              </div>
              <div className="track">
                <b
                  style={{
                    width: `${Math.max(0, Math.min(100, snapshot.normProgress * 100))}%`,
                    background: onTrack ? 'var(--accent)' : 'var(--warn)',
                  }}
                />
              </div>
              <div className="row-between">
                <span className="caption">
                  К концу месяца <MoneyAmount minor={snapshot.forecastSaved} />
                </span>
                <span className="caption" style={{ color: onTrack ? 'var(--accent)' : 'var(--warn)' }}>
                  {Math.round(snapshot.normProgress * 100)}% нормы
                </span>
              </div>
            </div>

            <div className="card">
              <span className="caption">Сколько откладывали</span>
              <HistoryChart months={months} values={values} norm={snapshot.norm} plannedIndex={months.length - 1} />
              <p className="note">
                {average > 0 ? (
                  <>
                    В среднем за три месяца <MoneyAmount minor={average} />, это {average >= snapshot.norm ? 'не ниже' : 'ниже'} нормы
                  </>
                ) : (
                  'История появится через пару месяцев'
                )}
                {negative ? '. Столбец вниз — потратили больше, чем получили' : ''}
              </p>
            </div>

            <div className="card">
              <div className="row-between" style={{ alignItems: 'center' }}>
                <div>
                  <span className="caption">Переведено в копилку</span>
                  <div className="amount-m">
                    <MoneyAmount minor={movement.transferred} />
                  </div>
                </div>
                <button type="button" className="pill" onClick={transfer} disabled={!pot}>
                  Перевести
                </button>
              </div>
              <p className="note">
                {!pot
                  ? 'Добавьте накопительный счёт в разделе счетов, и перевод встанет в него'
                  : gap > 0
                    ? <>Остальные <MoneyAmount minor={gap} /> пока лежат на картах</>
                    : 'Всё отложенное в этом месяце уже в копилке'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
