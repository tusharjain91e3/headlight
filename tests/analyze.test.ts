import { vi, beforeEach } from 'vitest';

vi.mock('@/lib/serpapi', () => ({ fetchNews: vi.fn() }));
vi.mock('@/lib/openrouter', () => ({ classify: vi.fn() }));

import { analyzeStock } from '@/lib/analyze';
import { fetchNews } from '@/lib/serpapi';
import { classify } from '@/lib/openrouter';
import { cache } from '@/lib/cache';
import { NewsUnavailable, UnknownSymbol, ConfigError } from '@/lib/errors';

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const news = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    title: `TCS headline ${i}`, snippet: 'Tata Consultancy Services update', source: 'ET', link: `https://x/${i}`, iso_date: iso(i + 1),
  }));
const llmOut = (labels: string[], overall = 'positive', confidence = 0.8) => ({
  symbol: 'TCS',
  overall: { label: overall, confidence, rationale: 'Because.' },
  items: labels.map((label, index) => ({ index, label, reason: 'r' })),
});

beforeEach(() => {
  vi.resetAllMocks();
  cache.clear();
  process.env.OPENROUTER_API_KEY = 'k';
  process.env.OPENROUTER_MODEL = 'm';
  process.env.SERPAPI_API_KEY = 's';
  delete process.env.DEMO_MODE;
});

test('no recent news → cannot_determine without calling the LLM', async () => {
  vi.mocked(fetchNews).mockResolvedValue([]);
  const r = await analyzeStock('TCS');
  expect(r.label).toBe('cannot_determine');
  expect(r.rationale).toBe('No recent news.');
  expect(classify).not.toHaveBeenCalled();
});

test('merges per-article labels and aggregates to positive', async () => {
  vi.mocked(fetchNews).mockResolvedValue(news(3));
  vi.mocked(classify).mockResolvedValue(llmOut(['positive', 'positive', 'neutral']) as never);
  const r = await analyzeStock('tcs');
  expect(r.symbol).toBe('TCS');
  expect(r.label).toBe('positive');
  expect(r.articles.map((a) => a.label)).toEqual(['positive', 'positive', 'neutral']);
  expect(r.article_count).toBe(3);
  expect(r.cached).toBe(false);
});

test('second call within TTL is served from cache', async () => {
  vi.mocked(fetchNews).mockResolvedValue(news(2));
  vi.mocked(classify).mockResolvedValue(llmOut(['positive', 'positive']) as never);
  await analyzeStock('TCS');
  const r = await analyzeStock('TCS');
  expect(r.cached).toBe(true);
  expect(fetchNews).toHaveBeenCalledTimes(1);
});

test('refresh within 5 minutes of the last refresh still serves cache', async () => {
  vi.mocked(fetchNews).mockResolvedValue(news(2));
  vi.mocked(classify).mockResolvedValue(llmOut(['positive', 'positive']) as never);
  await analyzeStock('TCS');
  await analyzeStock('TCS', { refresh: true }); // first refresh allowed
  await analyzeStock('TCS', { refresh: true }); // second blocked
  expect(fetchNews).toHaveBeenCalledTimes(2);
});

test('classify failure → cannot_determine', async () => {
  vi.mocked(fetchNews).mockResolvedValue(news(2));
  vi.mocked(classify).mockResolvedValue(null);
  expect((await analyzeStock('TCS')).label).toBe('cannot_determine');
});

test('low confidence downgrades to cannot_determine', async () => {
  vi.mocked(fetchNews).mockResolvedValue(news(2));
  vi.mocked(classify).mockResolvedValue(llmOut(['positive', 'positive'], 'positive', 0.2) as never);
  expect((await analyzeStock('TCS')).label).toBe('cannot_determine');
});

test('news outage → cannot_determine "News unavailable."', async () => {
  vi.mocked(fetchNews).mockRejectedValue(new NewsUnavailable('down'));
  const r = await analyzeStock('TCS');
  expect(r.label).toBe('cannot_determine');
  expect(r.rationale).toBe('News unavailable.');
});

test('news outage serves a stale cached result when one exists', async () => {
  vi.mocked(fetchNews).mockResolvedValueOnce(news(2));
  vi.mocked(classify).mockResolvedValue(llmOut(['positive', 'positive']) as never);
  const first = await analyzeStock('TCS');
  cache.set('TCS', first, -1); // expire it
  vi.mocked(fetchNews).mockRejectedValue(new NewsUnavailable('down'));
  const r = await analyzeStock('TCS');
  expect(r.label).toBe('positive');
  expect(r.stale).toBe(true);
});

test('unknown symbol throws UnknownSymbol', async () => {
  await expect(analyzeStock('NOPE123')).rejects.toBeInstanceOf(UnknownSymbol);
});

test('missing OpenRouter config throws a clear ConfigError', async () => {
  delete process.env.OPENROUTER_API_KEY;
  await expect(analyzeStock('TCS')).rejects.toThrow('OpenRouter is not configured');
  await expect(analyzeStock('TCS')).rejects.toBeInstanceOf(ConfigError);
});

test('DEMO_MODE returns canned data without external calls or keys', async () => {
  process.env.DEMO_MODE = '1';
  delete process.env.OPENROUTER_API_KEY;
  const r = await analyzeStock('TCS');
  expect(r.symbol).toBe('TCS');
  expect(['positive', 'neutral', 'negative', 'cannot_determine']).toContain(r.label);
  expect(fetchNews).not.toHaveBeenCalled();
});
