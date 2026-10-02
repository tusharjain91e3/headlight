import { NextResponse } from 'next/server';
import { getStock, searchStocks } from '@/lib/stocks';

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbols = sp.get('symbols');
  if (symbols !== null) {
    // Resolve display names for known symbols (the client never holds the full universe).
    const results = symbols.split(',').slice(0, 50)
      .map((s) => getStock(s))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map(({ symbol, name }) => ({ symbol, name }));
    return NextResponse.json({ results });
  }
  const results = searchStocks(sp.get('q') ?? '', 8).map(({ symbol, name }) => ({ symbol, name }));
  return NextResponse.json({ results });
}
