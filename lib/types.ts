export type Label = 'positive' | 'neutral' | 'negative' | 'cannot_determine';

export interface Stock {
  symbol: string;
  name: string;
  coreName: string;
  searchKey: string;
}

export interface Article {
  title: string;
  snippet: string;
  source: string;
  url: string;
  published_at: string;
}

export interface LabeledArticle extends Article {
  label: Label;
  reason: string;
}

export interface SentimentResult {
  symbol: string;
  name: string;
  label: Label;
  confidence: number;
  rationale: string;
  articles: LabeledArticle[];
  article_count: number;
  generated_at: string;
  cached: boolean;
  stale?: boolean;
  /** Placeholder for a temporary upstream failure; clients must not persist it. */
  transient?: boolean;
}
