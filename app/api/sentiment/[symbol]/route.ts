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
    if (e instanceof UnknownSymbol) return NextResponse.json({ error: 'Stock not available in this app.' }, { status: 404 });
    if (e instanceof ConfigError) return NextResponse.json({ error: e.message }, { status: 500 });
    if (e instanceof AnalysisUnavailable) return NextResponse.json({ error: 'Analysis is temporarily unavailable. Try again shortly.' }, { status: 502 });
    console.error('analyze failed', e);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 502 });
  }
}
