import { vi, beforeEach, afterEach } from 'vitest';
import { classify } from '@/lib/openrouter';
import { loadStocks } from '@/lib/stocks';

const [tcs] = loadStocks([{ symbol: 'TCS', name: 'Tata Consultancy Services Limited' }]);
const arts = [
  { title: 'TCS wins', snippet: 's', source: 'ET', url: 'u1', published_at: '2026-10-02T00:00:00Z' },
  { title: 'TCS hires', snippet: 's', source: 'ET', url: 'u2', published_at: '2026-10-01T00:00:00Z' },
];
const good = {
  symbol: 'TCS',
  overall: { label: 'positive', confidence: 0.9, rationale: 'ok' },
  items: [{ index: 0, label: 'positive', reason: 'r' }, { index: 1, label: 'neutral', reason: 'r' }],
};
const reply = (content: string, status = 200) =>
  Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'k';
  process.env.OPENROUTER_MODEL = 'm';
  process.env.OPENROUTER_BASE_URL = 'https://or.test/api/v1';
  process.env.SERPAPI_API_KEY = 's';
});
afterEach(() => vi.unstubAllGlobals());

test('returns parsed output on first valid reply and sends model, temperature and auth', async () => {
  const f = vi.fn(() => reply(JSON.stringify(good)));
  vi.stubGlobal('fetch', f);
  const r = await classify(tcs, arts);
  expect(r?.overall.label).toBe('positive');
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://or.test/api/v1/chat/completions');
  const body = JSON.parse(init.body as string);
  expect(body.model).toBe('m');
  expect(body.temperature).toBe(0.1);
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
});

test('invalid first reply triggers exactly one repair attempt that can succeed', async () => {
  const f = vi.fn().mockReturnValueOnce(reply('not json')).mockReturnValueOnce(reply(JSON.stringify(good)));
  vi.stubGlobal('fetch', f);
  expect((await classify(tcs, arts))?.overall.label).toBe('positive');
  expect(f).toHaveBeenCalledTimes(2);
  expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).messages.at(-1).content).toContain('not valid JSON');
});

test('still invalid after repair → null', async () => {
  const f = vi.fn(() => reply('nope'));
  vi.stubGlobal('fetch', f);
  expect(await classify(tcs, arts)).toBeNull();
  expect(f).toHaveBeenCalledTimes(2);
});

test('wrong item count is treated as invalid', async () => {
  const f = vi.fn(() => reply(JSON.stringify({ ...good, items: [good.items[0]] })));
  vi.stubGlobal('fetch', f);
  expect(await classify(tcs, arts)).toBeNull();
});

test('provider rejecting response_format is retried once without it', async () => {
  const f = vi.fn()
    .mockReturnValueOnce(Promise.resolve(new Response('{"error":"unsupported"}', { status: 400 })))
    .mockReturnValueOnce(reply(JSON.stringify(good)));
  vi.stubGlobal('fetch', f);
  expect((await classify(tcs, arts))?.overall.label).toBe('positive');
  expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).response_format).toBeUndefined();
});

test('network failure → null (never throws)', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('boom'))));
  expect(await classify(tcs, arts)).toBeNull();
});
