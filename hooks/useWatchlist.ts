'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface WatchItem { symbol: string; addedAt: string }

const KEY = 'stockfeed:watchlist:v1';
export const MAX_WATCHLIST = Number(process.env.NEXT_PUBLIC_MAX_WATCHLIST_SIZE) || 25;
const up = (s: string) => s.trim().toUpperCase();

function read(): { items: WatchItem[]; ok: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { items: [], ok: true };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { items: [], ok: true };
    const items = parsed
      .filter((e) => e && typeof e.symbol === 'string' && typeof e.addedAt === 'string')
      .slice(0, MAX_WATCHLIST);
    return { items, ok: true };
  } catch {
    return { items: [], ok: false };
  }
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [ready, setReady] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const ref = useRef<WatchItem[]>([]);
  const lastRemoved = useRef<{ item: WatchItem; index: number } | null>(null);

  const commit = useCallback((next: WatchItem[]) => {
    ref.current = next;
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      setStorageOk(false);
    }
  }, []);

  useEffect(() => {
    const r = read();
    ref.current = r.items;
    setItems(r.items);
    setStorageOk(r.ok);
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== KEY) return;
      const n = read();
      ref.current = n.items;
      setItems(n.items);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const has = useCallback((s: string) => items.some((i) => up(i.symbol) === up(s)), [items]);

  const add = useCallback((s: string) => {
    if (ref.current.some((i) => up(i.symbol) === up(s))) return true;
    if (ref.current.length >= MAX_WATCHLIST) return false;
    commit([...ref.current, { symbol: s.trim(), addedAt: new Date().toISOString() }]);
    return true;
  }, [commit]);

  const remove = useCallback((s: string) => {
    const index = ref.current.findIndex((i) => up(i.symbol) === up(s));
    if (index < 0) return;
    lastRemoved.current = { item: ref.current[index], index };
    commit(ref.current.filter((_, i) => i !== index));
  }, [commit]);

  // Silent removal (no undo) — used to prune symbols that are no longer in the universe.
  const drop = useCallback((s: string) => {
    commit(ref.current.filter((i) => up(i.symbol) !== up(s)));
  }, [commit]);

  const undoRemove = useCallback(() => {
    const r = lastRemoved.current;
    if (!r || ref.current.some((i) => up(i.symbol) === up(r.item.symbol))) return;
    const next = [...ref.current];
    next.splice(Math.min(r.index, next.length), 0, r.item);
    lastRemoved.current = null;
    commit(next);
  }, [commit]);

  return { items, ready, storageOk, full: items.length >= MAX_WATCHLIST, has, add, remove, drop, undoRemove };
}
