'use client';
import { useEffect, useRef, useState } from 'react';
import type { Option } from '@/hooks/useAnalyze';

interface Props {
  inputId: string;
  onPick: (o: Option) => void;
  placeholder?: string;
  autoFocus?: boolean;
  renderAction?: (o: Option) => React.ReactNode;
}

export function StockPicker({ inputId, onPick, placeholder = 'Search by company name or symbol', autoFocus, renderAction }: Props) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [searched, setSearched] = useState('');
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setOptions([]); setSearched(''); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const data = await res.json();
        setOptions(data.results ?? []);
        setSearched(q);
        setActive(-1);
      } catch { /* aborted or offline — keep previous options */ }
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [query]);

  const pick = (o: Option) => {
    setOptions([]);
    setQuery('');
    setSearched('');
    onPick(o);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && options.length) { e.preventDefault(); pick(options[active >= 0 ? active : 0]); }
    else if (e.key === 'Escape') setOptions([]);
  };

  const noMatch = query.trim() !== '' && searched === query.trim() && options.length === 0;

  return (
    <div>
      <div className="relative">
        <label htmlFor={inputId} className="sr-only">Search NSE stocks by name or symbol</label>
        <input
          id={inputId} ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
          placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={options.length > 0}
          aria-controls={`${inputId}-options`} aria-activedescendant={active >= 0 ? `${inputId}-opt-${active}` : undefined}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-base outline-none placeholder:text-[var(--muted)] focus:border-[var(--text)]"
        />
        {options.length > 0 && (
          <ul id={`${inputId}-options`} role="listbox" className="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {options.map((o, i) => (
              <li key={o.symbol} id={`${inputId}-opt-${i}`} role="option" aria-selected={i === active}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${i === active ? 'bg-[var(--bg)]' : ''} ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold tracking-tight">{o.symbol}</span>
                  <span className="ml-2 truncate text-sm text-[var(--muted)]">{o.name}</span>
                </div>
                {renderAction?.(o)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {noMatch && <p className="mt-4 text-sm text-[var(--muted)]">Stock not available in this app.</p>}
    </div>
  );
}
