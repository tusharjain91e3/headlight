'use client';
import { LABEL_META, LABEL_ORDER } from '@/lib/sentiment-ui';
import type { Label, SentimentResult } from '@/lib/types';
import type { Status } from '@/hooks/useSentiment';
import { DISCLAIMER } from './StockDetail';
import { SentimentSection } from './SentimentSection';
import { StockCard } from './StockCard';

interface Props {
  symbols: string[];
  ready: boolean;
  storageOk: boolean;
  results: Record<string, SentimentResult>;
  status: Record<string, Status>;
  errors: Record<string, string>;
  names: Record<string, string>;
  onOpen: (symbol: string) => void;
  onRetry: (symbol: string) => void;
  onGoSearch: () => void;
}

const up = (s: string) => s.toUpperCase();

export function WatchlistView({ symbols, ready, storageOk, results, status, errors, names, onOpen, onRetry, onGoSearch }: Props) {
  if (!ready) {
    return (
      <div className="mt-8 space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-full" />)}
      </div>
    );
  }

  const notice = !storageOk && (
    <p className="mb-4 rounded-lg bg-[var(--neu-bg)] px-4 py-2.5 text-sm text-[var(--neu)]">
      Watchlist can’t be saved in this browser. It will be lost when you close the tab.
    </p>
  );

  if (symbols.length === 0) {
    return (
      <div className="mt-8">
        {notice}
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-14 text-center">
          <p className="text-lg font-semibold tracking-tight">Search for a stock to add it here.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted)]">
            Your watchlist is stored in this browser only, so clearing site data or switching devices starts a fresh one.
          </p>
          <button type="button" onClick={onGoSearch} className="mt-5 rounded-full bg-[var(--text)] px-5 py-2 text-sm font-medium text-[var(--bg)]">
            Find a stock
          </button>
        </div>
      </div>
    );
  }

  const buckets: Record<Label, string[]> = { positive: [], neutral: [], negative: [], cannot_determine: [] };
  const pending: string[] = [];
  const failed: string[] = [];
  for (const s of symbols) {
    const r = results[up(s)];
    if (r) buckets[r.label].push(s);
    else if (status[up(s)] === 'error') failed.push(s);
    else pending.push(s);
  }
  const total = LABEL_ORDER.reduce((n, l) => n + buckets[l].length, 0);
  const card = (s: string) => (
    <StockCard key={s} symbol={s} name={names[up(s)] ?? results[up(s)]?.name ?? ''} result={results[up(s)]} status={status[up(s)]} error={errors[up(s)]}
      onOpen={() => onOpen(s)} onRetry={() => onRetry(s)} />
  );

  return (
    <div className="mt-6">
      {notice}
      <div aria-label="Sentiment across your watchlist">
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--border)]" role="img"
          aria-label={LABEL_ORDER.map((l) => `${buckets[l].length} ${LABEL_META[l].text}`).join(', ')}>
          {total > 0 && LABEL_ORDER.map((l) => buckets[l].length > 0 && (
            <div key={l} style={{ flexGrow: buckets[l].length, background: `var(${LABEL_META[l].varName})` }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {LABEL_ORDER.map((l) => (
            <li key={l} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: `var(${LABEL_META[l].varName})` }} aria-hidden />
              <span className="tnum font-semibold">{buckets[l].length}</span>
              <span className="text-[var(--muted)]">{LABEL_META[l].text}</span>
            </li>
          ))}
        </ul>
      </div>

      {pending.length > 0 && (
        <section className="mt-8" aria-label="Analyzing">
          <h2 className="mb-1 px-4 text-sm font-semibold">Analyzing <span className="tnum font-normal text-[var(--muted)]">{pending.length}</span></h2>
          <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">{pending.map(card)}</div>
        </section>
      )}
      {LABEL_ORDER.map((l) => buckets[l].length > 0 && (
        <SentimentSection key={l} label={l} count={buckets[l].length}>{buckets[l].map(card)}</SentimentSection>
      ))}
      {failed.length > 0 && (
        <section className="mt-8" aria-label="Could not load">
          <h2 className="mb-1 px-4 text-sm font-semibold">Could not load <span className="tnum font-normal text-[var(--muted)]">{failed.length}</span></h2>
          <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">{failed.map(card)}</div>
        </section>
      )}
      <p className="mt-10 text-xs text-[var(--muted)]">{DISCLAIMER}</p>
    </div>
  );
}
