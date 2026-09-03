// MuraStream — Stream Proxy API
// Proxies VidRock responses to avoid CORS issues
// Decryption happens client-side for reliability
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

const VIDROCK_MAIN = 'https://vidrock.net';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = Number(searchParams.get('tmdbId'));
  const mediaType = (searchParams.get('type') || 'movie') as 'movie' | 'tv';
  const season = searchParams.get('season') ? Number(searchParams.get('season')) : undefined;
  const episode = searchParams.get('episode') ? Number(searchParams.get('episode')) : undefined;

  console.log(`[Stream Proxy] tmdbId=${tmdbId} type=${mediaType}`);

  if (!tmdbId || !Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: 'Invalid tmdbId' }, { status: 400 });
  }

  const isTv = mediaType === 'tv' && season != null && episode != null;
  const apiUrl = isTv
    ? `${VIDROCK_MAIN}/api/tv/${tmdbId}/${season}/${episode}`
    : `${VIDROCK_MAIN}/api/movie/${tmdbId}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': `${VIDROCK_MAIN}/`,
        'Origin': VIDROCK_MAIN,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ error: `VidRock HTTP ${res.status}`, encrypted: {} });
    }

    const body = await res.json();
    return NextResponse.json({
      encrypted: body,
      source: 'vidrock',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Stream Proxy] Error:', msg);
    return NextResponse.json({ error: msg, encrypted: {} }, { status: 500 });
  }
}
// v1788451773
