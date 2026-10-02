import type { Label } from './types';

const RECENT_MS = 48 * 3_600_000;
const THRESHOLD = 0.6;
const MIN_CONFIDENCE = 0.4;
const EPS = 1e-9;

export function aggregate(
  items: { label: Label; published_at: string }[],
  llm: { label: Label; confidence: number },
  now: Date = new Date(),
): { label: Label; confidence: number } {
  let total = 0;
  let pos = 0;
  let neg = 0;
  for (const it of items) {
    if (it.label === 'cannot_determine') continue;
    const age = now.getTime() - new Date(it.published_at).getTime();
    const w = age <= RECENT_MS ? 1.5 : 1;
    total += w;
    if (it.label === 'positive') pos += w;
    if (it.label === 'negative') neg += w;
  }
  const confidence = llm.confidence;
  if (total === 0 || confidence < MIN_CONFIDENCE) return { label: 'cannot_determine', confidence };
  if (pos / total >= THRESHOLD - EPS) return { label: 'positive', confidence };
  if (neg / total >= THRESHOLD - EPS) return { label: 'negative', confidence };
  return { label: 'neutral', confidence };
}
