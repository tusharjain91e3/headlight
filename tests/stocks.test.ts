import { loadStocks, searchStocks } from '@/lib/stocks';

const raw = [
  { symbol: 'AARTIIND', name: 'Aarti Industries Limited' },
  { symbol: 'AARTIDRUGS', name: 'Aarti Drugs Limited' },
  { symbol: 'TCS', name: 'Tata Consultancy Services Limited' },
  { symbol: 'TCS', name: 'dup' },
  { symbol: '', name: 'bad' },
  { symbol: 'X' },
];
const u = loadStocks(raw);

test('drops invalid and duplicate entries', () =>
  expect(u.map((s) => s.symbol)).toEqual(['AARTIIND', 'AARTIDRUGS', 'TCS']));
test('coreName strips Limited/Ltd', () => expect(u[0].coreName).toBe('Aarti Industries'));
test('exact symbol ranks first, case-insensitive', () =>
  expect(searchStocks('tcs', 8, u)[0].symbol).toBe('TCS'));
test('symbol prefix matches come before name substring', () =>
  expect(searchStocks('aarti', 8, u).map((s) => s.symbol)).toEqual(['AARTIIND', 'AARTIDRUGS']));
test('no match returns empty', () => expect(searchStocks('zzzz', 8, u)).toEqual([]));
test('blank query returns empty', () => expect(searchStocks('   ', 8, u)).toEqual([]));
test('limit respected', () => expect(searchStocks('a', 1, u)).toHaveLength(1));

test('match tier beats symbol length (exact > prefix > name prefix > substring)', () => {
  const uni = loadStocks([
    { symbol: 'AB', name: 'Xyz Tcs Corp Limited' },
    { symbol: 'TCSLONGER', name: 'Foo Limited' },
    { symbol: 'QQ', name: 'Tcs Holdings Limited' },
    { symbol: 'TCS', name: 'Tata Consultancy Services Limited' },
  ]);
  expect(searchStocks('tcs', 8, uni).map((s) => s.symbol)).toEqual(['TCS', 'TCSLONGER', 'QQ', 'AB']);
});
