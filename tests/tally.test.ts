import { tally, articleCounts, compareSummary } from '@/lib/tally';
import type { Label, SentimentResult } from '@/lib/types';

const R = (symbol: string, label: Label, articleLabels: Label[] = []): SentimentResult => ({
  symbol, name: symbol, label, confidence: 0.8, rationale: 'r', article_count: articleLabels.length,
  generated_at: '2026-10-02T00:00:00Z', cached: false,
  articles: articleLabels.map((l, i) => ({ title: `t${i}`, snippet: '', source: 's', url: `u${i}`, published_at: '2026-10-02T00:00:00Z', label: l, reason: '' })),
});

describe('tally', () => {
  test('counts per label, analyzed and total', () => {
    const t = tally(['A', 'B', 'C'], { A: R('A', 'positive'), B: R('B', 'negative') });
    expect(t.counts).toEqual({ positive: 1, neutral: 0, negative: 1, cannot_determine: 0 });
    expect(t.analyzed).toBe(2);
    expect(t.total).toBe(3);
  });
  test('no result + error status → failed', () => expect(tally(['A'], {}, { A: 'error' }).failed).toEqual(['A']));
  test('no result + loading → pending', () => expect(tally(['A'], {}, { A: 'loading' }).pending).toEqual(['A']));
  test('no result and no status → pending', () => expect(tally(['A'], {}).pending).toEqual(['A']));
  test('result with error status still counts as analyzed, not failed', () => {
    const t = tally(['A'], { A: R('A', 'neutral') }, { A: 'error' });
    expect(t.analyzed).toBe(1);
    expect(t.failed).toEqual([]);
  });
  test('empty input → zeros', () => {
    const t = tally([], {});
    expect(t).toMatchObject({ analyzed: 0, total: 0, failed: [], pending: [] });
  });
  test('result keys are matched case-insensitively (results keyed UPPERCASE)', () =>
    expect(tally(['tcs'], { TCS: R('TCS', 'positive') }).analyzed).toBe(1));
});

describe('articleCounts', () => {
  test('counts article labels', () =>
    expect(articleCounts(R('A', 'positive', ['positive', 'positive', 'neutral', 'cannot_determine']))).toEqual({ positive: 2, neutral: 1, negative: 0, cannot_determine: 1 }));
});

describe('compareSummary', () => {
  test('identical label and counts → similar coverage', () => {
    const a = R('TCS', 'positive', ['positive', 'neutral']);
    const b = R('INFY', 'positive', ['positive', 'neutral']);
    expect(compareSummary(a, b)).toBe('Both read Positive with similar coverage.');
  });
  test('names the side with the higher positive share', () => {
    const a = R('TCS', 'positive', ['positive', 'positive', 'positive', 'neutral']);
    const b = R('INFY', 'neutral', ['positive', 'neutral', 'neutral', 'neutral']);
    expect(compareSummary(a, b)).toBe('TCS reads more positive than INFY (3 of 4 vs 1 of 4 positive articles).');
  });
  test('no determinable articles on either side → not enough news', () => {
    const a = R('A', 'cannot_determine', []);
    const b = R('B', 'cannot_determine', ['cannot_determine']);
    expect(compareSummary(a, b)).toBe('Not enough news to compare.');
  });
});
