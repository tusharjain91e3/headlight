'use client';
import { LABEL_META } from '@/lib/sentiment-ui';
import type { SentimentResult } from '@/lib/types';
import type { Status } from '@/hooks/useSentiment';
import type { Prev } from '@/lib/changes';
import { ChangeBadge } from './ChangeBadge';
import { SentimentPill } from './SentimentPill';

interface Props {
  symbol: string;
  name: string;
  result?: SentimentResult;
  status?: Status;
  error?: string;
  change?: Prev;
  onOpen: () => void;
  onRetry: () => void;
}

export function StockCard({ symbol, name, result, status, error, change, onOpen, onRetry }: Props) {
  if (!result && status === 'error') {
    return (
      <div className="flex items-center gap-3 border-l-2 border-[var(--unk)] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{symbol} <span className="font-normal text-[var(--muted)]">{name}</span></div>
          <p className="text-sm text-[var(--muted)]">{error || 'Could not load this stock.'}</p>
        </div>
        <button type="button" onClick={onRetry} className="rounded-full border border-[var(--border)] px-3 py-1 text-sm font-medium hover:border-[var(--text)]">
          Retry
        </button>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex items-center gap-3 border-l-2 border-[var(--border)] px-4 py-3.5" aria-busy="true">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="font-semibold">{symbol} <span className="font-normal text-[var(--muted)]">{name}</span></div>
          <div className="skeleton h-3 w-2/3" />
        </div>
        <span className="text-xs text-[var(--muted)]">Analyzing…</span>
      </div>
    );
  }
  const v = LABEL_META[result.label].varName;
  return (
    <div className="border-l-2 transition-colors hover:bg-[var(--surface)]" style={{ borderColor: `var(${v})` }}>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">{symbol}</span>
            <span className="truncate text-sm text-[var(--muted)]">{name}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-[var(--muted)]">{result.rationale}</p>
          {status === 'stale' && <span className="mt-1 inline-block text-xs text-[var(--muted)]">Refreshing…</span>}
        </div>
        <SentimentPill label={result.label} />
      </button>
      {change && <div className="px-4 pb-3 -mt-1"><ChangeBadge from={change.label} to={result.label} at={change.changedAt} /></div>}
      {status === 'error' && (
        <p className="px-4 pb-3 text-xs text-[var(--muted)]">
          Update failed.{' '}
          <button type="button" onClick={onRetry} className="underline">Retry</button>
        </p>
      )}
    </div>
  );
}
