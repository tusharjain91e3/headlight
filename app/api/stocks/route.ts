import { NextResponse } from 'next/server';
import { searchStocks } from '@/lib/stocks';

export function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const results = searchStocks(q, 8).map(({ symbol, name }) => ({ symbol, name }));
  return NextResponse.json({ results });
}
