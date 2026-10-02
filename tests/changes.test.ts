import { nextPrev, activeChange, CHANGE_WINDOW_MS } from '@/lib/changes';

const now = 1_000_000_000_000;
const old = (label: 'positive' | 'neutral', prev?: { label: 'negative'; changedAt: number }) => ({ result: { label }, prev });

describe('nextPrev', () => {
  test('no old entry → undefined (first-ever result never badges)', () => expect(nextPrev(undefined, 'positive', now)).toBeUndefined());
  test('same label keeps existing prev', () => {
    const p = { label: 'negative' as const, changedAt: 5 };
    expect(nextPrev(old('positive', p), 'positive', now)).toBe(p);
  });
  test('same label with no prev → undefined', () => expect(nextPrev(old('positive'), 'positive', now)).toBeUndefined());
  test('different label records the OLD label and now', () =>
    expect(nextPrev(old('neutral'), 'negative', now)).toEqual({ label: 'neutral', changedAt: now }));
});

describe('activeChange', () => {
  test('undefined prev → undefined', () => expect(activeChange(undefined, 'positive', now)).toBeUndefined());
  test('prev equal to current → undefined', () => expect(activeChange({ label: 'positive', changedAt: now }, 'positive', now)).toBeUndefined());
  test('within window → returned', () => {
    const p = { label: 'neutral' as const, changedAt: now - 1000 };
    expect(activeChange(p, 'negative', now)).toBe(p);
  });
  test('older than 7 days → undefined', () =>
    expect(activeChange({ label: 'neutral', changedAt: now - CHANGE_WINDOW_MS - 1 }, 'negative', now)).toBeUndefined());
});
