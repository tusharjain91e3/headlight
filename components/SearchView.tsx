'use client';
import { useAnalyze } from '@/hooks/useAnalyze';
import type { SentimentResult } from '@/lib/types';
import { StockDetailBody } from './StockDetail';
import { StockPicker } from './StockPicker';
import { WatchlistButton } from './WatchlistButton';

interface Props {
  has: (symbol: string) => boolean;
  full: boolean;
  listName: string;
  onToggle: (symbol: string) => void;
  onResult: (r: SentimentResult) => void;
  results: Record<string, SentimentResult>;
}

export function SearchView({ has, full, listName, onToggle, onResult, results }: Props) {
  const { picked, state, err, run } = useAnalyze(onResult);
  const result = picked ? results[picked.symbol.toUpperCase()] : undefined;

  return (
    <div className="mt-6">
      <StockPicker inputId="stock-search" autoFocus placeholder="Search by company name or symbol, e.g. Infosys or TCS"
        onPick={(o) => run(o)}
        renderAction={(o) => <WatchlistButton compact listName={listName} inList={has(o.symbol)} full={full} onToggle={() => onToggle(o.symbol)} />} />

      {!picked && (
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
          <StockDetailBody result={result} listName={listName} inList={has(result.symbol)} full={full}
            onToggle={() => onToggle(result.symbol)} onRefresh={() => run(picked, true)} />
        </div>
      )}
    </div>
  );
}
