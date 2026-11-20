import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './app/App.tsx';
import { captureInviteLink } from './crypto/link.ts';
import { loadClock } from './sync/clock.ts';
import { refreshSession } from './state/session.ts';
import { evaluateLock } from './state/lock.ts';
import { evaluateOnboarding } from './state/onboarding.ts';
import { evaluateRecovery } from './state/recovery.ts';

captureInviteLink();

const start = async (): Promise<void> => {
  await loadClock();
  await evaluateLock();
  await evaluateRecovery();
  await evaluateOnboarding();
  await refreshSession();
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void start();
