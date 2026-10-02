import { LABEL_META } from './sentiment-ui';
import type { Label, SentimentResult } from './types';

type Status = 'loading' | 'ok' | 'error' | 'stale';

const zero = (): Record<Label, number> => ({ positive: 0, neutral: 0, negative: 0, cannot_determine: 0 });
const up = (s: string) => s.toUpperCase();

export function tally(
  symbols: string[],
  results: Record<string, SentimentResult>,
  status: Record<string, Status> = {},
) {
  const counts = zero();
  const failed: string[] = [];
  const pending: string[] = [];
  let analyzed = 0;
  for (const s of symbols) {
    const r = results[up(s)];
    if (r) {
      counts[r.label]++;
      analyzed++;
    } else if (status[up(s)] === 'error') failed.push(s);
    else pending.push(s);
  }
  return { counts, analyzed, total: symbols.length, failed, pending };
}

export function articleCounts(r: SentimentResult): Record<Label, number> {
  const c = zero();
  for (const a of r.articles) c[a.label]++;
  return c;
}

export function compareSummary(a: SentimentResult, b: SentimentResult): string {
  const ca = articleCounts(a);
  const cb = articleCounts(b);
  const da = ca.positive + ca.neutral + ca.negative;
  const db = cb.positive + cb.neutral + cb.negative;
  if (da === 0 && db === 0) return 'Not enough news to compare.';
  const sa = da ? ca.positive / da : 0;
  const sb = db ? cb.positive / db : 0;
  if (a.label === b.label && Math.abs(sa - sb) < 0.15) return `Both read ${LABEL_META[a.label].text} with similar coverage.`;
  if (sa === sb) return `${a.symbol} reads ${LABEL_META[a.label].text}; ${b.symbol} reads ${LABEL_META[b.label].text}.`;
  const [hi, lo, ch, cl, dh, dl] = sa > sb ? [a, b, ca, cb, da, db] : [b, a, cb, ca, db, da];
  return `${hi.symbol} reads more positive than ${lo.symbol} (${ch.positive} of ${dh} vs ${cl.positive} of ${dl} positive articles).`;
}
