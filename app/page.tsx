'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header, type Tab } from '@/components/Header';
import { SearchView } from '@/components/SearchView';
import { StockDetailPanel } from '@/components/StockDetail';
import { Toast, type ToastData } from '@/components/Toast';
import { WatchlistView } from '@/components/WatchlistView';
import { useSentiment } from '@/hooks/useSentiment';
import { useWatchlist } from '@/hooks/useWatchlist';

const up = (s: string) => s.toUpperCase();

export default function Page() {
  const wl = useWatchlist();
  const symbols = useMemo(() => wl.items.map((i) => i.symbol), [wl.items]);
  const sent = useSentiment(symbols, { onUnknown: wl.drop });
  const [tab, setTab] = useState<Tab>('watchlist');
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  // Resolve display names for watchlist symbols (the client never holds the full stock list).
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

  const toggle = useCallback((symbol: string) => {
    if (wl.has(symbol)) {
      wl.remove(symbol);
      notify(`Removed ${symbol} from watchlist`, wl.undoRemove);
    } else if (wl.add(symbol)) {
      notify(`Added ${symbol} to watchlist`);
    } else {
      notify('Watchlist full');
    }
  }, [wl, notify]);

  const refreshing = symbols.some((s) => sent.status[up(s)] === 'loading' || sent.status[up(s)] === 'stale');
  const selectedResult = selected ? sent.results[up(selected)] : undefined;

  return (
    <>
      <Header tab={tab} onTab={setTab} count={wl.items.length} lastUpdated={sent.lastUpdated}
        onRefresh={sent.refreshAll} refreshing={refreshing} />
      <main className="mx-auto max-w-3xl px-4 pb-24">
        {tab === 'watchlist' ? (
          <WatchlistView symbols={symbols} ready={wl.ready} storageOk={wl.storageOk} results={sent.results}
            status={sent.status} errors={sent.errors} names={names} onOpen={setSelected}
            onRetry={(s) => sent.refresh(s)} onGoSearch={() => setTab('search')} />
        ) : (
          <SearchView has={wl.has} full={wl.full} onToggle={toggle} onResult={sent.put} results={sent.results} />
        )}
      </main>
      {selected && selectedResult && (
        <StockDetailPanel result={selectedResult} inList={wl.has(selected)} full={wl.full}
          onToggle={() => toggle(selected)} onRefresh={() => sent.refresh(selected)} onClose={() => setSelected(null)} />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
}
