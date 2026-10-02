import { ConfigError } from './errors';

export interface ServerEnv {
  openrouterKey: string;
  openrouterModel: string;
  openrouterBase: string;
  serpKey: string;
  ttlMs: number;
  maxArticles: number;
  windowDays: number;
  demo: boolean;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function serverEnv(): ServerEnv {
  const e = process.env;
  const demo = e.DEMO_MODE === '1';
  if (!demo) {
    if (!e.OPENROUTER_API_KEY || !e.OPENROUTER_MODEL) throw new ConfigError('OpenRouter is not configured');
    if (!e.SERPAPI_API_KEY) throw new ConfigError('SerpApi is not configured');
  }
  return {
    openrouterKey: e.OPENROUTER_API_KEY ?? '',
    openrouterModel: e.OPENROUTER_MODEL ?? '',
    openrouterBase: (e.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    serpKey: e.SERPAPI_API_KEY ?? '',
    ttlMs: num(e.CACHE_TTL_MINUTES, 60) * 60_000,
    maxArticles: num(e.MAX_ARTICLES_PER_STOCK, 10),
    windowDays: num(e.NEWS_WINDOW_DAYS, 7),
    demo,
  };
}
