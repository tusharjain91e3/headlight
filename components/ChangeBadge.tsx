import { LABEL_META } from '@/lib/sentiment-ui';
import { timeAgo } from '@/lib/time';
import type { Label } from '@/lib/types';

export function ChangeBadge({ from, to, at }: { from: Label; to: Label; at: number }) {
  const f = LABEL_META[from];
  const t = LABEL_META[to];
  return (
    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs"
      title="The label changed since your last check">
      <span style={{ color: `var(${f.varName})` }}>{f.text}</span>
      <span className="text-[var(--muted)]" aria-hidden>→</span>
      <span className="font-medium" style={{ color: `var(${t.varName})` }}>{t.text}</span>
      <span className="text-[var(--muted)]">· {timeAgo(new Date(at))}</span>
    </span>
  );
}
