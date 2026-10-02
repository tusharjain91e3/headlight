import { renderHook, act } from '@testing-library/react';
import { useWatchlists } from '@/hooks/useWatchlists';

const V2 = 'stockfeed:watchlists:v2';
const V1 = 'stockfeed:watchlist:v1';
const stored = () => JSON.parse(localStorage.getItem(V2) ?? 'null');
const syms = (r: { current: ReturnType<typeof useWatchlists> }) => r.current.items.map((i) => i.symbol);

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test('starts ready with one empty "My watchlist"', () => {
  const { result } = renderHook(() => useWatchlists());
  expect(result.current.ready).toBe(true);
  expect(result.current.lists).toHaveLength(1);
  expect(result.current.active.name).toBe('My watchlist');
  expect(result.current.items).toEqual([]);
});

test('add persists to the v2 key', () => {
  const { result } = renderHook(() => useWatchlists());
  act(() => { result.current.add('TCS'); });
  expect(stored().lists[0].items[0].symbol).toBe('TCS');
  expect(result.current.has('TCS')).toBe(true);
});

test('add is idempotent and keeps the original timestamp', () => {
  const { result } = renderHook(() => useWatchlists());
  act(() => { result.current.add('TCS'); });
  const first = result.current.items[0].addedAt;
  act(() => { result.current.add('tcs'); });
  expect(result.current.items).toHaveLength(1);
  expect(result.current.items[0].addedAt).toBe(first);
});

test('remove and undoRemove restore the entry at its old position', () => {
  const { result } = renameHook();
  act(() => { result.current.add('A'); result.current.add('B'); result.current.add('C'); });
  act(() => result.current.remove('B'));
  expect(syms(result)).toEqual(['A', 'C']);
  act(() => result.current.undoRemove());
  expect(syms(result)).toEqual(['A', 'B', 'C']);
});
function renameHook() { return renderHook(() => useWatchlists()); }

test('caps at 25 per list: add returns false and full is true', () => {
  const { result } = renameHook();
  for (let i = 0; i < 25; i++) act(() => { result.current.add(`S${i}`); });
  expect(result.current.full).toBe(true);
  let ok = true;
  act(() => { ok = result.current.add('EXTRA'); });
  expect(ok).toBe(false);
  expect(result.current.items).toHaveLength(25);
});

test('corrupt JSON → default list, no throw', () => {
  localStorage.setItem(V2, '{not json');
  const { result } = renameHook();
  expect(result.current.lists).toHaveLength(1);
  expect(result.current.items).toEqual([]);
});

test('non-object JSON → default list', () => {
  localStorage.setItem(V2, JSON.stringify([1, 2]));
  expect(renameHook().result.current.lists).toHaveLength(1);
});

test('storage write failure → storageOk false but in-memory add still works', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const { result } = renameHook();
  act(() => { result.current.add('TCS'); });
  expect(result.current.storageOk).toBe(false);
  expect(result.current.has('TCS')).toBe(true);
});

test('storage event from another tab updates the lists', () => {
  const { result } = renameHook();
  const other = { activeId: 'x', lists: [{ id: 'x', name: 'Other', createdAt: '2026-10-01T00:00:00Z', items: [{ symbol: 'INFY', addedAt: '2026-10-01T00:00:00Z' }] }] };
  localStorage.setItem(V2, JSON.stringify(other));
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: V2 })); });
  expect(result.current.active.name).toBe('Other');
  expect(syms(result)).toEqual(['INFY']);
});

test('migrates v1 into "My watchlist", writes v2, leaves v1 untouched', () => {
  const v1 = JSON.stringify([{ symbol: 'TCS', addedAt: '2026-10-01T00:00:00Z' }]);
  localStorage.setItem(V1, v1);
  const { result } = renameHook();
  expect(result.current.active.name).toBe('My watchlist');
  expect(syms(result)).toEqual(['TCS']);
  expect(stored().lists[0].items[0].symbol).toBe('TCS');
  expect(localStorage.getItem(V1)).toBe(v1);
});

test('v2 wins when both v1 and v2 exist', () => {
  localStorage.setItem(V1, JSON.stringify([{ symbol: 'TCS', addedAt: 'x' }]));
  localStorage.setItem(V2, JSON.stringify({ activeId: 'a', lists: [{ id: 'a', name: 'Mine', createdAt: 'x', items: [{ symbol: 'INFY', addedAt: 'x' }] }] }));
  const { result } = renameHook();
  expect(result.current.active.name).toBe('Mine');
  expect(syms(result)).toEqual(['INFY']);
});

test('createList makes "Watchlist 2" active and add goes to it', () => {
  const { result } = renameHook();
  act(() => result.current.createList());
  expect(result.current.active.name).toBe('Watchlist 2');
  act(() => { result.current.add('TCS'); });
  expect(result.current.lists[1].items).toHaveLength(1);
  expect(result.current.lists[0].items).toHaveLength(0);
});

test('renameList persists valid names and rejects invalid ones', () => {
  const { result } = renameHook();
  act(() => result.current.createList());
  const firstId = result.current.lists[0].id;
  let r1: { ok: boolean } = { ok: false };
  act(() => { r1 = result.current.renameList(result.current.activeId, 'Banks'); });
  expect(r1.ok).toBe(true);
  expect(stored().lists[1].name).toBe('Banks');
  let r2: { ok: boolean; error?: string } = { ok: true };
  act(() => { r2 = result.current.renameList(result.current.activeId, 'my watchlist'); });
  expect(r2.ok).toBe(false);
  let r3: { ok: boolean } = { ok: true };
  act(() => { r3 = result.current.renameList(firstId, '   '); });
  expect(r3.ok).toBe(false);
  expect(result.current.lists[1].name).toBe('Banks');
});

test('deleteList: last list blocked; other list can be deleted and restored via undoDelete', () => {
  const { result } = renameHook();
  let ok = true;
  act(() => { ok = result.current.deleteList(result.current.activeId); });
  expect(ok).toBe(false);
  act(() => result.current.createList());
  const second = result.current.activeId;
  act(() => { ok = result.current.deleteList(second); });
  expect(ok).toBe(true);
  expect(result.current.lists).toHaveLength(1);
  act(() => result.current.undoDelete());
  expect(result.current.lists).toHaveLength(2);
  expect(result.current.activeId).toBe(second);
});

test('drop removes the symbol from every list', () => {
  const { result } = renameHook();
  act(() => { result.current.add('TCS'); result.current.createList(); });
  act(() => { result.current.add('TCS'); });
  act(() => result.current.drop('tcs'));
  expect(result.current.lists.flatMap((l) => l.items)).toHaveLength(0);
});

test('allSymbols is de-duplicated across lists', () => {
  const { result } = renameHook();
  act(() => { result.current.add('TCS'); result.current.createList(); });
  act(() => { result.current.add('TCS'); result.current.add('INFY'); });
  expect([...result.current.allSymbols].sort()).toEqual(['INFY', 'TCS']);
});
