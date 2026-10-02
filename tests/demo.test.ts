import { demoResult, resetDemoFlips } from '@/lib/demo';
import { loadStocks } from '@/lib/stocks';

const [tcs, infy] = loadStocks([
  { symbol: 'TCS', name: 'Tata Consultancy Services Limited' },
  { symbol: 'INFY', name: 'Infosys Limited' },
]);
const LABELS = ['positive', 'neutral', 'negative', 'cannot_determine'];

beforeEach(resetDemoFlips);

test('without refresh the seeded label is kept', () => expect(demoResult(tcs).label).toBe('positive'));
test('a refresh flips a flip-stock to a different label', () => {
  expect(demoResult(tcs, { refresh: true }).label).not.toBe('positive');
});
test('flipped label persists on later non-refresh calls', () => {
  const flipped = demoResult(tcs, { refresh: true }).label;
  expect(demoResult(tcs).label).toBe(flipped);
});
test('non-flip stocks never change on refresh', () => {
  const before = demoResult(infy).label;
  expect(demoResult(infy, { refresh: true }).label).toBe(before);
});
test('flipped result is still a valid SentimentResult', () => {
  const r = demoResult(tcs, { refresh: true });
  expect(LABELS).toContain(r.label);
  expect(Array.isArray(r.articles)).toBe(true);
  expect(r.symbol).toBe('TCS');
});
