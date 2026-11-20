import { useEffect, useState } from 'react';
import { entryStore, overlayStore, tabStore } from './navigation.ts';
import { sessionStore } from '../state/session.ts';
import { lockStore } from '../state/lock.ts';
import { onboardingStore } from '../state/onboarding.ts';
import { recoveryStore } from '../state/recovery.ts';
import { TabBar } from '../ui/TabBar.tsx';
import { HomeScreen } from '../features/home/HomeScreen.tsx';
import { TransactionsScreen } from '../features/transactions/TransactionsScreen.tsx';
import { AnalyticsScreen } from '../features/analytics/AnalyticsScreen.tsx';
import { MoreScreen } from '../features/more/MoreScreen.tsx';
import { SavingsScreen } from '../features/savings/SavingsScreen.tsx';
import { LimitsScreen } from '../features/limits/LimitsScreen.tsx';
import { AccountsScreen } from '../features/accounts/AccountsScreen.tsx';
import { CategoriesScreen } from '../features/categories/CategoriesScreen.tsx';
import { InviteScreen } from '../features/family/InviteScreen.tsx';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen.tsx';
import { EntrySheet } from '../features/entry/EntrySheet.tsx';
import { TransactionSheet } from '../features/transactions/TransactionSheet.tsx';
import { AuthScreen } from '../features/auth/AuthScreen.tsx';
import { NeedsKeyScreen } from '../features/auth/NeedsKeyScreen.tsx';
import { RecoveryScreen } from '../features/family/RecoveryScreen.tsx';
import { LockScreen } from '../features/lock/LockScreen.tsx';
import { UpdateBanner } from '../features/update/UpdateBanner.tsx';

const SCREENS = {
  home: HomeScreen,
  transactions: TransactionsScreen,
  analytics: AnalyticsScreen,
  more: MoreScreen,
};

type Notice = { text: string; undo?: () => void };

export const App = () => {
  const session = sessionStore.use();
  const lock = lockStore.use();
  const onboarding = onboardingStore.use();
  const recovery = recoveryStore.use();
  const tab = tabStore.use();
  const overlay = overlayStore.use();
  const entry = entryStore.use();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.undo ? 5000 : 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const removed = (text: string, undo: () => void) => setNotice({ text, undo });

  if (session.status === 'loading' || lock === 'unknown' || recovery === 'unknown') return <div className="empty">Загружаем…</div>;

  if (session.status === 'anonymous') {
    return (
      <div className="screen">
        <UpdateBanner />
        <AuthScreen needsBootstrap={session.needsBootstrap} needsSetupCode={session.needsSetupCode} />
      </div>
    );
  }

  if (lock === 'locked') {
    return (
      <div className="screen">
        <UpdateBanner />
        <LockScreen />
      </div>
    );
  }

  if (session.status === 'needs-key') {
    return (
      <div className="screen">
        <UpdateBanner />
        <NeedsKeyScreen />
      </div>
    );
  }

  if (recovery === 'pending') {
    return (
      <div className="screen">
        <UpdateBanner />
        <RecoveryScreen mode="acknowledge" />
      </div>
    );
  }

  if (onboarding === 'needed') {
    return (
      <div className="screen">
        <UpdateBanner />
        <OnboardingScreen />
      </div>
    );
  }

  const Screen = SCREENS[tab];

  return (
    <div className="screen">
      <UpdateBanner />
      <Screen />
      <TabBar active={tab} />
      {overlay?.kind === 'savings' && <SavingsScreen />}
      {overlay?.kind === 'limits' && <LimitsScreen />}
      {overlay?.kind === 'accounts' && <AccountsScreen />}
      {overlay?.kind === 'categories' && <CategoriesScreen />}
      {overlay?.kind === 'invite' && <InviteScreen />}
      {overlay?.kind === 'recovery' && <RecoveryScreen mode="reveal" />}
      {overlay?.kind === 'transaction' && <TransactionSheet id={overlay.id} onRemoved={removed} />}
      {entry && <EntrySheet key={entry.id ?? 'new'} seed={entry} onSaved={(text) => setNotice({ text })} />}
      {notice && (
        <div className="toast">
          <span>{notice.text}</span>
          {notice.undo ? (
            <button
              type="button"
              onClick={() => {
                notice.undo?.();
                setNotice(null);
              }}
            >
              Отменить
            </button>
          ) : (
            <button type="button" onClick={() => setNotice(null)}>
              Закрыть
            </button>
          )}
        </div>
      )}
    </div>
  );
};
