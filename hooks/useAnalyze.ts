'use client';
import { useCallback, useRef, useState } from 'react';
import { logApiError } from '@/lib/client-log';
import type { SentimentResult } from '@/lib/types';

export interface Option { symbol: string; name: string }

export function useAnalyze(onResult: (r: SentimentResult) => void) {
  const [picked, setPicked] = useState<Option | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [err, setErr] = useState('');
  const reqId = useRef(0);

  const run = useCallback(async (s: Option, force = false) => {
    const id = ++reqId.current;
    setPicked(s);
    setState('loading');
    setErr('');
    try {
      const res = await fetch(`/api/sentiment/${encodeURIComponent(s.symbol)}${force ? '?refresh=1' : ''}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) logApiError(`/api/sentiment/${s.symbol}`, res.status, data);
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      if (id !== reqId.current) return; // a newer pick superseded this one
      onResult(data as SentimentResult);
      setState('ok');
    } catch (e) {
      if (id !== reqId.current) return;
      setErr((e as Error).message);
      setState('error');
    }
  }, [onResult]);

  const clear = useCallback(() => {
    reqId.current++;
    setPicked(null);
    setState('idle');
    setErr('');
  }, []);

  return { picked, state, err, run, clear };
}
