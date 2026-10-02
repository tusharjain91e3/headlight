import { NextResponse } from 'next/server';
import { analyzeStock } from '@/lib/analyze';
import { AnalysisUnavailable, ConfigError, UnknownSymbol } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const refresh = new URL(req.url).searchParams.get('refresh') === '1';
  try {
    return NextResponse.json(await analyzeStock(decodeURIComponent(symbol), { refresh }));
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    let status = 502;
    let error = 'Analysis failed';
    if (e instanceof UnknownSymbol) { status = 404; error = 'Stock not available in this app.'; }
    else if (e instanceof ConfigError) { status = 500; error = e.message; }
    else if (e instanceof AnalysisUnavailable) error = 'Analysis is temporarily unavailable. Try again shortly.';
    console.error(`[api/sentiment/${symbol}] ${status} ${error} | reason: ${reason}`);
    return NextResponse.json({ error, reason }, { status });
  }
}
