import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useSentiment } from '@/hooks/useSentiment';
import type { SentimentResult } from '@/lib/types';

const KEY = 'stockfeed:sentiment:v1';
const mk = (symbol: string, label: SentimentResult['label'] = 'positive'): SentimentResult => ({
  symbol, name: symbol, label, confidence: 0.8, rationale: 'r', articles: [], article_count: 0,
  generated_at: new Date().toISOString(), cached: false,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const symOf = (url: string) => decodeURIComponent(url.split('/api/sentiment/')[1].split('?')[0]);

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

test('fetches every symbol with at most 3 in flight', async () => {
  let active = 0, peak = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 15));
    active--;
    return new Response(JSON.stringify(mk(symOf(url))), { status: 200 });
  }));
  const syms = ['A', 'B', 'C', 'D', 'E'];
  const { result } = renderHook(() => useSentiment(syms));
  await waitFor(() => expect(Object.keys(result.current.results).sort()).toEqual(syms));
  expect(peak).toBeLessThanOrEqual(3);
  expect(peak).toBeGreaterThan(1);
});

test('fresh cached entries are used without fetching', async () => {
  localStorage.setItem(KEY, JSON.stringify({ TCS: { result: mk('TCS'), at: Date.now() } }));
  const f = vi.fn();
  vi.stubGlobal('fetch', f);
  const { result } = renderHook(() => useSentiment(['TCS']));
  await waitFor(() => expect(result.current.results.TCS?.label).toBe('positive'));
  expect(result.current.status.TCS).toBe('ok');
  expect(f).not.toHaveBeenCalled();
});

test('stale cached entry is shown as stale while refetching, then ok', async () => {
  localStorage.setItem(KEY, JSON.stringify({ TCS: { result: mk('TCS', 'neutral'), at: Date.now() - 2 * 3_600_000 } }));
  vi.stubGlobal('fetch', vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return new Response(JSON.stringify(mk('TCS', 'negative')), { status: 200 }); }));
  const { result } = renderHook(() => useSentiment(['TCS']));
  await waitFor(() => expect(result.current.status.TCS).toBe('stale'));
  expect(result.current.results.TCS.label).toBe('neutral');
  await waitFor(() => expect(result.current.status.TCS).toBe('ok'));
  expect(result.current.results.TCS.label).toBe('negative');
});

test('404 calls onUnknown', async () => {
  vi.stubGlobal('fetch', vi.fn(() => json({ error: 'nope' }, 404)));
  const onUnknown = vi.fn();
  renderHook(() => useSentiment(['GONE'], { onUnknown }));
  await waitFor(() => expect(onUnknown).toHaveBeenCalledWith('GONE'));
});

test('failure sets error and manual refresh recovers', async () => {
  const f = vi.fn().mockReturnValueOnce(json({ error: 'OpenRouter is not configured' }, 500)).mockReturnValue(json(mk('TCS')));
  vi.stubGlobal('fetch', f);
  const { result } = renderHook(() => useSentiment(['TCS']));
  await waitFor(() => expect(result.current.status.TCS).toBe('error'));
  expect(result.current.errors.TCS).toBe('OpenRouter is not configured');
  act(() => result.current.refresh('TCS'));
  await waitFor(() => expect(result.current.status.TCS).toBe('ok'));
});

test('refresh adds ?refresh=1', async () => {
  const f = vi.fn((url: string) => json(mk(symOf(url))));
  vi.stubGlobal('fetch', f);
  const { result } = renderHook(() => useSentiment(['TCS']));
  await waitFor(() => expect(result.current.status.TCS).toBe('ok'));
  act(() => result.current.refresh('TCS'));
  await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
  expect((f.mock.calls[1] as unknown as [string])[0]).toContain('refresh=1');
});

test('put stores a result without fetching and persists it', async () => {
  const f = vi.fn();
  vi.stubGlobal('fetch', f);
  const { result } = renderHook(() => useSentiment([]));
  act(() => result.current.put(mk('INFY', 'negative')));
  expect(result.current.results.INFY.label).toBe('negative');
  expect(JSON.parse(localStorage.getItem(KEY)!).INFY.result.label).toBe('negative');
  expect(f).not.toHaveBeenCalled();
});

test('corrupt cache is ignored', async () => {
  localStorage.setItem(KEY, 'garbage');
  vi.stubGlobal('fetch', vi.fn((url: string) => json(mk(symOf(url)))));
  const { result } = renderHook(() => useSentiment(['TCS']));
  await waitFor(() => expect(result.current.status.TCS).toBe('ok'));
});
