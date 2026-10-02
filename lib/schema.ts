import { z } from 'zod';
import type { Label } from './types';

const LabelEnum = z.enum(['positive', 'neutral', 'negative', 'cannot_determine']);

export const LlmOutput = z.object({
  symbol: z.string(),
  overall: z.object({
    label: LabelEnum,
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  items: z.array(z.object({ index: z.number().int(), label: LabelEnum, reason: z.string() })),
});

export type LlmOutputT = z.infer<typeof LlmOutput> & {
  overall: { label: Label };
};

export function parseLlmJson(
  text: string,
  expectedCount: number,
): { ok: true; data: LlmOutputT } | { ok: false; error: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'No JSON object found in reply' };
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const r = LlmOutput.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  if (r.data.items.length !== expectedCount)
    return { ok: false, error: `Expected ${expectedCount} items, got ${r.data.items.length}` };
  const idx = r.data.items.map((i) => i.index).sort((a, b) => a - b);
  if (!idx.every((v, i) => v === i)) return { ok: false, error: 'Item indexes must be 0..n-1 with no gaps or duplicates' };
  return { ok: true, data: r.data };
}
