import type { SentimentResult } from './types';

interface Entry { value: SentimentResult; expires: number }

const store = new Map<string, Entry>();
const lastRefresh = new Map<string, number>();

export const cache = {
  get(k: string): SentimentResult | undefined {
    const e = store.get(k);
    return e && e.expires > Date.now() ? e.value : undefined;
  },
  getStale(k: string): SentimentResult | undefined {
    return store.get(k)?.value;
  },
  set(k: string, value: SentimentResult, ttlMs: number) {
    store.set(k, { value, expires: Date.now() + ttlMs });
  },
  lastRefresh,
  clear() {
    store.clear();
    lastRefresh.clear();
  },
};
