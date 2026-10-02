import type { Label } from './types';

export const CHANGE_WINDOW_MS = 7 * 86_400_000;

export interface Prev { label: Label; changedAt: number }

export function nextPrev(
  old: { result: { label: Label }; prev?: Prev } | undefined,
  newLabel: Label,
  now: number,
): Prev | undefined {
  if (!old) return undefined;
  if (old.result.label !== newLabel) return { label: old.result.label, changedAt: now };
  return old.prev;
}

export function activeChange(prev: Prev | undefined, current: Label, now: number): Prev | undefined {
  if (!prev || prev.label === current) return undefined;
  if (now - prev.changedAt > CHANGE_WINDOW_MS) return undefined;
  return prev;
}
