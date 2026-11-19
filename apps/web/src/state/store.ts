import { useSyncExternalStore } from 'react';

export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  use: () => T;
};

export const createStore = <T>(initial: T): Store<T> => {
  let value = initial;
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };

  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      for (const listener of listeners) listener();
    },
    use: () => useSyncExternalStore(subscribe, () => value),
  };
};
