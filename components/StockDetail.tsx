'use client';
import { useEffect, useRef } from 'react';
import { LABEL_META } from '@/lib/sentiment-ui';
import { timeAgo } from '@/lib/time';
import type { SentimentResult } from '@/lib/types';
import { SentimentPill } from './SentimentPill';
import { WatchlistButton } from './WatchlistButton';

export const DISCLAIMER =
  'Sentiment is generated automatically from news headlines and snippets. It is not investment advice.';

interface BodyProps {
  result: SentimentResult;
  inList: boolean;
  full: boolean;
  onToggle: () => void;
  onRefresh?: () => void;
  onCompare?: () => void;
  listName?: string;
}

export function StockDetailBody({ result, inList, full, onToggle, onRefresh, onCompare, listName }: BodyProps) {
  const v = LABEL_META[result.label].varName;
  const pct = Math.round(result.confidence * 100);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">{result.symbol}</h2>
          <p className="truncate text-sm text-[var(--muted)]">{result.name}</p>
        </div>
        <WatchlistButton inList={inList} full={full} onToggle={onToggle} listName={listName} />
      </div>

      <div className="mt-6 flex items-center gap-4">
        <SentimentPill label={result.label} size="lg" />
        {result.label !== 'cannot_determine' || result.confidence > 0 ? (
          <div className="flex min-w-0 flex-1 items-center gap-3" title={`${pct}% confidence`}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `var(${v})` }} />
            </div>
            <span className="tnum text-sm text-[var(--muted)]">{pct}% confidence</span>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-[15px] leading-relaxed">{result.rationale}</p>

      <h3 className="mt-8 text-sm font-semibold">
        Articles <span className="tnum font-normal text-[var(--muted)]">{result.article_count} from the last 7 days</span>
      </h3>
      {result.articles.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">No recent articles were found for this stock.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {result.articles.map((a, i) => (
            <li key={i} className="flex gap-3 py-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: `var(${LABEL_META[a.label].varName})` }} title={LABEL_META[a.label].text} />
              <div className="min-w-0">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium leading-snug hover:underline">{a.title}</a>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {a.source} · {timeAgo(a.published_at)} · {LABEL_META[a.label].text}
                </p>
                {a.reason && <p className="mt-1 text-sm text-[var(--muted)]">{a.reason}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <span>Analyzed {timeAgo(result.generated_at)}{result.cached ? ' (cached)' : ''}{result.stale ? ' · showing older data' : ''}</span>
        <span className="flex gap-2">
          {onCompare && <button type="button" onClick={onCompare} className="rounded-full border border-[var(--border)] px-3 py-1 font-medium text-[var(--text)] hover:border-[var(--text)]">Compare with…</button>}
          {onRefresh && <button type="button" onClick={onRefresh} className="rounded-full border border-[var(--border)] px-3 py-1 font-medium text-[var(--text)] hover:border-[var(--text)]">Refresh</button>}
        </span>
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">{DISCLAIMER}</p>
    </div>
  );
}

export function StockDetailPanel({ onClose, ...body }: BodyProps & { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label={`${body.result.symbol} details`} className="slide-in relative h-full w-full max-w-lg overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] p-6">
        <button ref={closeRef} type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]" aria-label="Close details">✕</button>
        <div className="pt-6"><StockDetailBody {...body} /></div>
      </aside>
    </div>
  );
}
