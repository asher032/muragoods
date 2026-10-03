import { NextResponse } from 'next/server';
import { requireStaff } from '@/app/lib/access-control';
import { allSources, upsertSource, removeSource, storeStatus, auditRights, type RightsAuditAction } from '@/app/lib/murastream/playback/store';
import { STATIC_SOURCES, recordKey, usableSourceStatus, type ProviderSourceType, type RightsStatus } from '@/app/lib/murastream/playback/registry';
import { allAdapters } from '@/app/lib/murastream/playback/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Staff-only source management.
//
//   GET    ?tmdbId=&mediaType=&season=&episode=   list / inspect
//   POST   { ...source }                          register one
//   PATCH  { audit, verifiedBy, note }            rights audit decision
//   DELETE ?tmdbId=&mediaType=&season=&episode=   remove one
//
// Provider credentials are never accepted, stored or echoed here. A source is
// an address plus an asset reference; the provider adapter holds the secret.

const noStore = { 'Cache-Control': 'no-store' } as const;

/**
 * The shape the admin panel consumes.
 *
 * Deliberately a whitelist rather than a spread: provider credentials are
 * read from the environment by the adapter and never live on a record, but a
 * whitelist means a future field cannot leak by being added carelessly.
 */
type PublicSource = ReturnType<typeof publicView>;

function publicView(r: {
  tmdbId: number; imdbId?: string | null; mediaType: 'movie' | 'tv';
  season?: number | null; episode?: number | null; title: string;
  sourceType: ProviderSourceType; provider: string; mimeType: string;
  authorization: 'first_party' | 'licensed';
  authorizationStatus: 'verified' | 'pending' | 'unverified';
  enabled: boolean; expiresAt: Date | null; updatedAt: Date;
  playbackUrl: string; createdAt: Date;
  rightsStatus: RightsStatus; licenseType: string | null; licenseUrl: string | null;
  rightsSourceUrl: string | null; attributionRequired: boolean;
  attributionText: string | null; verifiedAt: Date | null; verifiedBy: string | null;
}) {
  return {
    key: recordKey(r),
    tmdbId: r.tmdbId,
    imdbId: r.imdbId ?? null,
    mediaType: r.mediaType,
    season: r.season ?? null,
    episode: r.episode ?? null,
    title: r.title,
    sourceType: r.sourceType,
    provider: r.provider,
    mimeType: r.mimeType,
    authorization: r.authorization,
    authorizationStatus: r.authorizationStatus,
    enabled: r.enabled !== false,
    expiresAt: r.expiresAt ?? null,
    rightsStatus: r.rightsStatus,
    licenseType: r.licenseType,
    licenseUrl: r.licenseUrl,
    rightsSourceUrl: r.rightsSourceUrl,
    attributionRequired: r.attributionRequired,
    attributionText: r.attributionText,
    verifiedAt: r.verifiedAt,
    verifiedBy: r.verifiedBy,
    status: usableSourceStatus(r),
    tier: (STATIC_SOURCES as unknown[]).includes(r) ? 'static' : 'dynamic',
    updatedAt: r.updatedAt ?? null,
  };
}

export async function GET(req: Request) {
  const guard = await requireStaff(req, ['murastream']);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const { records, store } = await allSources();
  const tmdbId = url.searchParams.get('tmdbId');

  const providers = [];
  for (const adapter of allAdapters()) {
    // healthCheck returns a STATE and a redacted detail — never a credential.
    providers.push(await adapter.healthCheck());
  }

  const filtered = tmdbId ? records.filter((r) => String(r.tmdbId) === tmdbId) : records;

  return NextResponse.json({
    success: true,
    store,
    // "The store is down" and "the store is empty" are different facts and
    // are reported separately, so an operator is never misled into deleting
    // a registry that merely could not be read.
    counts: {
      total: records.length,
      static: STATIC_SOURCES.length,
      dynamic: records.length - STATIC_SOURCES.length,
      enabled: records.filter((r) => usableSourceStatus(r) === 'REGISTERED').length,
      disabled: records.filter((r) => !r.enabled).length,
      expired: records.filter((r) => r.expiresAt !== null && r.expiresAt.getTime() <= Date.now()).length,
    },
    providers,
    sources: filtered.map(publicView),
  }, { headers: noStore });
}

export async function POST(req: Request) {
  const guard = await requireStaff(req, ['murastream']);
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400, headers: noStore });
  }

  // Replacement must be asked for explicitly, so a re-register can never
  // silently overwrite a working source.
  const replace = body.replace === true || body.replace === 'true';
  const outcome = await upsertSource(body, { replace });

  if (outcome.result === 'invalid') {
    return NextResponse.json({ success: false, error: 'Validation failed', errors: outcome.errors }, { status: 400, headers: noStore });
  }
  if (outcome.result === 'store_unavailable') {
    return NextResponse.json({ success: false, error: outcome.detail }, { status: 503, headers: noStore });
  }
  if (outcome.result === 'duplicate') {
    return NextResponse.json({
      success: false,
      error: 'A source is already registered for this title/episode. Send replace:true to overwrite it.',
      duplicate: publicView(outcome.existing),
    }, { status: 409, headers: noStore });
  }

  // A registration is a claim, not proof. The operator is told immediately
  // whether it actually plays, rather than discovering it on the watch page.
  const probe = await probeSource(outcome.record);
  return NextResponse.json({ success: true, source: publicView(outcome.record), probe }, { status: 201, headers: noStore });
}

/** Validate a freshly registered source the same way playback will. */
async function probeSource(record: unknown) {
  try {
    const { adapterFor } = await import('@/app/lib/murastream/playback/providers');
    const { validateSource } = await import('@/app/lib/murastream/playback/validate');
    const r = record as {
      tmdbId: number; mediaType: 'movie' | 'tv'; season: number | null; episode: number | null;
      title: string; sourceType: never; provider: string; playbackUrl: string; mimeType: string;
      authorization: 'first_party' | 'licensed';
    };
    const resolved = await adapterFor(r.sourceType).getSource(r as never);
    if (!resolved) return { ok: false, reason: 'PROVIDER_NOT_CONFIGURED', detail: 'the provider for this source type is not configured in this deployment' };
    const check = await validateSource({
      provider: r.provider,
      authorization: resolved.authorization,
      kind: resolved.kind,
      mediaType: r.mediaType,
      url: resolved.url,
      container: resolved.container,
      tmdbId: r.tmdbId,
      season: r.season,
      episode: r.episode,
      label: resolved.label,
      durationSec: null,
    }, null);
    return check.ok
      ? { ok: true, httpStatus: check.httpStatus, contentType: check.contentType }
      : { ok: false, reason: check.reason, httpStatus: check.httpStatus };
  } catch {
    return { ok: false, reason: 'RESOLVER_ERROR', detail: 'probe failed' };
  }
}

// ── Rights audit ─────────────────────────────────────────────────────────
//
// The "Verify Rights" action. Three decisions, and none of them can conjure a
// licence: `approve` only trusts a licence that is already declared together
// with its evidence URL, and it refuses outright when either is missing.

const AUDIT_ACTIONS: readonly RightsAuditAction[] = ['approve', 'reject', 'mark_unverified'];

export async function PATCH(req: Request) {
  const guard = await requireStaff(req, ['murastream']);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const tmdbId = Number(url.searchParams.get('tmdbId') || 0);
  const mediaType = url.searchParams.get('mediaType') === 'movie' ? 'movie' : 'tv';
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return NextResponse.json({ success: false, error: 'tmdbId required' }, { status: 400, headers: noStore });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400, headers: noStore });
  }

  const audit = body.audit;
  if (typeof audit !== 'string' || !AUDIT_ACTIONS.includes(audit as RightsAuditAction)) {
    return NextResponse.json({
      success: false,
      error: `audit must be one of: ${AUDIT_ACTIONS.join(', ')}`,
    }, { status: 400, headers: noStore });
  }

  const seasonParam = url.searchParams.get('season');
  const episodeParam = url.searchParams.get('episode');
  const outcome = await auditRights(
    { mediaType, tmdbId, season: seasonParam === null ? null : Number(seasonParam), episode: episodeParam === null ? null : Number(episodeParam) },
    audit as RightsAuditAction,
    {
      verifiedBy: typeof body.verifiedBy === 'string' ? body.verifiedBy.slice(0, 120) : null,
      note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    },
  );

  if (outcome.result === 'invalid') {
    return NextResponse.json({ success: false, error: 'Approval refused', errors: outcome.errors }, { status: 400, headers: noStore });
  }
  if (outcome.result === 'not_found') {
    return NextResponse.json({ success: false, error: 'No such source in the registry' }, { status: 404, headers: noStore });
  }
  if (outcome.result === 'static_protected') {
    return NextResponse.json({
      success: false,
      error: 'This source is defined in the committed manifest. Edit its rights evidence in FIRST_PARTY_MANIFEST / RIGHTS_EVIDENCE and redeploy, so the decision is reviewable in code.',
    }, { status: 409, headers: noStore });
  }
  if (outcome.result === 'store_unavailable') {
    return NextResponse.json({ success: false, error: (await storeStatus()).detail }, { status: 503, headers: noStore });
  }

  return NextResponse.json({
    success: true,
    action: outcome.action,
    source: publicView(outcome.record),
  }, { headers: noStore });
}

export async function DELETE(req: Request) {
  const guard = await requireStaff(req, ['murastream']);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const tmdbId = Number(url.searchParams.get('tmdbId') || 0);
  const mediaType = url.searchParams.get('mediaType') === 'movie' ? 'movie' : 'tv';
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return NextResponse.json({ success: false, error: 'tmdbId required' }, { status: 400, headers: noStore });
  }
  const seasonParam = url.searchParams.get('season');
  const episodeParam = url.searchParams.get('episode');

  const outcome = await removeSource({
    mediaType,
    tmdbId,
    season: seasonParam === null ? null : Number(seasonParam),
    episode: episodeParam === null ? null : Number(episodeParam),
  });

  if (outcome.result === 'static_protected') {
    return NextResponse.json({ success: false, error: 'This source is committed to the repository and cannot be deleted here.' }, { status: 409, headers: noStore });
  }
  if (outcome.result === 'store_unavailable') {
    return NextResponse.json({ success: false, error: (await storeStatus()).detail }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ success: outcome.result === 'deleted', key: 'key' in outcome ? outcome.key : null, result: outcome.result }, { headers: noStore });
}