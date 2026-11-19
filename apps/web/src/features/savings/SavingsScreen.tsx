import {
  averageSaved,
  formatMoney,
  lastMonths,
  monthKeyOf,
  monthNameShort,
  savedByMonth,
  savingsBalance,
  savingsSnapshot,
} from '@kubyshka/shared';
import { useAccounts, useFamily, useTransactions } from '../../data/hooks.ts';
import { closeOverlay, openEntry } from '../../app/navigation.ts';

export const SavingsScreen = () => {
  const accounts = useAccounts();
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
  const completed = months.slice(-4, -1);
  const average = averageSaved(transactions, completed);

  const scale = Math.max(snapshot.norm, snapshot.forecastSaved, ...[...history.values()].map(Math.abs), 1);
  const inPot = savingsBalance(accounts, transactions);
  const onTrack = snapshot.normProgress >= 1;

  return (
    <div className="screen" style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 8 }}>
      <div className="scroll">
        <button type="button" className="nav-back" onClick={closeOverlay}>
          ‹ Главная
        </button>
        <div className="title-row">
          <h1>Накопления</h1>
        </div>

        <div className="card">
          <span className="caption">В копилке</span>
          <div className="amount-xl">{formatMoney(inPot)}</div>
        </div>

        <div className="card">
          <div className="row-between">
            <span className="caption">Отложено в этом месяце</span>
            <span className="caption">норма {formatMoney(snapshot.norm)}</span>
          </div>
          <div className="amount-l">{formatMoney(snapshot.saved)}</div>
          <div className="track">
            <b
              style={{
                width: `${Math.max(0, Math.min(100, snapshot.normProgress * 100))}%`,
                background: onTrack ? 'var(--accent)' : 'var(--warn)',
              }}
            />
          </div>
          <div className="row-between">
            <span className="caption">К концу месяца {formatMoney(snapshot.forecastSaved)}</span>
            <span className="caption" style={{ color: onTrack ? 'var(--accent)' : 'var(--warn)' }}>
              {Math.round(snapshot.normProgress * 100)}% нормы
            </span>
          </div>
        </div>

        <div className="card">
          <span className="caption">Сколько откладывали</span>
          <div className="savebars">
            {snapshot.norm > 0 && <i style={{ bottom: `${15 + (snapshot.norm / scale) * 74}%` }} />}
            {months.map((key, index) => {
              const value = index === months.length - 1 ? snapshot.forecastSaved : (history.get(key) ?? 0);
              return (
                <div key={key}>
                  <u
                    className={index === months.length - 1 ? 'plan' : undefined}
                    style={{ height: `${Math.max(2, (Math.max(0, value) / scale) * 80)}%` }}
                  />
                  <span>{monthNameShort(key)}</span>
                </div>
              );
            })}
          </div>
          <p className="note">
            {average > 0
              ? `В среднем за три месяца ${formatMoney(average)}, это ${average >= snapshot.norm ? 'не ниже' : 'ниже'} нормы`
              : 'История появится через пару месяцев'}
          </p>
        </div>

        <div className="card">
          <div className="row-between" style={{ alignItems: 'center' }}>
            <div>
              <span className="caption">Лежит не в копилке</span>
              <div className="amount-m">{formatMoney(Math.max(0, snapshot.saved - inPot))}</div>
            </div>
            <button type="button" className="pill" onClick={openEntry}>
              Перевести
            </button>
          </div>
          <p className="note">Эти деньги на картах и могут незаметно разойтись</p>
        </div>
      </div>
    </div>
  );
};
