const DELAYS_MS = [2_000, 5_000, 15_000, 60_000];

export const syncRetryDelay = (failedAttempt: number): number =>
  DELAYS_MS[Math.min(Math.max(failedAttempt, 0), DELAYS_MS.length - 1)];
