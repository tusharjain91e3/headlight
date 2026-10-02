import { parseLlmJson } from '@/lib/schema';

const good = {
  symbol: 'TCS',
  overall: { label: 'positive', confidence: 0.8, rationale: 'Good.' },
  items: [{ index: 0, label: 'positive', reason: 'r' }, { index: 1, label: 'neutral', reason: 'r' }],
};

test('valid JSON ok', () => expect(parseLlmJson(JSON.stringify(good), 2).ok).toBe(true));
test('code-fenced JSON ok', () => expect(parseLlmJson('```json\n' + JSON.stringify(good) + '\n```', 2).ok).toBe(true));
test('prose around JSON ok', () => expect(parseLlmJson('Sure! ' + JSON.stringify(good) + ' Hope it helps', 2).ok).toBe(true));
test('wrong item count fails', () => expect(parseLlmJson(JSON.stringify(good), 3).ok).toBe(false));
test('non-contiguous indexes fail', () => {
  const bad = { ...good, items: [{ index: 0, label: 'positive', reason: 'r' }, { index: 5, label: 'neutral', reason: 'r' }] };
  expect(parseLlmJson(JSON.stringify(bad), 2).ok).toBe(false);
});
test('bad label fails', () => {
  const bad = { ...good, overall: { ...good.overall, label: 'great' } };
  expect(parseLlmJson(JSON.stringify(bad), 2).ok).toBe(false);
});
test('confidence out of range fails', () => {
  const bad = { ...good, overall: { ...good.overall, confidence: 1.5 } };
  expect(parseLlmJson(JSON.stringify(bad), 2).ok).toBe(false);
});
test('not JSON fails with error message', () => {
  const r = parseLlmJson('totally not json', 2);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
});
