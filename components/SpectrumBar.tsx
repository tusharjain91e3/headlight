import { LABEL_META, LABEL_ORDER } from '@/lib/sentiment-ui';
import type { Label } from '@/lib/types';

export function SpectrumBar({ counts, label = 'Sentiment summary' }: { counts: Record<Label, number>; label?: string }) {
  const total = LABEL_ORDER.reduce((n, l) => n + counts[l], 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--border)]" role="img"
        aria-label={`${label}: ${LABEL_ORDER.map((l) => `${counts[l]} ${LABEL_META[l].text}`).join(', ')}`}>
        {total > 0 && LABEL_ORDER.map((l) => counts[l] > 0 && (
          <div key={l} style={{ flexGrow: counts[l], background: `var(${LABEL_META[l].varName})` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {LABEL_ORDER.map((l) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: `var(${LABEL_META[l].varName})` }} aria-hidden />
            <span className="tnum font-semibold">{counts[l]}</span>
            <span className="text-[var(--muted)]">{LABEL_META[l].text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
