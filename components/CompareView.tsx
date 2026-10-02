'use client';
import { useEffect, useState } from 'react';
import { useAnalyze, type Option } from '@/hooks/useAnalyze';
import { articleCounts, compareSummary } from '@/lib/tally';
import { LABEL_META } from '@/lib/sentiment-ui';
import { timeAgo } from '@/lib/time';
import type { SentimentResult } from '@/lib/types';
import { SentimentPill } from './SentimentPill';
import { DISCLAIMER } from './StockDetail';
import { StockPicker } from './StockPicker';

function MiniBar({ r }: { r: SentimentResult }) {
  const c = articleCounts(r);
  const total = c.positive + c.neutral + c.negative + c.cannot_determine;
  if (total === 0) return <p className="text-sm text-[var(--muted)]">No recent articles.</p>;
  return (
    <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--border)]" role="img"
      aria-label={(['positive', 'neutral', 'negative', 'cannot_determine'] as const).map((l) => `${c[l]} ${LABEL_META[l].text}`).join(', ')}>
      {(['positive', 'neutral', 'negative', 'cannot_determine'] as const).map((l) => c[l] > 0 && (
        <div key={l} style={{ flexGrow: c[l], background: `var(${LABEL_META[l].varName})` }} />
      ))}
    </div>
  );
}

function Column({ r, onChange }: { r: SentimentResult; onChange: () => void }) {
  const v = LABEL_META[r.label].varName;
  const pct = Math.round(r.confidence * 100);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{r.symbol}</h2>
          <p className="truncate text-sm text-[var(--muted)]">{r.name}</p>
        </div>
        <button type="button" onClick={onChange} className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-sm font-medium hover:border-[var(--text)]">Change</button>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <SentimentPill label={r.label} size="lg" />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `var(${v})` }} />
        </div>
        <span className="tnum text-sm text-[var(--muted)]">{pct}%</span>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed">{r.rationale}</p>
      <div className="mt-4"><MiniBar r={r} /></div>
      <ul className="mt-3 divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {r.articles.map((a, i) => (
          <li key={i} className="flex gap-2.5 py-2.5">
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: `var(${LABEL_META[a.label].varName})` }} title={LABEL_META[a.label].text} />
            <div className="min-w-0">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium leading-snug hover:underline">{a.title}</a>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{a.source} · {timeAgo(a.published_at)}</p>
            </div>
          </li>
        ))}
        {r.articles.length === 0 && <li className="py-2.5 text-sm text-[var(--muted)]">No recent articles were found.</li>}
      </ul>
    </div>
  );
}

function Slot({ id, seed, onResult, results, onSlot }: { id: string; seed?: string; onResult: (r: SentimentResult) => void; results: Record<string, SentimentResult>; onSlot: (r: SentimentResult | null) => void }) {
  const a = useAnalyze(onResult);
  const { run } = a;

  useEffect(() => {
    if (!seed) return;
    let live = true;
    fetch(`/api/stocks?symbols=${encodeURIComponent(seed)}`)
      .then((r) => r.json())
      .then((d: { results: Option[] }) => { if (live && d.results[0]) run(d.results[0]); })
      .catch(() => {});
    return () => { live = false; };
  }, [seed, run]);

  const result = a.picked && a.state === 'ok' ? results[a.picked.symbol.toUpperCase()] : undefined;
  useEffect(() => {
    onSlot(result ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  return (
    <div className="min-w-0">
      {!a.picked && <StockPicker inputId={id} onPick={(o) => a.run(o)} placeholder="Pick a stock" />}
      {a.picked && a.state === 'loading' && (
        <div className="rounded-xl border border-[var(--border)] p-5" aria-busy="true">
          <div className="text-xl font-semibold tracking-tight">{a.picked.symbol}</div>
          <p className="text-sm text-[var(--muted)]">{a.picked.name}</p>
          <div className="mt-4 space-y-3"><div className="skeleton h-8 w-36" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-4/5" /></div>
          <p className="mt-3 text-sm text-[var(--muted)]">Analyzing the latest headlines…</p>
        </div>
      )}
      {a.picked && a.state === 'error' && (
        <div className="rounded-xl border border-[var(--border)] p-5">
          <p className="font-semibold">Could not analyze {a.picked.symbol}.</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{a.err}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => a.run(a.picked!)} className="rounded-full border border-[var(--border)] px-3 py-1 text-sm font-medium hover:border-[var(--text)]">Try again</button>
            <button type="button" onClick={a.clear} className="rounded-full border border-[var(--border)] px-3 py-1 text-sm font-medium hover:border-[var(--text)]">Pick another</button>
          </div>
        </div>
      )}
      {a.picked && a.state === 'ok' && result && <Column r={result} onChange={a.clear} />}
    </div>
  );
}

export function CompareView({ seed, onResult, results }: { seed?: string; onResult: (r: SentimentResult) => void; results: Record<string, SentimentResult> }) {
  return (
    <div className="mt-6">
      <h1 className="text-lg font-semibold tracking-tight">Compare two stocks</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Pick two stocks to compare their news sentiment side by side.</p>
      <CompareBody seed={seed} onResult={onResult} results={results} />
      <p className="mt-8 text-xs text-[var(--muted)]">{DISCLAIMER}</p>
    </div>
  );
}

function CompareBody({ seed, onResult, results }: { seed?: string; onResult: (r: SentimentResult) => void; results: Record<string, SentimentResult> }) {
  const [a, setA] = useState<SentimentResult | null>(null);
  const [b, setB] = useState<SentimentResult | null>(null);
  return (
    <>
      {a && b && <p className="mt-5 rounded-xl bg-[var(--surface)] px-4 py-3 text-sm font-medium" aria-live="polite">{compareSummary(a, b)}</p>}
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <Slot id="compare-a" seed={seed} onResult={onResult} results={results} onSlot={setA} />
        <Slot id="compare-b" onResult={onResult} results={results} onSlot={setB} />
      </div>
    </>
  );
}
