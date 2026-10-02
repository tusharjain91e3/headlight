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

test('malformed cache entries are ignored and refetched instead of crashing consumers', async () => {
  localStorage.setItem(KEY, JSON.stringify({ TCS: { result: { symbol: 'TCS' }, at: Date.now() } }));
  const f = vi.fn((url: string) => json(mk(symOf(url), 'neutral')));
  vi.stubGlobal('fetch', f);
  const { result } = renderHook(() => useSentiment(['TCS']));
  await waitFor(() => expect(result.current.results.TCS?.label).toBe('neutral'));
  expect(f).toHaveBeenCalledTimes(1);
});

test('transient results are shown but not persisted', async () => {
  vi.stubGlobal('fetch', vi.fn(() => json({ ...mk('TCS', 'cannot_determine'), transient: true })));
  const { result } = renderHook(() => useSentiment(['TCS']));
  await waitFor(() => expect(result.current.status.TCS).toBe('ok'));
  expect(result.current.results.TCS.label).toBe('cannot_determine');
  expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').TCS).toBeUndefined();
});

test('a malformed API payload is an error, not a stored result', async () => {
  vi.stubGlobal('fetch', vi.fn(() => json({ hello: 'world' })));
  const { result } = renderHook(() => useSentiment(['TCS']));
  await waitFor(() => expect(result.current.status.TCS).toBe('error'));
  expect(result.current.results.TCS).toBeUndefined();
});

describe('change tracking', () => {
  const seq = (...labels: SentimentResult['label'][]) => {
    const f = vi.fn();
    labels.forEach((l) => f.mockReturnValueOnce(json(mk('TCS', l))));
    f.mockReturnValue(json(mk('TCS', labels[labels.length - 1])));
    vi.stubGlobal('fetch', f);
  };

  test('first-ever result has no change entry', async () => {
    seq('positive');
    const { result } = renderHook(() => useSentiment(['TCS']));
    await waitFor(() => expect(result.current.status.TCS).toBe('ok'));
    expect(result.current.changes.TCS).toBeUndefined();
  });

  test('a later different label records the old label', async () => {
    seq('positive', 'negative');
    const { result } = renderHook(() => useSentiment(['TCS']));
    await waitFor(() => expect(result.current.status.TCS).toBe('ok'));
    act(() => result.current.refresh('TCS'));
    await waitFor(() => expect(result.current.results.TCS.label).toBe('negative'));
    expect(result.current.changes.TCS.label).toBe('positive');
  });

  test('same label again creates no change', async () => {
    seq('positive', 'positive');
    const { result } = renderHook(() => useSentiment(['TCS']));
    await waitFor(() => expect(result.current.status.TCS).toBe('ok'));
    act(() => result.current.refresh('TCS'));
    await waitFor(() => expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(2));
    await waitFor(() => expect(result.current.status.TCS).toBe('ok'));
    expect(result.current.changes.TCS).toBeUndefined();
  });

  test('transient results never create or update prev', async () => {
    localStorage.setItem(KEY, JSON.stringify({ TCS: { result: mk('TCS', 'positive'), at: Date.now() - 2 * 3_600_000 } }));
    vi.stubGlobal('fetch', vi.fn(() => json({ ...mk('TCS', 'cannot_determine'), transient: true })));
    const { result } = renderHook(() => useSentiment(['TCS']));
    await waitFor(() => expect(result.current.results.TCS.label).toBe('cannot_determine'));
    expect(result.current.changes.TCS).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(KEY)!).TCS.prev).toBeUndefined();
  });

  test('prev persists and is restored on remount', async () => {
    seq('positive', 'negative');
    const first = renderHook(() => useSentiment(['TCS']));
    await waitFor(() => expect(first.result.current.status.TCS).toBe('ok'));
    act(() => first.result.current.refresh('TCS'));
    await waitFor(() => expect(first.result.current.changes.TCS?.label).toBe('positive'));
    first.unmount();
    vi.stubGlobal('fetch', vi.fn());
    const second = renderHook(() => useSentiment(['TCS']));
    await waitFor(() => expect(second.result.current.changes.TCS?.label).toBe('positive'));
  });

  test('prev older than 7 days in storage is ignored', async () => {
    localStorage.setItem(KEY, JSON.stringify({ TCS: { result: mk('TCS', 'negative'), at: Date.now(), prev: { label: 'positive', changedAt: Date.now() - 8 * 86_400_000 } } }));
    vi.stubGlobal('fetch', vi.fn());
    const { result } = renderHook(() => useSentiment(['TCS']));
    await waitFor(() => expect(result.current.results.TCS?.label).toBe('negative'));
    expect(result.current.changes.TCS).toBeUndefined();
  });
});

describe('options', () => {
  test('concurrency: 2 never exceeds 2 in flight', async () => {
    let active = 0, peak = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return new Response(JSON.stringify(mk(symOf(url))), { status: 200 });
    }));
    const syms = ['A', 'B', 'C', 'D', 'E', 'F'];
    const { result } = renderHook(() => useSentiment(syms, { concurrency: 2 }));
    await waitFor(() => expect(Object.keys(result.current.results)).toHaveLength(6));
    expect(peak).toBe(2);
  });

  test('auto:false fetches nothing until scan()', async () => {
    const f = vi.fn((url: string) => json(mk(symOf(url))));
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useSentiment(['A', 'B'], { auto: false }));
    await new Promise((r) => setTimeout(r, 50));
    expect(f).not.toHaveBeenCalled();
    act(() => result.current.scan());
    await waitFor(() => expect(Object.keys(result.current.results).sort()).toEqual(['A', 'B']));
  });

  test('scan skips symbols with a fresh cached result', async () => {
    localStorage.setItem(KEY, JSON.stringify({ A: { result: mk('A'), at: Date.now() } }));
    const f = vi.fn((url: string) => json(mk(symOf(url))));
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useSentiment(['A', 'B'], { auto: false }));
    act(() => result.current.scan());
    await waitFor(() => expect(result.current.status.B).toBe('ok'));
    expect(f).toHaveBeenCalledTimes(1);
    expect(result.current.status.A).toBe('ok');
  });

  test('scanning twice while in flight does not double-fetch', async () => {
    const f = vi.fn(async (url: string) => { await new Promise((r) => setTimeout(r, 30)); return new Response(JSON.stringify(mk(symOf(url))), { status: 200 }); });
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useSentiment(['A', 'B'], { auto: false }));
    act(() => { result.current.scan(); result.current.scan(); });
    await waitFor(() => expect(Object.keys(result.current.results)).toHaveLength(2));
    expect(f).toHaveBeenCalledTimes(2);
  });
});
