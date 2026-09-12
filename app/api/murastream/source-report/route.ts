// Source report API — users flag broken or ad-heavy providers per title.
// GET  /api/murastream/source-report?type=movie&id=969681
//   → aggregated health: provider → { broken, ads, trust score 0-1 }
// POST { mediaType, tmdbId, provider, issue, season?, episode? }
//   → records a report (deduped: one per user/provider/title/issue/hour)
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import SourceReport from '@/app/lib/models/SourceReport';

export const maxDuration = 15;

const VALID_PROVIDERS = new Set(['vidlink', 'videasy', 'vidking', 'vidfast', '111movies', '2embed', 'multiembed']);

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
    const id = Number(searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // last 14 days
    const reports = await SourceReport.find({
      mediaType: type,
      tmdbId: id,
      createdAt: { $gte: since },
    })
      .select('provider issue -_id')
      .lean();

    const agg: Record<string, { broken: number; ads: number }> = {};
    for (const r of reports as { provider: string; issue: string }[]) {
      if (!agg[r.provider]) agg[r.provider] = { broken: 0, ads: 0 };
      if (r.issue === 'broken') agg[r.provider].broken += 1;
      else if (r.issue === 'ads') agg[r.provider].ads += 1;
    }

    // Trust score: start at 1, each report in the window dents it.
    const trust: Record<string, { broken: number; ads: number; score: number }> = {};
    for (const [provider, { broken, ads }] of Object.entries(agg)) {
      trust[provider] = {
        broken,
        ads,
        score: Math.max(0, 1 - broken * 0.34 - ads * 0.2), // 3 broken or 5 ads reports → 0
      };
    }

    return NextResponse.json({ trust }, { headers: { 'Cache-Control': 'public, max-age=120' } });
  } catch (error) {
    console.error('[SourceReport GET]', error);
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();
    const { mediaType, tmdbId, provider, issue, season, episode, email } = body as {
      mediaType?: string; tmdbId?: number; provider?: string; issue?: string;
      season?: number; episode?: number; email?: string;
    };

    if (!['movie', 'tv'].includes(mediaType || '') || !tmdbId || !provider || !['broken', 'ads'].includes(issue || '')) {
      return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
    }
    if (!VALID_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    }

    // Light dedupe: same user/provider/title/issue within the last hour counts once.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const dupe = await SourceReport.findOne({
      mediaType, tmdbId, provider, issue,
      email: email || null,
      createdAt: { $gte: oneHourAgo },
    }).lean();
    if (dupe) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    await SourceReport.create({
      mediaType,
      tmdbId,
      provider,
      issue,
      season: season ?? null,
      episode: episode ?? null,
      email: email || null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[SourceReport POST]', error);
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
  }
}
