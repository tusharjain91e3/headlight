import { renderHook, act } from '@testing-library/react';
import { useWatchlist } from '@/hooks/useWatchlist';

const KEY = 'stockfeed:watchlist:v1';
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test('starts ready with an empty list', () => {
  const { result } = renderHook(() => useWatchlist());
  expect(result.current.ready).toBe(true);
  expect(result.current.items).toEqual([]);
});

test('loads existing items from storage after mount', () => {
  localStorage.setItem(KEY, JSON.stringify([{ symbol: 'TCS', addedAt: '2026-10-01T00:00:00Z' }]));
  const { result } = renderHook(() => useWatchlist());
  expect(result.current.items.map((i) => i.symbol)).toEqual(['TCS']);
});

test('add persists to localStorage', () => {
  const { result } = renderHook(() => useWatchlist());
  act(() => { result.current.add('TCS'); });
  expect(stored()[0].symbol).toBe('TCS');
  expect(result.current.has('TCS')).toBe(true);
});

test('add is idempotent and keeps the original timestamp', () => {
  const { result } = renderHook(() => useWatchlist());
  act(() => { result.current.add('TCS'); });
  const first = result.current.items[0].addedAt;
  act(() => { result.current.add('tcs'); });
  expect(result.current.items).toHaveLength(1);
  expect(result.current.items[0].addedAt).toBe(first);
});

test('remove and undoRemove restore the entry at its old position', () => {
  const { result } = renderHook(() => useWatchlist());
  act(() => { result.current.add('A'); result.current.add('B'); result.current.add('C'); });
  act(() => result.current.remove('B'));
  expect(result.current.items.map((i) => i.symbol)).toEqual(['A', 'C']);
  act(() => result.current.undoRemove());
  expect(result.current.items.map((i) => i.symbol)).toEqual(['A', 'B', 'C']);
});

test('caps at 25: add returns false and full is true', () => {
  const { result } = renderHook(() => useWatchlist());
  for (let i = 0; i < 25; i++) act(() => { result.current.add(`S${i}`); });
  expect(result.current.full).toBe(true);
  let ok = true;
  act(() => { ok = result.current.add('EXTRA'); });
  expect(ok).toBe(false);
  expect(result.current.items).toHaveLength(25);
});

test('corrupt JSON in storage → empty list, no throw', () => {
  localStorage.setItem(KEY, '{not json');
  const { result } = renderHook(() => useWatchlist());
  expect(result.current.items).toEqual([]);
});

test('non-array JSON in storage → empty list', () => {
  localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
  const { result } = renderHook(() => useWatchlist());
  expect(result.current.items).toEqual([]);
});

test('storage write failure → storageOk false but in-memory add still works', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const { result } = renderHook(() => useWatchlist());
  act(() => { result.current.add('TCS'); });
  expect(result.current.storageOk).toBe(false);
  expect(result.current.has('TCS')).toBe(true);
});

test('storage event from another tab updates the list', () => {
  const { result } = renderHook(() => useWatchlist());
  localStorage.setItem(KEY, JSON.stringify([{ symbol: 'INFY', addedAt: '2026-10-01T00:00:00Z' }]));
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY })); });
  expect(result.current.items.map((i) => i.symbol)).toEqual(['INFY']);
});
