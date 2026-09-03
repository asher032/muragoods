// MuraStream — Stream config API (kept for backwards compatibility)
// Returns available sources and embed URLs for a given TMDB ID

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface SourceConfig {
  id: string;
  name: string;
  getEmbedUrl: (type: string, id: number, season?: number, episode?: number) => string;
}

const SOURCES: SourceConfig[] = [
  {
    id: 'vidking',
    name: 'VidKing',
    getEmbedUrl: (type, id, season, episode) => {
      if (type === 'tv' && season && episode) return `https://www.vidking.net/embed/tv/${id}/${season}/${episode}`;
      return `https://www.vidking.net/embed/movie/${id}`;
    },
  },
  {
    id: 'videasy',
    name: 'Videasy',
    getEmbedUrl: (type, id, season, episode) => {
      if (type === 'tv' && season && episode) return `https://player.videasy.to/tv/${id}/${season}/${episode}`;
      return `https://player.videasy.to/movie/${id}`;
    },
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'movie';
  const tmdbId = Number(searchParams.get('tmdbId'));
  const season = searchParams.get('season') ? Number(searchParams.get('season')) : undefined;
  const episode = searchParams.get('episode') ? Number(searchParams.get('episode')) : undefined;

  if (!tmdbId || !Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: 'Invalid tmdbId' }, { status: 400 });
  }

  const sources = SOURCES.map(s => ({
    id: s.id,
    name: s.name,
    url: s.getEmbedUrl(type, tmdbId, season, episode),
  }));

  return NextResponse.json({
    sources,
    first: sources[0] || null,
  });
}
