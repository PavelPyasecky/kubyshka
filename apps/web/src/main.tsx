import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './app/App.tsx';
import { loadClock } from './sync/clock.ts';
import { refreshSession } from './state/session.ts';
import { evaluateLock } from './state/lock.ts';

const start = async (): Promise<void> => {
  await loadClock();
  await evaluateLock();
  await refreshSession();
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void start();
