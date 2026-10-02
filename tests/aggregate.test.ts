import { aggregate } from '@/lib/aggregate';
import type { Label } from '@/lib/types';

const now = new Date('2026-10-02T12:00:00Z');
const OLD = '2026-09-28T00:00:00Z';
const NEW = '2026-10-02T06:00:00Z';
const a = (label: Label, published_at = OLD) => ({ label, published_at });
const llm = (label: Label, confidence = 0.8) => ({ label, confidence });

test('empty → cannot_determine', () => expect(aggregate([], llm('positive'), now).label).toBe('cannot_determine'));
test('all cannot_determine → cannot_determine', () =>
  expect(aggregate([a('cannot_determine'), a('cannot_determine')], llm('positive'), now).label).toBe('cannot_determine'));
test('3 pos / 1 neutral → positive (75%)', () =>
  expect(aggregate([a('positive'), a('positive'), a('positive'), a('neutral')], llm('neutral'), now).label).toBe('positive'));
test('3 neg / 1 pos → negative', () =>
  expect(aggregate([a('negative'), a('negative'), a('negative'), a('positive')], llm('neutral'), now).label).toBe('negative'));
test('2 pos / 2 neg → neutral', () =>
  expect(aggregate([a('positive'), a('positive'), a('negative'), a('negative')], llm('positive'), now).label).toBe('neutral'));
test('mostly neutral → neutral', () =>
  expect(aggregate([a('positive'), a('neutral'), a('neutral'), a('neutral')], llm('positive'), now).label).toBe('neutral'));
test('cannot_determine items are ignored in the denominator', () =>
  expect(aggregate([a('positive'), a('positive'), a('cannot_determine'), a('cannot_determine')], llm('positive'), now).label).toBe('positive'));
test('recent articles weigh 1.5x: 1 new pos + 1 old neg + 0 → 60% positive', () =>
  expect(aggregate([a('positive', NEW), a('negative', OLD)], llm('positive'), now).label).toBe('positive'));
test('without recency the same split stays neutral', () =>
  expect(aggregate([a('positive', OLD), a('negative', OLD)], llm('positive'), now).label).toBe('neutral'));
test('confidence below 0.4 → cannot_determine', () =>
  expect(aggregate([a('positive'), a('positive')], llm('positive', 0.3), now).label).toBe('cannot_determine'));
test('returns llm confidence', () =>
  expect(aggregate([a('positive'), a('positive')], llm('positive', 0.77), now).confidence).toBe(0.77));
