import { NextResponse } from 'next/server';
import { staticSources, usableSourceStatus, PLAYABLE_RIGHTS, type RightsStatus } from '@/app/lib/murastream/playback/registry';
import { allSources } from '@/app/lib/murastream/playback/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Public, read-only view of everything Muragoods can legally stream.
//
// This is the "Free / Legal" filter's data source. It reports the licence of
// each registered source and whether it can actually be played right now —
// so a title is only ever listed here as playable when the rights gate allows
// it. A registered-but-unverified source is listed as unverified, NOT hidden
// and NOT presented as free.
//
// TMDB is metadata only. Nothing here treats a title existing on TMDB as
// evidence that Muragoods may stream it.

/** The four categories the UI offers, in the order it offers them. */
const CATEGORY_ORDER: Array<{ key: string; label: string; statuses: RightsStatus[] }> = [
  { key: 'PUBLIC_DOMAIN', label: 'Public Domain', statuses: ['PUBLIC_DOMAIN'] },
  { key: 'CREATIVE_COMMONS', label: 'Creative Commons', statuses: ['CC_BY', 'CC_BY_SA'] },
  { key: 'MURAGOODS_LICENSED', label: 'Muragoods Licensed', statuses: ['LICENSED'] },
  { key: 'MURAGOODS_OWNED', label: 'Muragoods Owned', statuses: ['MURAGOODS_OWNED'] },
];

function categoryFor(status: RightsStatus): string | null {
  return CATEGORY_ORDER.find((c) => c.statuses.includes(status))?.key ?? null;
}

export async function GET() {
  let records = staticSources();
  let storeAvailable = true;
  try {
    const dynamic = await allSources();
    storeAvailable = dynamic.store.available;
    records = [...staticSources(), ...dynamic.records];
  } catch {
    storeAvailable = false;
  }

  const now = Date.now();

  const items = records.map((r) => {
    const status = usableSourceStatus(r, now);
    const playable = status === 'REGISTERED' && PLAYABLE_RIGHTS.has(r.rightsStatus);
    return {
      key: `${r.mediaType}:${r.tmdbId}:${r.season ?? '-'}:${r.episode ?? '-'}`,
      title: r.title,
      mediaType: r.mediaType,
      tmdbId: r.tmdbId,
      season: r.mediaType === 'tv' ? r.season : null,
      episode: r.mediaType === 'tv' ? r.episode : null,
      provider: r.provider,
      // The licence, in full. This is the point of the page: a viewer can see
      // exactly why a title is here.
      rightsStatus: r.rightsStatus,
      licenseType: r.licenseType,
      licenseUrl: r.licenseUrl,
      rightsSourceUrl: r.rightsSourceUrl,
      attributionRequired: r.attributionRequired,
      attributionText: r.attributionText,
      category: categoryFor(r.rightsStatus),
      playable,
      // An honest reason rather than a bare boolean.
      note: playable
        ? null
        : r.rightsStatus === 'UNVERIFIED'
          ? 'Held back: we have not verified our rights to this title yet.'
          : `Unavailable (${status}).`,
    };
  });

  const counts: Record<string, number> = {};
  for (const c of CATEGORY_ORDER) counts[c.key] = 0;
  for (const i of items) if (i.category) counts[i.category] += 1;

  return NextResponse.json({
    categories: CATEGORY_ORDER.map((c) => ({
      key: c.key,
      label: c.label,
      count: counts[c.key] ?? 0,
    })),
    items,
    storeAvailable,
    total: items.length,
    playableCount: items.filter((i) => i.playable).length,
  }, { headers: { 'Cache-Control': 'no-store' } });
}