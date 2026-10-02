import type { Label } from './types';

export const LABEL_ORDER: Label[] = ['positive', 'neutral', 'negative', 'cannot_determine'];

export const LABEL_META: Record<Label, { text: string; varName: string }> = {
  positive: { text: 'Positive', varName: '--pos' },
  neutral: { text: 'Neutral', varName: '--neu' },
  negative: { text: 'Negative', varName: '--neg' },
  cannot_determine: { text: 'Cannot determine', varName: '--unk' },
};
