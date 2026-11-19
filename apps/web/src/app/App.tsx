import { useEffect, useState } from 'react';
import { overlayStore, tabStore } from './navigation.ts';
import { sessionStore } from '../state/session.ts';
import { lockStore } from '../state/lock.ts';
import { TabBar } from '../ui/TabBar.tsx';
import { HomeScreen } from '../features/home/HomeScreen.tsx';
import { TransactionsScreen } from '../features/transactions/TransactionsScreen.tsx';
import { AnalyticsScreen } from '../features/analytics/AnalyticsScreen.tsx';
import { MoreScreen } from '../features/more/MoreScreen.tsx';
import { SavingsScreen } from '../features/savings/SavingsScreen.tsx';
import { EntrySheet } from '../features/entry/EntrySheet.tsx';
import { AuthScreen } from '../features/auth/AuthScreen.tsx';
import { LockScreen } from '../features/lock/LockScreen.tsx';

const SCREENS = {
  home: HomeScreen,
  transactions: TransactionsScreen,
  analytics: AnalyticsScreen,
  more: MoreScreen,
};

export const App = () => {
  const session = sessionStore.use();
  const lock = lockStore.use();
  const tab = tabStore.use();
  const overlay = overlayStore.use();
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  if (session.status === 'loading' || lock === 'unknown') return <div className="empty">Загружаем…</div>;

  if (session.status === 'anonymous') {
    return (
      <div className="screen">
        <AuthScreen needsBootstrap={session.needsBootstrap} needsSetupCode={session.needsSetupCode} />
      </div>
    );
  }

  if (lock === 'locked') return <LockScreen />;

  const Screen = SCREENS[tab];

  return (
    <div className="screen">
      <Screen />
      <TabBar active={tab} />
      {overlay?.kind === 'savings' && <SavingsScreen />}
      {overlay?.kind === 'entry' && <EntrySheet onSaved={setToast} />}
      {toast && (
        <div className="toast">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast('')}>
            Закрыть
          </button>
        </div>
      )}
    </div>
  );
};
