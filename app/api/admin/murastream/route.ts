import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/app/lib/access-control';
import {
  firstPartyInventory,
  resolvePlayback,
  statusForDisplay,
} from '@/app/lib/murastream/playback/resolver';
import { FIRST_PARTY_MANIFEST, FIRST_PARTY_ATTRIBUTION } from '@/app/lib/murastream/playback/authorized-sources';
import { isRetryable } from '@/app/lib/murastream/playback/types';
import { normalizeMediaForPlayback } from '@/app/lib/murastream/playback/normalize';
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
  const normalizedType = normalizeMediaForPlayback(url.searchParams.get('mediaType'));
  const mediaType: 'movie' | 'tv' = !('reason' in normalizedType) && normalizedType.mediaType === 'movie' ? 'movie' : 'tv';
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
    // `file` is already the path under public/media and may contain its own
    // subdirectory. Prefixing the slug again built `/media/betty-boop/
    // betty-boop/s01e01-….mp4`, a path that does not exist — so the admin
    // panel reported a 404 for every registered title it was meant to prove
    // healthy.
    url: `/media/${e.file}`,
  }));

  const payload: Record<string, unknown> = {
    success: true,
    registry: {
      // Empty is the honest default, and it is reported as such rather than
      // as an empty-looking table of nothing.
      titles: inventory.titles,
      episodes: inventory.episodes,
      sources,
      // Why each registered title is distributable. An operator auditing
      // "is this actually licensed" should not have to take the manifest's
      // word for it.
      attribution: FIRST_PARTY_ATTRIBUTION,
      note: inventory.titles === 0
        ? 'No Muragoods-owned media is registered. Until an entry is added to the '
          + 'first-party manifest, every title reports METADATA_AVAILABLE / '
          + 'SOURCE_NOT_FOUND — which is the honest answer, not a fault.'
        : null,
    },
    reasons: Object.fromEntries(Object.entries(REASON_MESSAGE)),
    retryableReasons: Object.fromEntries(
      Object.keys(REASON_MESSAGE).map((k) => [k, isRetryable(k as never)]),
    ),
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
      // Whether a retry could change the answer. An operator triaging
      // "why is this title not playing" needs to know whether to wait.
      retryable: isRetryable(result.reason),
      message: display.headline || null,
      canPlay: display.canPlay,
      // Per-provider diagnostics: which step was tried and how it failed.
      // Server-only detail, surfaced here because this route is staff-gated.
      diagnostics: result.diagnostics ?? null,
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
