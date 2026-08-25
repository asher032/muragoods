import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    if (!query) return NextResponse.json({ success: false, error: 'Query required' }, { status: 400 });

    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=12`
    );

    if (!res.ok) return NextResponse.json({ success: true, tracks: [] });

    const data = await res.json();
    const tracks = (data.data || []).map((track: Record<string, unknown>) => ({
      id: String(track.id),
      title: track.title || '',
      artist: (track.artist as { name: string })?.name || '',
      album: (track.album as { title: string })?.title || '',
      artwork: (track.album as { cover_xl: string })?.cover_xl || (track.album as { cover_big: string })?.cover_big || (track.album as { cover_medium: string })?.cover_medium || '',
      previewUrl: track.preview || '',
      spotifyUrl: '',
      deezerUrl: track.link || '',
      duration: track.duration || 0,
    }));

    return NextResponse.json({ success: true, tracks });
  } catch {
    return NextResponse.json({ success: true, tracks: [] });
  }
}
