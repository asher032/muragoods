import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/app/lib/access-control';
import {
  firstPartyInventory,
  resolvePlayback,
  statusForDisplay,
} from '@/app/lib/murastream/playback/resolver';
import { FIRST_PARTY_MANIFEST } from '@/app/lib/murastream/playback/authorized-sources';
import { NON_PLAYABLE, REASON_MESSAGE } from '@/app/lib/murastream/playback/types';
import { PLAYBACK_FAILURE_COUNT, recentPlaybackFailures } from '@/app/lib/murastream/playback/log';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// Murastream administration.
//
// Every catalog, resolver and playback-health surface the owner needs, in one
// place, WITHOUT going through the public dashboard and WITHOUT a Discord
// session. This answers the questions the panel actually has to answer:
//   what is registered, what will play, and what failed recently.
// ─────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const guard = await requireStaff(req, ['murastream']);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const tmdbId = url.searchParams.get('tmdbId');
  const mediaType = url.searchParams.get('mediaType') === 'movie' ? 'movie' : 'tv';
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');

  const inventory = firstPartyInventory();
  const sources = FIRST_PARTY_MANIFEST.map((e) => ({
    slug: e.slug,
    tmdbId: e.tmdbId,
    title: e.title,
    mediaType: e.mediaType,
    file: e.file,
    season: e.season ?? null,
    episode: e.episode ?? null,
    url: `/media/${e.slug}/${e.file}`,
  }));

  const payload: Record<string, unknown> = {
    success: true,
    registry: {
      // Empty is the honest default, and it is reported as such rather than
      // as an empty-looking table of nothing.
      titles: inventory.titles,
      episodes: inventory.episodes,
      sources,
      note: inventory.titles === 0
        ? 'No Muragoods-owned media is registered. Until an entry is added to the '
          + 'first-party manifest, every title reports METADATA_AVAILABLE / '
          + '"Playback source unavailable" — which is the honest answer, not a fault.'
        : null,
    },
    reasons: Object.fromEntries(Object.entries(REASON_MESSAGE)),
    nonPlayable: NON_PLAYABLE,
    recentFailures: recentPlaybackFailures(25),
    totalFailures: PLAYBACK_FAILURE_COUNT,
    readOnly: guard.access.level !== 'muragoods_owner',
  };

  // A live resolution, so the panel can answer "will this actually play?"
  // with the resolver's own answer rather than a guess from the catalog.
  if (tmdbId) {
    const id = Number(tmdbId);
    const result = await resolvePlayback({
      mediaType,
      tmdbId: id,
      season: season ? Number(season) : mediaType === 'tv' ? 1 : null,
      episode: episode ? Number(episode) : mediaType === 'tv' ? 1 : null,
    });
    const display = statusForDisplay(result);
    payload.probe = {
      request: { mediaType, tmdbId: id, season: season ? Number(season) : null, episode: episode ? Number(episode) : null },
      status: result.status,
      reason: result.reason,
      message: display.headline || null,
      canPlay: display.canPlay,
      // Sources only on PLAYABLE — never a partially-resolved list.
      sources: result.status === 'PLAYABLE' ? result.sources : [],
      trailers: result.trailers.map((t) => ({ url: t.url, label: t.label, kind: t.kind })),
    };
  }

  return NextResponse.json(payload);
}

/** POST — resolve a title without persisting anything (a dry-run probe). */
export async function POST(req: NextRequest) {
  const guard = await requireStaff(req, ['murastream']);
  if (!guard.ok) return guard.response;

  let body: { mediaType?: string; tmdbId?: number; season?: number | null; episode?: number | null };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const mediaType = body.mediaType === 'movie' ? 'movie' : 'tv';
  const tmdbId = Number(body.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return NextResponse.json({ success: false, error: 'A numeric tmdbId is required', code: 'INVALID_REQUEST' }, { status: 400 });
  }

  const result = await resolvePlayback({
    mediaType,
    tmdbId,
    season: mediaType === 'tv' ? (body.season ?? 1) : null,
    episode: mediaType === 'tv' ? (body.episode ?? 1) : null,
  });
  const display = statusForDisplay(result);
  return NextResponse.json({
    success: true,
    status: result.status,
    reason: result.reason,
    message: display.headline || null,
    canPlay: display.canPlay,
    sources: result.status === 'PLAYABLE' ? result.sources : [],
  });
}
