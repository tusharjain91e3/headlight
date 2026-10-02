import type { Label, LabeledArticle, SentimentResult, Stock } from './types';

type Seed = { label: Label; confidence: number; rationale: string; items: [string, string, Label, string, number][] };

// Sample data for DEMO_MODE only — headlines are illustrative, not real news.
const SEEDS: Record<string, Seed> = {
  TCS: {
    label: 'positive', confidence: 0.82, rationale: 'Large deal wins and steady guidance point to a favorable week for the company.',
    items: [
      ['TCS bags multi-year cloud transformation deal from European retailer', 'Mint', 'positive', 'Major new contract win.', 6],
      ['TCS announces expansion of AI delivery centres', 'Economic Times', 'positive', 'Capacity expansion announced.', 30],
      ['TCS to hold board meeting on dividend next week', 'Business Standard', 'neutral', 'Routine scheduled event.', 52],
    ],
  },
  RELIANCE: {
    label: 'neutral', confidence: 0.64, rationale: 'Retail strength is offset by softer refining margins, leaving a balanced picture.',
    items: [
      ['Reliance Retail reports strong festive-season footfall', 'Moneycontrol', 'positive', 'Strong retail demand.', 10],
      ['Reliance Industries refining margins soften in September', 'Reuters', 'negative', 'Margin pressure in refining.', 28],
      ['Reliance Industries to hold AGM-related shareholder call', 'LiveMint', 'neutral', 'Routine corporate event.', 70],
    ],
  },
  INFY: {
    label: 'positive', confidence: 0.74, rationale: 'Analyst upgrades and new contracts outweigh minor routine filings.',
    items: [
      ['Infosys upgraded by brokerage on improving deal pipeline', 'Business Standard', 'positive', 'Analyst upgrade.', 8],
      ['Infosys wins digital banking contract', 'Economic Times', 'positive', 'New contract win.', 40],
      ['Infosys files routine disclosure with exchanges', 'NSE', 'neutral', 'Routine filing.', 60],
    ],
  },
  HDFCBANK: {
    label: 'neutral', confidence: 0.58, rationale: 'Steady deposit growth is balanced by margin commentary; no clear direction.',
    items: [
      ['HDFC Bank deposit growth steady in the latest quarter update', 'Mint', 'neutral', 'In-line update.', 12],
      ['HDFC Bank net interest margin outlook cautious, say analysts', 'Moneycontrol', 'negative', 'Margin concern.', 44],
      ['HDFC Bank launches new SME lending product', 'Economic Times', 'positive', 'New product launch.', 66],
    ],
  },
  TMPV: {
    label: 'negative', confidence: 0.7, rationale: 'Production disruption and a rating downgrade dominate recent coverage.',
    items: [
      ['Tata Motors Passenger Vehicles cuts output after supply disruption', 'Reuters', 'negative', 'Production disruption.', 9],
      ['Tata Motors PV downgraded by global brokerage on margin worries', 'Bloomberg', 'negative', 'Analyst downgrade.', 26],
      ['Tata Motors PV showcases new EV concept', 'Autocar India', 'positive', 'New product showcase.', 50],
    ],
  },
  ETERNAL: {
    label: 'positive', confidence: 0.78, rationale: 'Strong order growth and improving profitability drive favorable coverage.',
    items: [
      ['Eternal (Zomato) quick-commerce orders jump sharply quarter on quarter', 'Moneycontrol', 'positive', 'Strong order growth.', 7],
      ['Eternal turns profitable in food delivery segment, says report', 'Mint', 'positive', 'Profitability improving.', 33],
    ],
  },
  ADANIENT: {
    label: 'negative', confidence: 0.66, rationale: 'Regulatory scrutiny headlines outweigh the positive project news.',
    items: [
      ['Regulator seeks clarification from Adani Enterprises on disclosures', 'Reuters', 'negative', 'Regulatory scrutiny.', 14],
      ['Adani Enterprises lenders review exposure, say sources', 'Bloomberg', 'negative', 'Lender caution.', 38],
      ['Adani Enterprises commissions new airport terminal', 'Economic Times', 'positive', 'Project milestone.', 55],
    ],
  },
  IDEA: {
    label: 'cannot_determine', confidence: 0.3, rationale: 'Recent items are vague or mostly about other telecom operators.',
    items: [
      ['Telecom sector sees tariff speculation ahead of auctions', 'Mint', 'cannot_determine', 'About the sector, not the company.', 18],
      ['Vodafone Idea shares trade flat in volatile session', 'Moneycontrol', 'cannot_determine', 'No clear directional news.', 42],
    ],
  },
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function generic(stock: Stock): Seed {
  const label = (['positive', 'neutral', 'negative', 'cannot_determine'] as Label[])[hash(stock.symbol) % 4];
  const c = stock.coreName;
  const texts: Record<Label, [string, string][]> = {
    positive: [[`${c} reports healthy quarterly numbers`, 'Strong results.'], [`${c} secures new order`, 'New order win.']],
    neutral: [[`${c} schedules board meeting`, 'Routine event.'], [`${c} files routine disclosure`, 'Routine filing.']],
    negative: [[`${c} faces regulatory notice`, 'Regulatory concern.'], [`${c} reports weaker margins`, 'Margin pressure.']],
    cannot_determine: [[`Sector update mentions ${c} in passing`, 'Too vague.'], [`${c} shares move on thin volumes`, 'No clear driver.']],
  };
  return {
    label,
    confidence: label === 'cannot_determine' ? 0.3 : 0.65,
    rationale: label === 'cannot_determine' ? 'Recent coverage is too vague to call.' : `Sample ${label} coverage for demonstration.`,
    items: texts[label].map(([t, r], i) => [t, 'Sample', label, r, 10 + i * 20] as [string, string, Label, string, number]),
  };
}

export function demoResult(stock: Stock): SentimentResult {
  const seed = SEEDS[stock.symbol.toUpperCase()] ?? generic(stock);
  const now = Date.now();
  const articles: LabeledArticle[] = seed.items.map(([title, source, label, reason, hoursAgo]) => ({
    title, snippet: '', source, url: 'https://news.google.com', published_at: new Date(now - hoursAgo * 3_600_000).toISOString(), label, reason,
  }));
  return {
    symbol: stock.symbol, name: stock.name, label: seed.label, confidence: seed.confidence, rationale: seed.rationale,
    articles, article_count: articles.length, generated_at: new Date(now).toISOString(), cached: false,
  };
}
