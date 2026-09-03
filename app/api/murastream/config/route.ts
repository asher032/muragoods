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

  // Direct embed URLs — no proxy (proxy broke player routing)
  const sources: Record<string, { id: string; label: string; url: string }> = {
    vidking: {
      id: 'vidking',
      label: 'VidKing',
      url: type === 'movie'
        ? `https://www.vidking.net/embed/movie/${id}?color=ffa600`
        : `https://www.vidking.net/embed/tv/${id}/${season}/${episode}?color=ffa600`,
    },
    videasy: {
      id: 'videasy',
      label: 'Videasy',
      url: type === 'movie'
        ? `https://player.videasy.to/movie/${id}`
        : `https://player.videasy.to/tv/${id}/${season}/${episode}`,
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
