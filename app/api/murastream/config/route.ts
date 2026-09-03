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

  // All sources go through our ad-stripping proxy
  const proxyBase = '/api/murastream/proxy';

  const sources: Record<string, { id: string; label: string; url: string }> = {
    nexstream: {
      id: 'nexstream',
      label: 'NexStream',
      url: `${proxyBase}?type=${type}&id=${id}&season=${season}&episode=${episode}&source=nexstream`,
    },
    videasy: {
      id: 'videasy',
      label: 'Videasy',
      url: `${proxyBase}?type=${type}&id=${id}&season=${season}&episode=${episode}&source=videasy`,
    },
    vidsrc: {
      id: 'vidsrc',
      label: 'VidSrc',
      url: `${proxyBase}?type=${type}&id=${id}&season=${season}&episode=${episode}&source=vidsrc`,
    },
    vidking: {
      id: 'vidking',
      label: 'Vidking',
      url: `${proxyBase}?type=${type}&id=${id}&season=${season}&episode=${episode}&source=vidking`,
    },
  };

  const activeSource = sources.nexstream;

  return NextResponse.json({
    sources,
    active: activeSource,
    defaultSource: 'nexstream',
  });
}
