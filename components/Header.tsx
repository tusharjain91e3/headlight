'use client';
import { timeAgo } from '@/lib/time';

export type Tab = 'watchlist' | 'pulse' | 'search' | 'compare';
const TABS: Tab[] = ['watchlist', 'pulse', 'search', 'compare'];

export function Header({
  tab, onTab, count, lastUpdated, onRefresh, refreshing,
}: { tab: Tab; onTab: (t: Tab) => void; count: number; lastUpdated: Date | null; onRefresh: () => void; refreshing: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:gap-4">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            <circle cx="9" cy="12" r="5.5" fill="currentColor" />
            <path d="M16 8l6-3M16 12h6M16 16l6 3" stroke="var(--neu)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Headlight</span>
        </div>
        <nav className="ml-1 flex gap-0.5 sm:ml-4 sm:gap-1" aria-label="Views">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize sm:px-3.5 transition-colors ${tab === t ? 'bg-[var(--text)] text-[var(--bg)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
            >
              {t}
              {t === 'watchlist' && count > 0 && <span className="tnum ml-1.5 opacity-70">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-[var(--muted)]">
          {lastUpdated && <span className="hidden sm:inline">Updated {timeAgo(lastUpdated)}</span>}
          {tab === 'watchlist' && count > 0 && (
            <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh all" className="rounded-full border border-[var(--border)] px-3 py-1 font-medium text-[var(--text)] hover:border-[var(--text)] disabled:opacity-50">
              <span className="sm:hidden" aria-hidden>↻</span>
              <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
