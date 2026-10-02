export interface WatchItem { symbol: string; addedAt: string }
export interface WatchList { id: string; name: string; createdAt: string; items: WatchItem[] }
export interface ListsState { activeId: string; lists: WatchList[] }

export const MAX_LISTS = 8;
export const NAME_MAX = 24;
export const MAX_PER_LIST = 25;
export const DEFAULT_NAME = 'My watchlist';

const up = (s: string) => s.trim().toUpperCase();

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `l${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function fresh(name: string, now: Date, items: WatchItem[] = []): WatchList {
  return { id: newId(), name, createdAt: now.toISOString(), items };
}

export function defaultState(now: Date = new Date()): ListsState {
  const l = fresh(DEFAULT_NAME, now);
  return { activeId: l.id, lists: [l] };
}

function cleanItems(raw: unknown, max = MAX_PER_LIST): WatchItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WatchItem[] = [];
  for (const e of raw) {
    if (!e || typeof e.symbol !== 'string' || !e.symbol.trim()) continue;
    const k = up(e.symbol);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ symbol: e.symbol.trim(), addedAt: typeof e.addedAt === 'string' ? e.addedAt : new Date().toISOString() });
    if (out.length >= max) break;
  }
  return out;
}

export function parseState(raw: unknown): ListsState | null {
  const r = raw as ListsState;
  if (!r || typeof r !== 'object' || !Array.isArray(r.lists)) return null;
  const lists: WatchList[] = [];
  for (const l of r.lists) {
    if (!l || typeof l.id !== 'string' || typeof l.name !== 'string' || !l.name.trim()) continue;
    if (lists.some((x) => x.id === l.id)) continue;
    lists.push({
      id: l.id,
      name: l.name.trim().slice(0, NAME_MAX),
      createdAt: typeof l.createdAt === 'string' ? l.createdAt : new Date().toISOString(),
      items: cleanItems(l.items),
    });
    if (lists.length >= MAX_LISTS) break;
  }
  if (lists.length === 0) return null;
  const activeId = lists.some((l) => l.id === r.activeId) ? r.activeId : lists[0].id;
  return { activeId, lists };
}

export function migrateV1(rawV1: unknown, now: Date = new Date()): ListsState | null {
  if (!Array.isArray(rawV1)) return null;
  const l = fresh(DEFAULT_NAME, now, cleanItems(rawV1));
  return { activeId: l.id, lists: [l] };
}

export function validateName(s: ListsState, name: string, exceptId?: string): { ok: true; name: string } | { ok: false; error: string } {
  const n = name.trim();
  if (!n) return { ok: false, error: 'Name is required' };
  if (n.length > NAME_MAX) return { ok: false, error: `Use ${NAME_MAX} characters or fewer` };
  if (s.lists.some((l) => l.id !== exceptId && l.name.toLowerCase() === n.toLowerCase()))
    return { ok: false, error: 'You already have a list with that name' };
  return { ok: true, name: n };
}

export function createList(s: ListsState, now: Date = new Date()): ListsState {
  if (s.lists.length >= MAX_LISTS) return s;
  let n = 2;
  while (s.lists.some((l) => l.name.toLowerCase() === `watchlist ${n}`)) n++;
  const l = fresh(`Watchlist ${n}`, now);
  return { activeId: l.id, lists: [...s.lists, l] };
}

export function renameList(s: ListsState, id: string, name: string): { ok: true; state: ListsState } | { ok: false; error: string } {
  const v = validateName(s, name, id);
  if (!v.ok) return v;
  return { ok: true, state: { ...s, lists: s.lists.map((l) => (l.id === id ? { ...l, name: v.name } : l)) } };
}

export function deleteList(s: ListsState, id: string): { state: ListsState; removed: { list: WatchList; index: number } } | null {
  const index = s.lists.findIndex((l) => l.id === id);
  if (index < 0 || s.lists.length <= 1) return null;
  const lists = s.lists.filter((l) => l.id !== id);
  const activeId = s.activeId === id ? lists[Math.min(index, lists.length - 1)].id : s.activeId;
  return { state: { activeId, lists }, removed: { list: s.lists[index], index } };
}

export function restoreList(s: ListsState, r: { list: WatchList; index: number }): ListsState {
  if (s.lists.some((l) => l.id === r.list.id)) return s;
  const lists = [...s.lists];
  lists.splice(Math.min(r.index, lists.length), 0, r.list);
  return { activeId: r.list.id, lists };
}

function mapList(s: ListsState, id: string, fn: (l: WatchList) => WatchList): ListsState {
  return { ...s, lists: s.lists.map((l) => (l.id === id ? fn(l) : l)) };
}

export function addSymbol(s: ListsState, id: string, symbol: string, max: number = MAX_PER_LIST): { ok: boolean; state: ListsState } {
  const list = s.lists.find((l) => l.id === id);
  if (!list) return { ok: false, state: s };
  if (list.items.some((i) => up(i.symbol) === up(symbol))) return { ok: true, state: s };
  if (list.items.length >= max) return { ok: false, state: s };
  const item = { symbol: symbol.trim(), addedAt: new Date().toISOString() };
  return { ok: true, state: mapList(s, id, (l) => ({ ...l, items: [...l.items, item] })) };
}

export function removeSymbol(s: ListsState, id: string, symbol: string): { state: ListsState; removed?: { item: WatchItem; index: number } } {
  const list = s.lists.find((l) => l.id === id);
  const index = list ? list.items.findIndex((i) => up(i.symbol) === up(symbol)) : -1;
  if (!list || index < 0) return { state: s };
  return { state: mapList(s, id, (l) => ({ ...l, items: l.items.filter((_, i) => i !== index) })), removed: { item: list.items[index], index } };
}

export function dropSymbolEverywhere(s: ListsState, symbol: string): ListsState {
  return { ...s, lists: s.lists.map((l) => ({ ...l, items: l.items.filter((i) => up(i.symbol) !== up(symbol)) })) };
}
