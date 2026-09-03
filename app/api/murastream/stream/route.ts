// MuraStream — Stream Resolution API
// Resolves TMDB IDs to actual m3u8/mp4 stream URLs via VidRock
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { resolveVidRock } from '@/app/lib/murastream/stream-sources';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = Number(searchParams.get('tmdbId'));
  const mediaType = (searchParams.get('type') || 'movie') as 'movie' | 'tv';
  const season = searchParams.get('season') ? Number(searchParams.get('season')) : undefined;
  const episode = searchParams.get('episode') ? Number(searchParams.get('episode')) : undefined;

  console.log(`[Stream API] Request: tmdbId=${tmdbId} type=${mediaType} season=${season} episode=${episode}`);

  if (!tmdbId || !Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: 'Invalid tmdbId' }, { status: 400 });
  }

  try {
    const sources = await resolveVidRock(tmdbId, mediaType, season, episode);
    console.log(`[Stream API] Resolved ${sources.length} sources`);
    return NextResponse.json({
      sources,
      first: sources.find(s => !!s.uri) || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Stream API] Error:', msg);
    return NextResponse.json({ error: 'Failed to resolve streams', detail: msg }, { status: 500 });
  }
}
