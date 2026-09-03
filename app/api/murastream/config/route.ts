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

  const nexstreamKey = process.env.NEXTSTREAM_API_KEY || '';

  // Sources that validate their page URL must use direct embed URLs.
  // NexStream checks the URL pattern inside JS — routing through proxy breaks it.
  const sources: Record<string, { id: string; label: string; url: string }> = {
    vidsrc: {
      id: 'vidsrc',
      label: 'VidSrc',
      url: type === 'movie'
        ? `https://vidsrc.to/embed/movie/${id}`
        : `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`,
    },
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
    ...(nexstreamKey ? {
      nexstream: {
        id: 'nexstream',
        label: 'NexStream',
        url: type === 'movie'
          ? `https://api.codespecters.com/embed/movie/${id}?apikey=${nexstreamKey}`
          : `https://api.codespecters.com/embed/tv/${id}/${season}/${episode}?apikey=${nexstreamKey}`,
      },
    } : {}),
  };

  // Default to first available source
  const defaultKey = sources.nexstream ? 'nexstream' : 'vidsrc';
  const activeSource = sources[defaultKey] || Object.values(sources)[0];

  return NextResponse.json({
    sources,
    active: activeSource,
    defaultSource: defaultKey,
  });
}
