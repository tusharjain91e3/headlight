'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CompareView } from '@/components/CompareView';
import { Header, type Tab } from '@/components/Header';
import { ListBar } from '@/components/ListBar';
import { PulseView } from '@/components/PulseView';
import { SearchView } from '@/components/SearchView';
import { StockDetailPanel } from '@/components/StockDetail';
import { Toast, type ToastData } from '@/components/Toast';
import { WatchlistView } from '@/components/WatchlistView';
import { useSentiment } from '@/hooks/useSentiment';
import { useWatchlists } from '@/hooks/useWatchlists';

const up = (s: string) => s.toUpperCase();

export default function Page() {
  const wl = useWatchlists();
  const symbols = useMemo(() => wl.items.map((i) => i.symbol), [wl.items]);
  const sent = useSentiment(wl.allSymbols, { onUnknown: wl.drop });
  const [tab, setTab] = useState<Tab>('watchlist');
  const [selected, setSelected] = useState<string | null>(null);
  const [compareSeed, setCompareSeed] = useState<string | undefined>();
  const [toast, setToast] = useState<ToastData | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  // Resolve display names for the visible list (the client never holds the full stock list).
  const missing = symbols.filter((s) => !names[up(s)]).join(',');
  useEffect(() => {
    if (!missing) return;
    fetch(`/api/stocks?symbols=${encodeURIComponent(missing)}`)
      .then((r) => r.json())
      .then((d: { results: { symbol: string; name: string }[] }) =>
        setNames((n) => ({ ...n, ...Object.fromEntries(d.results.map((x) => [up(x.symbol), x.name])) })))
      .catch(() => {});
  }, [missing]);

  const notify = useCallback((message: string, undo?: () => void) => setToast({ id: Date.now(), message, undo }), []);
  const clearToast = useCallback(() => setToast(null), []);
  const listName = wl.active.name;

  const toggle = useCallback((symbol: string) => {
    if (wl.has(symbol)) {
      wl.remove(symbol);
      notify(`Removed ${symbol} from ${listName}`, wl.undoRemove);
    } else if (wl.add(symbol)) {
      notify(`Added ${symbol} to ${listName}`);
    } else {
      notify(`${listName} is full`);
    }
  }, [wl, notify, listName]);

  const onCreate = () => { wl.createList(); notify('Created a new list'); };
  const onRename = (id: string, name: string) => {
    const r = wl.renameList(id, name);
    if (r.ok) notify(`Renamed to “${name.trim()}”`);
    return r;
  };
  const onDelete = (id: string) => {
    const name = wl.lists.find((l) => l.id === id)?.name ?? 'list';
    if (wl.deleteList(id)) notify(`Deleted “${name}”`, wl.undoDelete);
  };

  const refreshActive = () => symbols.forEach((s) => sent.refresh(s));
  const refreshing = symbols.some((s) => sent.status[up(s)] === 'loading' || sent.status[up(s)] === 'stale');
  const selectedResult = selected ? sent.results[up(selected)] : undefined;

  return (
    <>
      <Header tab={tab} onTab={setTab} count={wl.items.length} lastUpdated={sent.lastUpdated}
        onRefresh={refreshActive} refreshing={refreshing} />
      <main className="mx-auto max-w-3xl px-4 pb-24">
        {tab === 'watchlist' && (
          <>
            {wl.ready && (
              <ListBar lists={wl.lists} activeId={wl.activeId} onSelect={wl.setActive} onCreate={onCreate}
                onRename={onRename} onDelete={onDelete} />
            )}
            <WatchlistView symbols={symbols} ready={wl.ready} storageOk={wl.storageOk} results={sent.results}
              status={sent.status} errors={sent.errors} changes={sent.changes} names={names} onOpen={setSelected}
              onRetry={(s) => sent.refresh(s)} onGoSearch={() => setTab('search')} />
          </>
        )}
        {tab === 'pulse' && <PulseView has={wl.has} full={wl.full} listName={listName} onToggle={toggle} />}
        {tab === 'search' && (
          <SearchView has={wl.has} full={wl.full} listName={listName} onToggle={toggle} onResult={sent.put} results={sent.results} />
        )}
        {tab === 'compare' && <CompareView seed={compareSeed} onResult={sent.put} results={sent.results} />}
      </main>
      {selected && selectedResult && (
        <StockDetailPanel result={selectedResult} listName={listName} inList={wl.has(selected)} full={wl.full}
          onToggle={() => toggle(selected)} onRefresh={() => sent.refresh(selected)}
          onCompare={() => { setCompareSeed(selected); setSelected(null); setTab('compare'); }}
          onClose={() => setSelected(null)} />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
}
