import { parseDate, withinWindow, isRelevant, dedupe, filterArticles } from '@/lib/filter';
import { loadStocks } from '@/lib/stocks';

const now = new Date('2026-10-02T12:00:00Z');
const [tcs, aarti] = loadStocks([
  { symbol: 'TCS', name: 'Tata Consultancy Services Limited' },
  { symbol: 'AARTIIND', name: 'Aarti Industries Limited' },
]);

describe('parseDate', () => {
  test('prefers ISO date', () => expect(parseDate('2026-10-01T08:00:00Z', 'junk', now)?.toISOString()).toBe('2026-10-01T08:00:00.000Z'));
  test('parses SerpApi "2026-10-01 08:00:00 UTC" style', () => expect(parseDate('2026-10-01 08:00:00 UTC', undefined, now)?.toISOString()).toBe('2026-10-01T08:00:00.000Z'));
  test('parses relative days', () => expect(parseDate(undefined, '2 days ago', now)?.toISOString()).toBe('2026-09-30T12:00:00.000Z'));
  test('parses relative hours', () => expect(parseDate(undefined, '3 hours ago', now)?.toISOString()).toBe('2026-10-02T09:00:00.000Z'));
  test('parses relative weeks', () => expect(parseDate(undefined, '1 week ago', now)?.toISOString()).toBe('2026-09-25T12:00:00.000Z'));
  test('garbage → null', () => expect(parseDate('nope', 'whenever', now)).toBeNull());
  test('nothing → null', () => expect(parseDate(undefined, undefined, now)).toBeNull());
});

describe('withinWindow', () => {
  test('inside', () => expect(withinWindow(new Date('2026-09-28T00:00:00Z'), 7, now)).toBe(true));
  test('outside', () => expect(withinWindow(new Date('2026-09-20T00:00:00Z'), 7, now)).toBe(false));
  test('future dates rejected', () => expect(withinWindow(new Date('2026-10-09T00:00:00Z'), 7, now)).toBe(false));
});

describe('isRelevant', () => {
  test('by coreName, case-insensitive', () => expect(isRelevant({ title: 'tata consultancy services bags deal', snippet: '' }, tcs)).toBe(true));
  test('by whole-word symbol', () => expect(isRelevant({ title: 'TCS wins deal', snippet: '' }, tcs)).toBe(true));
  test('symbol inside another word is not relevant', () => expect(isRelevant({ title: 'ATCSX launches', snippet: '' }, tcs)).toBe(false));
  test('unrelated', () => expect(isRelevant({ title: 'Markets rally', snippet: 'Nifty up' }, aarti)).toBe(false));
});

describe('dedupe', () => {
  test('same url', () => expect(dedupe([{ title: 'A', url: 'u' }, { title: 'B', url: 'u' }])).toHaveLength(1));
  test('same normalized title', () =>
    expect(dedupe([{ title: 'TCS Wins Deal!', url: 'a' }, { title: 'tcs wins   deal', url: 'b' }])).toHaveLength(1));
  test('distinct kept in order', () => expect(dedupe([{ title: 'A', url: '1' }, { title: 'B', url: '2' }]).map((x) => x.title)).toEqual(['A', 'B']));
});

describe('filterArticles', () => {
  const raw = [
    { title: 'TCS old news', snippet: 'x', source: 'S', link: 'o', iso_date: '2026-09-01T00:00:00Z' },
    { title: 'TCS fresh A', snippet: 'x'.repeat(400), source: 'S', link: 'a', iso_date: '2026-10-01T00:00:00Z' },
    { title: 'TCS fresher B', snippet: 'y', source: 'S', link: 'b', iso_date: '2026-10-02T06:00:00Z' },
    { title: 'TCS undated', snippet: 'y', source: 'S', link: 'c' },
    { title: '', snippet: 'TCS empty title', source: 'S', link: 'd', iso_date: '2026-10-02T06:00:00Z' },
    { title: 'Unrelated', snippet: 'nothing', source: 'S', link: 'e', iso_date: '2026-10-02T06:00:00Z' },
  ];
  test('drops old, undated, empty-title and irrelevant; newest first', () =>
    expect(filterArticles(raw, tcs, { days: 7, max: 10, now }).map((a) => a.title)).toEqual(['TCS fresher B', 'TCS fresh A']));
  test('caps at max', () => expect(filterArticles(raw, tcs, { days: 7, max: 1, now })).toHaveLength(1));
  test('truncates snippet to 300 chars', () =>
    expect(filterArticles(raw, tcs, { days: 7, max: 10, now })[1].snippet.length).toBeLessThanOrEqual(300));
});

test('parseDate handles SerpApi Google News "MM/DD/YYYY, hh:mm AM, +0000 UTC"', () => {
  expect(parseDate(undefined, '09/30/2026, 06:15 PM, +0000 UTC', now)?.toISOString()).toBe('2026-09-30T18:15:00.000Z');
});
