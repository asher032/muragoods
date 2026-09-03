// MuraStream — Streaming Config API
// Returns streaming source URLs with API keys (server-side only)
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'movie';
  const id = searchParams.get('id');
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');
  const source = searchParams.get('source') || 'nexstream';

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const nexstreamKey = process.env.NEXTSTREAM_API_KEY || '';

  const sources: Record<string, { id: string; label: string; url: string }> = {};

  if (nexstreamKey) {
    sources.nexstream = {
      id: 'nexstream',
      label: 'NexStream',
      url: type === 'movie'
        ? `https://api.codespecters.com/embed/movie/${id}?apikey=${nexstreamKey}`
        : `https://api.codespecters.com/embed/tv/${id}/${season || 1}/${episode || 1}?apikey=${nexstreamKey}`,
    };
  }

  sources.videasy = {
    id: 'videasy',
    label: 'Videasy',
    url: type === 'movie'
      ? `https://player.videasy.to/movie/${id}?overlay=true`
      : `https://player.videasy.to/tv/${id}/${season || 1}/${episode || 1}?overlay=true`,
  };

  sources.vidsrc = {
    id: 'vidsrc',
    label: 'VidSrc',
    url: type === 'movie'
      ? `https://vsembed.su/embed/movie/${id}`
      : `https://vsembed.su/embed/tv/${id}/${season || 1}/${episode || 1}`,
  };

  sources.vidking = {
    id: 'vidking',
    label: 'Vidking',
    url: type === 'movie'
      ? `https://www.vidking.net/embed/movie/${id}?autoPlay=true`
      : `https://www.vidking.net/embed/tv/${id}/${season || 1}/${episode || 1}?autoPlay=true`,
  };

  const activeSource = sources[source] || sources.nexstream || sources.videasy;

  return NextResponse.json({
    sources,
    active: activeSource,
    defaultSource: nexstreamKey ? 'nexstream' : 'videasy',
  });
}
