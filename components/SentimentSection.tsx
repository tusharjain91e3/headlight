import { LABEL_META } from '@/lib/sentiment-ui';
import type { Label } from '@/lib/types';

export function SentimentSection({ label, count, children }: { label: Label; count: number; children: React.ReactNode }) {
  const v = LABEL_META[label].varName;
  return (
    <section className="mt-8" aria-label={LABEL_META[label].text}>
      <h2 className="mb-1 flex items-center gap-2 px-4 text-sm font-semibold">
        <span className="size-2 rounded-full" style={{ background: `var(${v})` }} aria-hidden />
        {LABEL_META[label].text}
        <span className="tnum font-normal text-[var(--muted)]">{count}</span>
      </h2>
      <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">{children}</div>
    </section>
  );
}
