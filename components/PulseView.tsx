'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSentiment } from '@/hooks/useSentiment';
import { NIFTY_50 } from '@/lib/indices';
import { LABEL_META } from '@/lib/sentiment-ui';
import { tally } from '@/lib/tally';
import { DISCLAIMER, StockDetailPanel } from './StockDetail';
import { SpectrumBar } from './SpectrumBar';

interface Props {
  has: (symbol: string) => boolean;
  full: boolean;
  listName: string;
  onToggle: (symbol: string) => void;
}

export function PulseView({ has, full, listName, onToggle }: Props) {
  const symbols = useMemo(() => [...NIFTY_50], []);
  const s = useSentiment(symbols, { concurrency: 2, auto: false });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    s.scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = tally(symbols, s.results, s.status);
  const selectedResult = selected ? s.results[selected.toUpperCase()] : undefined;
  const scanning = t.pending.length > 0 && t.failed.length === 0 ? true : t.pending.length > 0;

  return (
    <div className="mt-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Market Pulse <span className="font-normal text-[var(--muted)]">Nifty 50</span></h1>
        <p className="tnum text-sm text-[var(--muted)]" aria-live="polite">
          {t.analyzed} / {t.total} analyzed{scanning ? ' · Scanning…' : ''}
        </p>
      </div>
      <SpectrumBar label="Nifty 50 sentiment" counts={t.counts} />

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={s.scan} className="rounded-full border border-[var(--border)] px-3 py-1 font-medium hover:border-[var(--text)]">Scan again</button>
        {t.failed.length > 0 && (
          <button type="button" onClick={() => t.failed.forEach((sym) => s.refresh(sym))} className="rounded-full border border-[var(--border)] px-3 py-1 font-medium hover:border-[var(--text)]">
            Retry {t.failed.length} failed
          </button>
        )}
        {t.failed.length > 10 && <span className="text-[var(--muted)]">The free model is rate limited. Retry in a minute.</span>}
      </div>

      <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
        {symbols.map((sym) => {
          const k = sym.toUpperCase();
          const r = s.results[k];
          if (r) {
            const v = LABEL_META[r.label].varName;
            return (
              <li key={sym}>
                <button type="button" onClick={() => setSelected(sym)} aria-label={`${sym}, ${LABEL_META[r.label].text}`}
                  className="flex h-14 w-full items-center justify-center rounded-lg border-2 px-1 text-xs font-semibold tracking-tight transition-transform hover:-translate-y-0.5"
                  style={{ background: `var(${v}-bg)`, borderColor: `var(${v})`, color: `var(${v})` }}>
                  <span className="truncate">{sym}</span>
                </button>
              </li>
            );
          }
          if (s.status[k] === 'error') {
            return (
              <li key={sym}>
                <button type="button" onClick={() => s.refresh(sym)} aria-label={`${sym}, failed — retry`} title={s.errors[k]}
                  className="flex h-14 w-full flex-col items-center justify-center rounded-lg border border-dashed border-[var(--unk)] px-1 text-xs text-[var(--muted)]">
                  <span className="truncate font-semibold">{sym}</span><span aria-hidden>↻</span>
                </button>
              </li>
            );
          }
          return (
            <li key={sym}>
              <div aria-label={`${sym}, not analyzed yet`} className="skeleton flex h-14 w-full items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-transparent px-1 text-xs text-[var(--muted)]">
                <span className="truncate">{sym}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-xs text-[var(--muted)]">{DISCLAIMER}</p>

      {selected && selectedResult && (
        <StockDetailPanel result={selectedResult} listName={listName} inList={has(selected)} full={full}
          onToggle={() => onToggle(selected)} onRefresh={() => s.refresh(selected)} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
