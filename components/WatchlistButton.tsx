'use client';

export function WatchlistButton({
  inList, full, onToggle, compact = false,
}: { inList: boolean; full: boolean; onToggle: () => void; compact?: boolean }) {
  const disabled = !inList && full;
  const base = `shrink-0 rounded-full border text-sm font-medium transition-colors ${compact ? 'px-3 py-1' : 'px-4 py-2'}`;
  const tone = inList
    ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)]'
    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--text)]';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`${base} ${tone} disabled:cursor-not-allowed disabled:opacity-50`}
      aria-pressed={inList}
    >
      {inList ? '✓ In watchlist' : disabled ? 'Watchlist full' : '+ Add to watchlist'}
    </button>
  );
}
