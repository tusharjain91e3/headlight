import { LABEL_META } from '@/lib/sentiment-ui';
import type { Label } from '@/lib/types';

export function SentimentPill({ label, size = 'sm' }: { label: Label; size?: 'sm' | 'lg' }) {
  const v = LABEL_META[label].varName;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium ${size === 'lg' ? 'px-3.5 py-1.5 text-base' : 'px-2.5 py-1 text-xs'}`}
      style={{ background: `var(${v}-bg)`, color: `var(${v})` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: `var(${v})` }} aria-hidden />
      {LABEL_META[label].text}
    </span>
  );
}
