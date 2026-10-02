import { vi, beforeEach, afterEach } from 'vitest';
import { fetchNews } from '@/lib/serpapi';
import { loadStocks } from '@/lib/stocks';
import { ConfigError, NewsUnavailable } from '@/lib/errors';

const [tcs] = loadStocks([{ symbol: 'TCS', name: 'Tata Consultancy Services Limited' }]);
const res = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'k'; process.env.OPENROUTER_MODEL = 'm'; process.env.SERPAPI_API_KEY = 's';
});
afterEach(() => vi.unstubAllGlobals());

test('401 from SerpApi is a ConfigError, not a retry loop', async () => {
  const f = vi.fn(() => res({ error: 'Invalid API key.' }, 401));
  vi.stubGlobal('fetch', f);
  await expect(fetchNews(tcs)).rejects.toBeInstanceOf(ConfigError);
  expect(f).toHaveBeenCalledTimes(1);
});

test('"no results" payload returns an empty list', async () => {
  vi.stubGlobal('fetch', vi.fn(() => res({ error: "Google hasn't returned any results for this query." })));
  expect(await fetchNews(tcs)).toEqual([]);
});

test('other error payloads are NewsUnavailable', async () => {
  vi.stubGlobal('fetch', vi.fn(() => res({ error: 'Your account has run out of searches.' })));
  await expect(fetchNews(tcs)).rejects.toBeInstanceOf(NewsUnavailable);
});

test('flattens clustered stories and maps source.name', async () => {
  vi.stubGlobal('fetch', vi.fn(() => res({ news_results: [
    { title: 'A', link: 'a', iso_date: '2026-10-01T00:00:00Z', source: { name: 'ET' }, stories: [{ title: 'B', link: 'b', source: { name: 'Mint' } }] },
  ] })));
  const out = await fetchNews(tcs);
  expect(out.map((n) => [n.title, n.source])).toEqual([['A', 'ET'], ['B', 'Mint']]);
});
