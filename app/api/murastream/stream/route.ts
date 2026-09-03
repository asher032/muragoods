// MuraStream — Stream Resolution API
// Resolves TMDB IDs to actual m3u8/mp4 stream URLs via VidRock
import { NextRequest, NextResponse } from 'next/server';
import { resolveVidRock } from '@/app/lib/murastream/stream-sources';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = Number(searchParams.get('tmdbId'));
  const mediaType = (searchParams.get('type') || 'movie') as 'movie' | 'tv';
  const season = searchParams.get('season') ? Number(searchParams.get('season')) : undefined;
  const episode = searchParams.get('episode') ? Number(searchParams.get('episode')) : undefined;

  if (!tmdbId || !Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: 'Invalid tmdbId' }, { status: 400 });
  }

  try {
    const sources = await resolveVidRock(tmdbId, mediaType, season, episode);
    return NextResponse.json({
      sources,
      first: sources.find(s => !!s.uri) || null,
    });
  } catch (error) {
    console.error('Stream resolution error:', error);
    return NextResponse.json({ error: 'Failed to resolve streams' }, { status: 500 });
  }
}
