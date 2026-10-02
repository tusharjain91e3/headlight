import { timeAgo } from '@/lib/time';

const now = new Date('2026-10-02T12:00:00Z').getTime();
test('just now under a minute', () => expect(timeAgo('2026-10-02T11:59:30Z', now)).toBe('just now'));
test('minutes', () => expect(timeAgo('2026-10-02T11:15:00Z', now)).toBe('45m ago'));
test('hours', () => expect(timeAgo('2026-10-02T06:00:00Z', now)).toBe('6h ago'));
test('days', () => expect(timeAgo('2026-09-29T12:00:00Z', now)).toBe('3d ago'));
test('invalid date → empty string', () => expect(timeAgo('garbage', now)).toBe(''));
