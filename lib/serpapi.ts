import { serverEnv } from './env';
import { ConfigError, NewsUnavailable } from './errors';
import type { RawNews } from './filter';
import type { Stock } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SerpItem {
  title?: string;
  snippet?: string;
  link?: string;
  iso_date?: string;
  date?: string;
  source?: { name?: string };
  stories?: SerpItem[];
}

const toRaw = (n: SerpItem): RawNews => ({
  title: n.title, snippet: n.snippet, source: n.source?.name, link: n.link, iso_date: n.iso_date, date: n.date,
});

export async function fetchNews(stock: Stock): Promise<RawNews[]> {
  const env = serverEnv();
  const params = new URLSearchParams({
    engine: 'google_news',
    q: `"${stock.coreName}" NSE stock when:7d`,
    gl: 'in',
    hl: 'en',
    api_key: env.serpKey,
  });
  let lastErr = 'unknown';
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`https://serpapi.com/search.json?${params}`, { cache: 'no-store' });
      if (res.status === 429 || res.status >= 500) {
        lastErr = `SerpApi ${res.status}`;
        if (attempt < 2) await sleep(600 * 2 ** attempt);
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new ConfigError('SerpApi rejected the API key');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new NewsUnavailable(data?.error ?? `SerpApi ${res.status}`);
      if (data.error) {
        if (/hasn't returned any results/i.test(data.error)) return [];
        throw new NewsUnavailable(data.error);
      }
      const out: RawNews[] = [];
      for (const n of (data.news_results ?? []) as SerpItem[]) {
        out.push(toRaw(n));
        for (const s of n.stories ?? []) out.push(toRaw(s));
      }
      return out;
    } catch (e) {
      if (e instanceof NewsUnavailable || e instanceof ConfigError) throw e;
      lastErr = (e as Error).message;
      if (attempt < 2) await sleep(600 * 2 ** attempt);
    }
  }
  console.error(`[serpapi] ${stock.symbol}: ${lastErr}`);
  throw new NewsUnavailable(lastErr);
}
