// MuraStream — Stream Resolution API
// Returns actual m3u8/mp4 stream URLs resolved server-side
import { NextRequest, NextResponse } from 'next/server';
import { listAllSources, type StreamRequest } from '@/app/lib/murastream/stream-sources';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = Number(searchParams.get('tmdbId'));
  const mediaType = (searchParams.get('type') || 'movie') as 'movie' | 'tv';
  const season = searchParams.get('season') ? Number(searchParams.get('season')) : undefined;
  const episode = searchParams.get('episode') ? Number(searchParams.get('episode')) : undefined;
  const title = searchParams.get('title') || '';
  const year = searchParams.get('year') || '';

  if (!tmdbId || !Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: 'Invalid tmdbId' }, { status: 400 });
  }

  const req: StreamRequest = {
    tmdbId,
    mediaType,
    season: mediaType === 'tv' ? (season || 1) : undefined,
    episode: mediaType === 'tv' ? (episode || 1) : undefined,
    title,
    year,
  };

  try {
    const sources = await listAllSources(req);
    return NextResponse.json({
      sources,
      first: sources.find(s => !!s.uri) || null,
    });
  } catch (error) {
    console.error('Stream resolution error:', error);
    return NextResponse.json({ error: 'Failed to resolve streams' }, { status: 500 });
  }
}
