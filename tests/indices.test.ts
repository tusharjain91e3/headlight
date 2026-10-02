import { NIFTY_50 } from '@/lib/indices';
import { getStock } from '@/lib/stocks';

test('has 50 symbols', () => expect(NIFTY_50).toHaveLength(50));
test('all unique', () => expect(new Set(NIFTY_50).size).toBe(50));
test('every symbol exists in the stock universe', () => {
  const missing = NIFTY_50.filter((s) => !getStock(s));
  expect(missing).toEqual([]);
});
