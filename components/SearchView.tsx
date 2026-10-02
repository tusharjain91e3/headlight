'use client';
import { useEffect, useRef, useState } from 'react';
import { logApiError } from '@/lib/client-log';
import type { SentimentResult } from '@/lib/types';
import { StockDetailBody } from './StockDetail';
import { WatchlistButton } from './WatchlistButton';

interface Option { symbol: string; name: string }

interface Props {
  has: (symbol: string) => boolean;
  full: boolean;
  onToggle: (symbol: string) => void;
  onResult: (r: SentimentResult) => void;
  results: Record<string, SentimentResult>;
}

export function SearchView({ has, full, onToggle, onResult, results }: Props) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [searched, setSearched] = useState('');
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<Option | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setOptions([]); setSearched(''); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const data = await res.json();
        setOptions(data.results ?? []);
        setSearched(q);
        setActive(-1);
      } catch { /* aborted or offline — keep previous options */ }
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [query]);

  async function run(s: Option, force = false) {
    setPicked(s);
    setOptions([]);
    setQuery('');
    setSearched('');
    setState('loading');
    setErr('');
    try {
      const res = await fetch(`/api/sentiment/${encodeURIComponent(s.symbol)}${force ? '?refresh=1' : ''}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) logApiError(`/api/sentiment/${s.symbol}`, res.status, data);
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      onResult(data as SentimentResult);
      setState('ok');
    } catch (e) {
      setErr((e as Error).message);
      setState('error');
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && options.length) { e.preventDefault(); run(options[active >= 0 ? active : 0]); }
    else if (e.key === 'Escape') { setOptions([]); }
  };

  const result = picked ? results[picked.symbol.toUpperCase()] : undefined;
  const noMatch = query.trim() !== '' && searched === query.trim() && options.length === 0;

  return (
    <div className="mt-6">
      <div className="relative">
        <label htmlFor="stock-search" className="sr-only">Search NSE stocks by name or symbol</label>
        <input
          id="stock-search" ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
          placeholder="Search by company name or symbol, e.g. Infosys or TCS" autoComplete="off" role="combobox"
          aria-expanded={options.length > 0} aria-controls="search-options"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-base outline-none placeholder:text-[var(--muted)] focus:border-[var(--text)]"
        />
        {options.length > 0 && (
          <ul id="search-options" role="listbox" className="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {options.map((o, i) => (
              <li key={o.symbol} role="option" aria-selected={i === active}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${i === active ? 'bg-[var(--bg)]' : ''} ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                onMouseEnter={() => setActive(i)} onClick={() => run(o)}>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold tracking-tight">{o.symbol}</span>
                  <span className="ml-2 truncate text-sm text-[var(--muted)]">{o.name}</span>
                </div>
                <WatchlistButton compact inList={has(o.symbol)} full={full} onToggle={() => onToggle(o.symbol)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {noMatch && <p className="mt-6 text-sm text-[var(--muted)]">Stock not available in this app.</p>}

      {!picked && !noMatch && (
        <p className="mt-6 text-sm text-[var(--muted)]">
          Pick a stock to see how its news from the last 7 days reads: positive, neutral, negative, or not enough to tell.
        </p>
      )}

      {picked && state === 'loading' && (
        <div className="mt-8" aria-busy="true">
          <div className="text-2xl font-semibold tracking-tight">{picked.symbol}</div>
          <p className="text-sm text-[var(--muted)]">{picked.name}</p>
          <div className="mt-6 space-y-3"><div className="skeleton h-8 w-40" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-5/6" /></div>
          <p className="mt-4 text-sm text-[var(--muted)]">Analyzing the latest headlines…</p>
        </div>
      )}

      {picked && state === 'error' && (
        <div className="mt-8 rounded-xl border border-[var(--border)] p-5">
          <p className="font-semibold">Could not analyze {picked.symbol}.</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{err}</p>
          <button type="button" onClick={() => run(picked)} className="mt-4 rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-medium hover:border-[var(--text)]">Try again</button>
        </div>
      )}

      {picked && state === 'ok' && result && (
        <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
          <StockDetailBody result={result} inList={has(result.symbol)} full={full}
            onToggle={() => onToggle(result.symbol)} onRefresh={() => run(picked, true)} />
        </div>
      )}
    </div>
  );
}
