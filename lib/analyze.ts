import { aggregate } from './aggregate';
import { cache } from './cache';
import { demoResult } from './demo';
import { serverEnv } from './env';
import { AnalysisUnavailable, NewsUnavailable, UnknownSymbol } from './errors';
import { filterArticles } from './filter';
import { classify } from './openrouter';
import { fetchNews } from './serpapi';
import { getStock } from './stocks';
import type { Label, SentimentResult, Stock } from './types';

const REFRESH_COOLDOWN_MS = 5 * 60_000;

function empty(stock: Stock, rationale: string, label: Label = 'cannot_determine'): SentimentResult {
  return {
    symbol: stock.symbol, name: stock.name, label, confidence: 0, rationale,
    articles: [], article_count: 0, generated_at: new Date().toISOString(), cached: false,
  };
}

export async function analyzeStock(symbol: string, opts: { refresh?: boolean } = {}): Promise<SentimentResult> {
  const stock = getStock(symbol);
  if (!stock) throw new UnknownSymbol(symbol);
  const env = serverEnv();
  if (env.demo) return demoResult(stock, { refresh: opts.refresh });

  const key = stock.symbol;
  const hit = cache.get(key);
  if (hit) {
    const last = cache.lastRefresh.get(key) ?? 0;
    const refreshAllowed = opts.refresh && Date.now() - last >= REFRESH_COOLDOWN_MS;
    if (!refreshAllowed) return { ...hit, cached: true };
  }
  if (opts.refresh) cache.lastRefresh.set(key, Date.now());

  let raw;
  try {
    raw = await fetchNews(stock);
  } catch (e) {
    if (!(e instanceof NewsUnavailable)) throw e;
    const stale = cache.getStale(key);
    if (stale) return { ...stale, cached: true, stale: true };
    return { ...empty(stock, 'News unavailable.'), transient: true };
  }

  const articles = filterArticles(raw, stock, { days: env.windowDays, max: env.maxArticles });
  if (articles.length === 0) {
    const r = empty(stock, 'No recent news.');
    cache.set(key, r, env.ttlMs);
    return r;
  }

  const diag: { reason?: string } = {};
  const llm = await classify(stock, articles, diag);
  if (!llm) {
    const stale = cache.getStale(key);
    if (stale) return { ...stale, cached: true, stale: true };
    throw new AnalysisUnavailable(diag.reason ?? 'LLM returned no usable result');
  }

  const byIndex = new Map(llm.items.map((i) => [i.index, i]));
  const labeled = articles.map((a, i) => ({
    ...a, label: byIndex.get(i)!.label as Label, reason: byIndex.get(i)!.reason,
  }));
  const agg = aggregate(labeled, { label: llm.overall.label as Label, confidence: llm.overall.confidence });
  const downgraded = agg.label === 'cannot_determine' && llm.overall.label !== 'cannot_determine';
  const result: SentimentResult = {
    symbol: stock.symbol, name: stock.name, label: agg.label, confidence: agg.confidence,
    rationale: downgraded ? 'Evidence is too thin or uncertain to call.' : llm.overall.rationale,
    articles: labeled, article_count: labeled.length, generated_at: new Date().toISOString(), cached: false,
  };
  cache.set(key, result, env.ttlMs);
  return result;
}
