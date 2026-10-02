import type { Article, Stock } from './types';

export interface RawNews {
  title?: string;
  snippet?: string;
  source?: string;
  link?: string;
  iso_date?: string;
  date?: string;
}

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

export function parseDate(iso?: string, rel?: string, now: Date = new Date()): Date | null {
  if (iso) {
    // SerpApi sometimes returns "2026-10-01 08:00:00 UTC"
    const normalized = iso.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/, '$1T$2Z');
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) return d;
  }
  const m = rel?.trim().match(/^(\d+)\s+(minute|hour|day|week)s?\s+ago$/i);
  if (m) return new Date(now.getTime() - Number(m[1]) * UNIT_MS[m[2].toLowerCase()]);
  return null;
}

export function withinWindow(d: Date, days: number, now: Date = new Date()): boolean {
  const age = now.getTime() - d.getTime();
  return age >= 0 && age <= days * 86_400_000;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function isRelevant(a: { title: string; snippet: string }, stock: Stock): boolean {
  const text = `${a.title} ${a.snippet}`;
  if (text.toLowerCase().includes(stock.coreName.toLowerCase())) return true;
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRe(stock.symbol)}([^A-Za-z0-9]|$)`, 'i').test(text);
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

export function dedupe<T extends { title: string; url: string }>(items: T[]): T[] {
  const urls = new Set<string>();
  const titles = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const t = normTitle(it.title);
    if (urls.has(it.url) || titles.has(t)) continue;
    urls.add(it.url);
    titles.add(t);
    out.push(it);
  }
  return out;
}

export function filterArticles(
  raw: RawNews[],
  stock: Stock,
  opts: { days: number; max: number; now?: Date },
): Article[] {
  const now = opts.now ?? new Date();
  const parsed: Article[] = [];
  for (const r of raw) {
    const title = (r.title ?? '').trim();
    if (!title) continue;
    const d = parseDate(r.iso_date, r.date, now);
    if (!d || !withinWindow(d, opts.days, now)) continue;
    const snippet = (r.snippet ?? '').trim().slice(0, 300);
    if (!isRelevant({ title, snippet }, stock)) continue;
    parsed.push({ title, snippet, source: r.source ?? 'Unknown', url: r.link ?? '', published_at: d.toISOString() });
  }
  parsed.sort((a, b) => b.published_at.localeCompare(a.published_at));
  return dedupe(parsed).slice(0, opts.max);
}
