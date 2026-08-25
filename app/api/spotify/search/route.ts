import { NextRequest, NextResponse } from 'next/server';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials not configured');
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error('Failed to get Spotify token');

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    if (!query) return NextResponse.json({ success: false, error: 'Query required' }, { status: 400 });

    const token = await getSpotifyToken();
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=12`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) throw new Error('Spotify search failed');

    const data = await res.json();
    const tracks = (data.tracks?.items || []).map((track: Record<string, unknown>) => ({
      id: track.id,
      title: track.name,
      artist: (track.artists as Array<{ name: string }>)?.map((a) => a.name).join(', ') || '',
      album: (track.album as { name: string })?.name || '',
      artwork: (track.album as { images: Array<{ url: string }> })?.images?.[0]?.url || '',
      previewUrl: track.preview_url || '',
      spotifyUrl: track.external_urls ? (track.external_urls as { spotify: string }).spotify : '',
      duration: track.duration_ms || 0,
    }));

    return NextResponse.json({ success: true, tracks });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Search failed';
    // If Spotify is not configured, return empty results gracefully
    if (message.includes('credentials not configured')) {
      return NextResponse.json({ success: true, tracks: [], message: 'Spotify not configured. Paste a Spotify link instead.' });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
