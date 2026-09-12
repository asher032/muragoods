// Server-side streaming source health check.
// Iframe onError does NOT fire for providers that serve a 200 HTML error page
// ("video not found") — the player just sits there. This endpoint probes each
// provider's embed URL and reports which ones actually return a player page
// for THIS specific title, so the client can skip dead sources and never
// land on an ad-heavy fallback unless the clean ones are truly unavailable.
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

type SourceCheck = { id: string; ok: boolean; status: number };

// Must mirror the SOURCES order in watch/page.tsx (clean 4K first).
const PROVIDERS: {
  id: string;
  url: (type: string, id: number, s: number, e: number) => string;
}[] = [
  { id: 'vidlink', url: (t, id, s, e) => t === 'tv' ? `https://vidlink.pro/tv/${id}/${s}/${e}` : `https://vidlink.pro/movie/${id}` },
  { id: 'videasy', url: (t, id, s, e) => t === 'tv' ? `https://player.videasy.to/tv/${id}/${s}/${e}` : `https://player.videasy.to/movie/${id}` },
  { id: 'vidking', url: (t, id, s, e) => t === 'tv' ? `https://www.vidking.net/embed/tv/${id}/${s}/${e}` : `https://www.vidking.net/embed/movie/${id}` },
  { id: 'vidfast', url: (t, id, s, e) => t === 'tv' ? `https://vidfast.pro/tv/${id}/${s}/${e}` : `https://vidfast.pro/movie/${id}` },
  { id: '111movies', url: (t, id, s, e) => t === 'tv' ? `https://111movies.com/tv/${id}/${s}/${e}` : `https://111movies.com/movie/${id}` },
  { id: '2embed', url: (t, id, s, e) => t === 'tv' ? `https://www.2embed.cc/embed/tv/${id}/${s}/${e}` : `https://www.2embed.cc/embed/movie/${id}` },
  { id: 'multiembed', url: (t, id, s, e) => t === 'tv' ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` : `https://multiembed.mov/?video_id=${id}&tmdb=1` },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const id = Number(searchParams.get('id'));
  const season = Number(searchParams.get('season')) || 1;
  const episode = Number(searchParams.get('episode')) || 1;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  // Probe all providers concurrently; each is bounded to ~5s so the whole
  // check returns well inside the player's patience.
  const results = await Promise.all(
    PROVIDERS.map(async (p): Promise<SourceCheck> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(p.url(type, id, season, episode), {
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'User-Agent': UA },
          cache: 'no-store',
        });
        return { id: p.id, ok: res.ok, status: res.status };
      } catch {
        return { id: p.id, ok: false, status: 0 };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return NextResponse.json(
    { checks: results },
    { headers: { 'Cache-Control': 'public, max-age=300' } } // 5-min edge cache
  );
}
