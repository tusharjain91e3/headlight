'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addSymbol, createList as createListFn, defaultState, deleteList as deleteListFn, dropSymbolEverywhere,
  migrateV1, parseState, removeSymbol, renameList as renameListFn, restoreList,
  type ListsState, type WatchItem, type WatchList,
} from '@/lib/lists';

const V2 = 'stockfeed:watchlists:v2';
const V1 = 'stockfeed:watchlist:v1';
export const MAX_WATCHLIST = Number(process.env.NEXT_PUBLIC_MAX_WATCHLIST_SIZE) || 25;
const up = (s: string) => s.trim().toUpperCase();

function load(): { state: ListsState; ok: boolean } {
  let ok = true;
  try {
    const raw = localStorage.getItem(V2);
    if (raw) {
      try {
        const parsed = parseState(JSON.parse(raw));
        if (parsed) return { state: parsed, ok };
      } catch {
        ok = false;
      }
    }
  } catch {
    return { state: defaultState(), ok: false };
  }
  try {
    const rawV1 = localStorage.getItem(V1);
    if (rawV1) {
      const migrated = migrateV1(JSON.parse(rawV1));
      if (migrated) return { state: migrated, ok };
    }
  } catch {
    /* unreadable v1 is ignored */
  }
  return { state: defaultState(), ok };
}

export function useWatchlists() {
  const [state, setState] = useState<ListsState>(() => defaultState());
  const [ready, setReady] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const ref = useRef<ListsState>(state);
  const lastRemoved = useRef<{ listId: string; item: WatchItem; index: number } | null>(null);
  const lastDeleted = useRef<{ list: WatchList; index: number } | null>(null);

  const write = useCallback((next: ListsState) => {
    try {
      localStorage.setItem(V2, JSON.stringify(next));
    } catch {
      setStorageOk(false);
    }
  }, []);

  const commit = useCallback((next: ListsState) => {
    if (next === ref.current) return;
    ref.current = next;
    setState(next);
    write(next);
  }, [write]);

  useEffect(() => {
    const r = load();
    ref.current = r.state;
    setState(r.state);
    setStorageOk(r.ok);
    setReady(true);
    write(r.state);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== V2) return;
      const n = load();
      ref.current = n.state;
      setState(n.state);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [write]);

  const active = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const items = active.items;
  const allSymbols = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of state.lists) for (const i of l.items) if (!seen.has(up(i.symbol))) seen.set(up(i.symbol), i.symbol);
    return [...seen.values()];
  }, [state.lists]);

  const has = useCallback((s: string) => items.some((i) => up(i.symbol) === up(s)), [items]);

  const add = useCallback((s: string) => {
    const r = addSymbol(ref.current, ref.current.activeId, s, MAX_WATCHLIST);
    if (!r.ok) return false;
    commit(r.state);
    return true;
  }, [commit]);

  const remove = useCallback((s: string) => {
    const r = removeSymbol(ref.current, ref.current.activeId, s);
    if (!r.removed) return;
    lastRemoved.current = { listId: ref.current.activeId, ...r.removed };
    commit(r.state);
  }, [commit]);

  const undoRemove = useCallback(() => {
    const u = lastRemoved.current;
    if (!u) return;
    const cur = ref.current;
    const list = cur.lists.find((l) => l.id === u.listId);
    if (!list || list.items.some((i) => up(i.symbol) === up(u.item.symbol))) return;
    lastRemoved.current = null;
    commit({
      ...cur,
      lists: cur.lists.map((l) => {
        if (l.id !== u.listId) return l;
        const next = [...l.items];
        next.splice(Math.min(u.index, next.length), 0, u.item);
        return { ...l, items: next };
      }),
    });
  }, [commit]);

  const drop = useCallback((s: string) => commit(dropSymbolEverywhere(ref.current, s)), [commit]);

  const setActive = useCallback((id: string) => {
    if (!ref.current.lists.some((l) => l.id === id) || ref.current.activeId === id) return;
    commit({ ...ref.current, activeId: id });
  }, [commit]);

  const createList = useCallback(() => commit(createListFn(ref.current)), [commit]);

  const renameList = useCallback((id: string, name: string): { ok: true } | { ok: false; error: string } => {
    const r = renameListFn(ref.current, id, name);
    if (!r.ok) return r;
    commit(r.state);
    return { ok: true };
  }, [commit]);

  const deleteList = useCallback((id: string) => {
    const r = deleteListFn(ref.current, id);
    if (!r) return false;
    lastDeleted.current = r.removed;
    commit(r.state);
    return true;
  }, [commit]);

  const undoDelete = useCallback(() => {
    const d = lastDeleted.current;
    if (!d) return;
    lastDeleted.current = null;
    commit(restoreList(ref.current, d));
  }, [commit]);

  return {
    ready, storageOk, lists: state.lists, activeId: state.activeId, active, items, allSymbols,
    full: items.length >= MAX_WATCHLIST, has, add, remove, undoRemove, drop, setActive,
    createList, renameList, deleteList, undoDelete,
  };
}
