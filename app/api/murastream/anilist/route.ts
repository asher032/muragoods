// Server-side anime API — proxies AniList + Jikan, keeps client clean
import { NextRequest, NextResponse } from 'next/server';
import { searchAnime, getTopAnimeList, getSeasonalAnimeList, getAnimeByGenreList, getAnimeDetails } from '@/app/murastream/api/anime';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const q = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const genre = searchParams.get('genre') || '';
  const id = parseInt(searchParams.get('id') || '0', 10);

  try {
    switch (action) {
      case 'search': {
        if (!q.trim()) {
          return NextResponse.json({ results: [], pageInfo: { hasNextPage: false } });
        }
        const result = await searchAnime(q.trim(), page);
        return NextResponse.json(result);
      }

      case 'top': {
        const results = await getTopAnimeList(page);
        return NextResponse.json({ results });
      }

      case 'seasonal': {
        const results = await getSeasonalAnimeList();
        return NextResponse.json({ results });
      }

      case 'genre': {
        if (!genre) {
          return NextResponse.json({ results: [] });
        }
        const results = await getAnimeByGenreList(genre, page);
        return NextResponse.json({ results });
      }

      case 'details': {
        if (!id) {
          return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }
        const result = await getAnimeDetails(id);
        if (!result) {
          return NextResponse.json({ error: 'Anime not found' }, { status: 404 });
        }
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[AniList API]', error);
    return NextResponse.json(
      { error: 'Anime service temporarily unavailable', details: String(error) },
      { status: 502 }
    );
  }
}
