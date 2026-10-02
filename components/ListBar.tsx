'use client';
import { useEffect, useState } from 'react';
import { MAX_LISTS, NAME_MAX, type WatchList } from '@/lib/lists';

interface Props {
  lists: WatchList[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => { ok: true } | { ok: false; error: string };
  onDelete: (id: string) => void;
}

export function ListBar({ lists, activeId, onSelect, onCreate, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const active = lists.find((l) => l.id === activeId) ?? lists[0];

  useEffect(() => { setEditing(false); setError(''); }, [activeId]);

  const startRename = () => { setDraft(active.name); setError(''); setEditing(true); };
  const cancel = () => { setEditing(false); setError(''); };
  const commit = () => {
    const r = onRename(active.id, draft);
    if (r.ok) { setEditing(false); setError(''); } else setError(r.error);
  };

  return (
    <div className="mt-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Watchlists">
        {lists.map((l) => l.id === active.id && editing ? (
          <input key={l.id} autoFocus value={draft} maxLength={NAME_MAX + 5} aria-label="Watchlist name"
            onChange={(e) => { setDraft(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') cancel(); }}
            onBlur={cancel}
            className="w-44 shrink-0 rounded-full border border-[var(--text)] bg-[var(--surface)] px-3.5 py-1.5 text-sm outline-none" />
        ) : (
          <button key={l.id} type="button" role="tab" aria-selected={l.id === active.id} onClick={() => onSelect(l.id)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${l.id === active.id
              ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)]'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]'}`}>
            {l.name} <span className="tnum opacity-70">{l.items.length}</span>
          </button>
        ))}
        <button type="button" onClick={onCreate} disabled={lists.length >= MAX_LISTS}
          title={lists.length >= MAX_LISTS ? `Up to ${MAX_LISTS} lists` : 'Create a new list'}
          className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-[var(--border)] px-3.5 py-1.5 text-sm font-medium text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50">
          + New list
        </button>
      </div>
      <div className="mt-1 flex items-center gap-4 text-sm">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={editing ? commit : startRename} className="font-medium text-[var(--muted)] hover:text-[var(--text)]">
          {editing ? 'Save name' : 'Rename'}
        </button>
        <button type="button" onClick={() => onDelete(active.id)} disabled={lists.length <= 1}
          title={lists.length <= 1 ? 'You need at least one list' : 'Delete this list'}
          className="font-medium text-[var(--muted)] hover:text-[var(--neg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--muted)]">
          Delete
        </button>
        {error && <span role="alert" className="text-[var(--neg)]">{error}</span>}
      </div>
    </div>
  );
}
