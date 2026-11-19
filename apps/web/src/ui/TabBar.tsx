import type { Tab } from '../app/navigation.ts';
import { openEntry, tabStore } from '../app/navigation.ts';

const ICONS: Record<Tab, string> = {
  home: 'M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z',
  transactions: 'M4 7h16M4 12h16M4 17h10',
  analytics: 'M5 19V9M12 19V5M19 19v-7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

const LABELS: Record<Tab, string> = {
  home: 'Главная',
  transactions: 'Операции',
  analytics: 'Аналитика',
  more: 'Ещё',
};

const TabButton = ({ tab, active }: { tab: Tab; active: boolean }) => (
  <button type="button" aria-current={active ? 'page' : undefined} onClick={() => tabStore.set(tab)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d={ICONS[tab]} />
    </svg>
    {LABELS[tab]}
  </button>
);

export const TabBar = ({ active }: { active: Tab }) => (
  <nav className="tabbar">
    <TabButton tab="home" active={active === 'home'} />
    <TabButton tab="transactions" active={active === 'transactions'} />
    <button type="button" onClick={openEntry} aria-label="Новая операция">
      <span className="fab">+</span>
    </button>
    <TabButton tab="analytics" active={active === 'analytics'} />
    <TabButton tab="more" active={active === 'more'} />
  </nav>
);
