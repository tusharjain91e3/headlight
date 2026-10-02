import raw from '@/data/equity_symbols.json';
import type { Stock } from './types';

export function loadStocks(input: unknown): Stock[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Stock[] = [];
  for (const e of input) {
    const symbol = typeof e?.symbol === 'string' ? e.symbol.trim() : '';
    const name = typeof e?.name === 'string' ? e.name.trim() : '';
    if (!symbol || !name || seen.has(symbol.toUpperCase())) continue;
    seen.add(symbol.toUpperCase());
    out.push({
      symbol,
      name,
      coreName: name.replace(/\s+(limited|ltd\.?)\s*$/i, '').trim(),
      searchKey: `${symbol} ${name}`.toLowerCase(),
    });
  }
  return out;
}

const ALL = loadStocks(raw);
const BY_SYMBOL = new Map(ALL.map((s) => [s.symbol.toUpperCase(), s]));

export function getStock(symbol: string): Stock | undefined {
  return BY_SYMBOL.get(symbol.trim().toUpperCase());
}

function score(s: Stock, q: string): number {
  const sym = s.symbol.toLowerCase();
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (s.coreName.toLowerCase().startsWith(q) || s.name.toLowerCase().startsWith(q)) return 2;
  if (s.searchKey.includes(q)) return 3;
  return -1;
}

export function searchStocks(query: string, limit = 8, universe: Stock[] = ALL): Stock[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return universe
    .map((s) => ({ s, sc: score(s, q) }))
    .filter((x) => x.sc >= 0)
    .sort((a, b) => a.sc - b.sc || a.s.symbol.length - b.s.symbol.length || a.s.symbol.localeCompare(b.s.symbol))
    .slice(0, limit)
    .map((x) => x.s);
}
