import { NextResponse } from 'next/server';
export async function GET() {
  const token = process.env.TMDB_ACCESS_TOKEN;
  const key = process.env.TMDB_API_KEY;
  const ns = process.env.NEXTSTREAM_API_KEY;
  return NextResponse.json({
    hasToken: !!token,
    tokenLen: token?.length || 0,
    tokenStart: token?.substring(0, 10) || 'none',
    hasKey: !!key,
    keyStart: key?.substring(0, 8) || 'none',
    hasNextStream: !!ns,
    nsStart: ns?.substring(0, 6) || 'none',
  });
}
