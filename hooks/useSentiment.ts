'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeChange, nextPrev, type Prev } from '@/lib/changes';
import { logApiError } from '@/lib/client-log';
import { LABEL_ORDER } from '@/lib/sentiment-ui';
import type { SentimentResult } from '@/lib/types';

export type Status = 'loading' | 'ok' | 'error' | 'stale';

const KEY = 'stockfeed:sentiment:v1';
const TTL_MS = 60 * 60_000;
const CONCURRENCY = 3;
const up = (s: string) => s.trim().toUpperCase();

function isResult(v: unknown): v is SentimentResult {
  const r = v as SentimentResult;
  return !!r && typeof r === 'object' && typeof r.symbol === 'string' && typeof r.name === 'string'
    && LABEL_ORDER.includes(r.label) && typeof r.confidence === 'number' && typeof r.rationale === 'string'
    && Array.isArray(r.articles) && typeof r.generated_at === 'string';
}

type Cache = Record<string, { result: SentimentResult; at: number; prev?: Prev }>;

function readCache(): Cache {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
    const clean: Cache = {};
    for (const [k, v] of Object.entries(p as Cache)) {
      if (v && typeof v.at === 'number' && isResult(v.result)) {
        const pv = v.prev;
        const validPrev = pv && LABEL_ORDER.includes(pv.label) && typeof pv.changedAt === 'number';
        clean[k] = validPrev ? v : { result: v.result, at: v.at };
      }
    }
    return clean;
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
  const [prevs, setPrevs] = useState<Record<string, Prev>>({});

  const cacheRef = useRef<Cache>({});
  const hydrated = useRef(false);
  const queue = useRef<{ sym: string; force: boolean }[]>([]);
  const pending = useRef(new Set<string>());
  const active = useRef(0);
  const onUnknown = useRef(opts.onUnknown);
  onUnknown.current = opts.onUnknown;

  const store = useCallback((result: SentimentResult) => {
    const k = up(result.symbol);
    if (!result.transient) {
      const now = Date.now();
      const prev = nextPrev(cacheRef.current[k], result.label, now);
      cacheRef.current = { ...cacheRef.current, [k]: { result, at: now, ...(prev ? { prev } : {}) } };
      writeCache(cacheRef.current);
      setPrevs((m) => {
        if (!prev) return m;
        return { ...m, [k]: prev };
      });
    }
    setResults((r) => ({ ...r, [k]: result }));
    setStatus((s) => ({ ...s, [k]: 'ok' }));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[k];
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
      if (!res.ok) logApiError(`/api/sentiment/${sym}`, res.status, data);
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      if (!isResult(data)) throw new Error('Unexpected response from the server');
      store(data);
    } catch (e) {
      console.error(`[Headlight] /api/sentiment/${sym} failed:`, (e as Error).message);
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
      const fromPrevs: Record<string, Prev> = {};
      for (const [k, v] of Object.entries(cacheRef.current)) {
        if (v?.result) fromCache[k] = v.result;
        if (v?.prev) fromPrevs[k] = v.prev;
      }
      setResults(fromCache);
      setPrevs(fromPrevs);
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

  const changes = useMemo(() => {
    const out: Record<string, Prev> = {};
    const now = Date.now();
    for (const [k, prev] of Object.entries(prevs)) {
      const cur = results[k];
      const c = cur && activeChange(prev, cur.label, now);
      if (c) out[k] = c;
    }
    return out;
  }, [prevs, results]);

  return { results, status, errors, changes, refresh, refreshAll, lastUpdated, put: store };
}
