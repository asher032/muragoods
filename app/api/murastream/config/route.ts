// MuraStream — Streaming Config API
// Returns proxied streaming source URLs (ads stripped server-side)
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'movie';
  const id = searchParams.get('id');
  const season = searchParams.get('season') || '1';
  const episode = searchParams.get('episode') || '1';

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  // All sources route through ad-stripping proxy (URLs rewritten to absolute)
  const proxyBase = '/api/murastream/proxy';
  // VidSrc removed — blocks server-side requests (403)
  const sources: Record<string, { id: string; label: string; url: string }> = {
    vidking: {
      id: 'vidking',
      label: 'VidKing',
      url: `${proxyBase}?type=${type}&id=${id}&season=${season}&episode=${episode}&source=vidking`,
    },
    videasy: {
      id: 'videasy',
      label: 'Videasy',
      url: `${proxyBase}?type=${type}&id=${id}&season=${season}&episode=${episode}&source=videasy`,
    },
  };

  const defaultKey = 'vidking';
  const activeSource = sources[defaultKey];

  return NextResponse.json({
    sources,
    active: activeSource,
    defaultSource: defaultKey,
  });
}
