'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SentimentResult } from '@/lib/types';

export type Status = 'loading' | 'ok' | 'error' | 'stale';

const KEY = 'stockfeed:sentiment:v1';
const TTL_MS = 60 * 60_000;
const CONCURRENCY = 3;
const up = (s: string) => s.trim().toUpperCase();

type Cache = Record<string, { result: SentimentResult; at: number }>;

function readCache(): Cache {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}
function writeCache(c: Cache) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable — results simply aren't persisted */
  }
}

export function useSentiment(symbols: string[], opts: { onUnknown?: (symbol: string) => void } = {}) {
  const [results, setResults] = useState<Record<string, SentimentResult>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const cacheRef = useRef<Cache>({});
  const hydrated = useRef(false);
  const queue = useRef<{ sym: string; force: boolean }[]>([]);
  const pending = useRef(new Set<string>());
  const active = useRef(0);
  const onUnknown = useRef(opts.onUnknown);
  onUnknown.current = opts.onUnknown;

  const store = useCallback((result: SentimentResult) => {
    const k = up(result.symbol);
    cacheRef.current = { ...cacheRef.current, [k]: { result, at: Date.now() } };
    writeCache(cacheRef.current);
    setResults((r) => ({ ...r, [k]: result }));
    setStatus((s) => ({ ...s, [k]: 'ok' }));
    setErrors((e) => {
      const { [k]: _drop, ...rest } = e;
      return rest;
    });
  }, []);

  const load = useCallback(async (sym: string, force: boolean) => {
    const k = up(sym);
    setStatus((s) => ({ ...s, [k]: cacheRef.current[k] ? 'stale' : 'loading' }));
    try {
      const res = await fetch(`/api/sentiment/${encodeURIComponent(sym)}${force ? '?refresh=1' : ''}`);
      if (res.status === 404) {
        onUnknown.current?.(sym);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      store(data as SentimentResult);
    } catch (e) {
      setErrors((x) => ({ ...x, [k]: (e as Error).message || 'Request failed' }));
      setStatus((s) => ({ ...s, [k]: 'error' }));
    }
  }, [store]);

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY && queue.current.length) {
      const job = queue.current.shift()!;
      active.current++;
      load(job.sym, job.force).finally(() => {
        active.current--;
        pending.current.delete(up(job.sym));
        pump();
      });
    }
  }, [load]);

  const enqueue = useCallback((sym: string, force: boolean) => {
    const k = up(sym);
    if (pending.current.has(k)) return;
    pending.current.add(k);
    queue.current.push({ sym, force });
    pump();
  }, [pump]);

  const key = symbols.map(up).join(',');
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      cacheRef.current = readCache();
      const fromCache: Record<string, SentimentResult> = {};
      for (const [k, v] of Object.entries(cacheRef.current)) if (v?.result) fromCache[k] = v.result;
      setResults(fromCache);
    }
    for (const sym of symbols) {
      const k = up(sym);
      const entry = cacheRef.current[k];
      if (entry && Date.now() - entry.at < TTL_MS) {
        setStatus((s) => ({ ...s, [k]: 'ok' }));
      } else {
        enqueue(sym, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enqueue]);

  const refresh = useCallback((symbol?: string) => {
    if (symbol) enqueue(symbol, true);
    else symbols.forEach((s) => enqueue(s, true));
  }, [enqueue, symbols]);

  const refreshAll = useCallback(() => refresh(), [refresh]);

  const lastUpdated = useMemo(() => {
    const times = symbols.map((s) => results[up(s)]?.generated_at).filter(Boolean).map((t) => new Date(t as string).getTime());
    return times.length ? new Date(Math.max(...times)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, key]);

  return { results, status, errors, refresh, refreshAll, lastUpdated, put: store };
}
