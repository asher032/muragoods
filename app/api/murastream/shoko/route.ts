// ShokoServer API Proxy — connects MuraStream to local ShokoServer
// ShokoServer runs on localhost:8111 and provides anime metadata from AniList/MAL
import { NextRequest, NextResponse } from 'next/server';

const SHOKO_BASE = process.env.SHOKO_API_URL || 'http://localhost:8111';

async function shokoFetch(path: string) {
  const res = await fetch(`${SHOKO_BASE}${path}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`ShokoServer ${res.status}`);
  return res.json();
}

// GET /api/murastream/shoko?action=series&id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const id = searchParams.get('id');

  try {
    switch (action) {
      case 'status': {
        const status = await shokoFetch('/api/v3/Init/Status');
        return NextResponse.json(status);
      }

      case 'series': {
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        const series = await shokoFetch(`/api/v3/Series/${id}`);
        return NextResponse.json(series);
      }

      case 'series-list': {
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const series = await shokoFetch(`/api/v3/Series?page=${page}&limit=${limit}`);
        return NextResponse.json(series);
      }

      case 'episode': {
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        const episode = await shokoFetch(`/api/v3/Episode/${id}`);
        return NextResponse.json(episode);
      }

      case 'search': {
        const query = searchParams.get('q');
        if (!query) return NextResponse.json({ error: 'Missing q' }, { status: 400 });
        const results = await shokoFetch(`/api/v3/Series/Search?q=${encodeURIComponent(query)}`);
        return NextResponse.json(results);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[ShokoServer API]', error);
    return NextResponse.json(
      { error: 'ShokoServer unavailable', details: String(error) },
      { status: 502 }
    );
  }
}
