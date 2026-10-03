// ── Playback source store (dynamic tier) ───────────────────────────────
//
// Persists sources an operator registers through the admin panel or a bulk
// import, so adding authorized content does NOT require editing code or
// redeploying — which was the structural reason the catalog could never grow
// past four entries.
//
// Degradation is deliberate and reported, never hidden:
//   - No database configured  -> static tier only, `store.available: false`
//   - Database unreachable    -> static tier only, `store.available: false`
// Neither is reported as "the registry is empty", because the two mean very
// different things to whoever is debugging it.
//
// Writes are explicit upserts keyed by the address, so re-registering a title
// refreshes it instead of creating a duplicate that could shadow the good one.

import {
  staticSources,
  recordKey,
  validateSourceInput,
  PLAYABLE_RIGHTS,
  type AuthorizedSourceRecord,
  type ProviderSourceType,
  type RightsStatus,
} from './registry';

// NO top-level import of mongoose or the database module.
//
// The resolver imports this file on EVERY playback request, and the registry
// tests import it with no database at all. A static import here made requiring
// this module pull the entire mongoose + cluster stack, so the lookup logic —
// the part that has actually been wrong — could not be exercised without a
// live database. The database is reached lazily, only where it is needed.

export interface StoreStatus {
  available: boolean;
  detail: string;
}

interface StoreModel {
  find: (q: unknown) => { lean: () => Promise<unknown[]> };
  findOne: (q: unknown) => { lean: () => Promise<unknown> };
  findOneAndUpdate: (f: unknown, u: unknown, o: unknown) => { lean: () => Promise<unknown> };
  deleteOne: (q: unknown) => Promise<{ deletedCount: number }>;
}

let modelPromise: Promise<StoreModel> | null = null;

/** Build (and memoize) the Mongoose model on first real use. */
async function model(): Promise<StoreModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [mongooseMod, dbMod] = await Promise.all([
        import('mongoose'),
        import('../../mongodb'),
      ]);
      // Typed as the mongoose module itself; the shape we use below is
      // stable and is declared here rather than through a loose cast.
      const mongoose = ((mongooseMod as { default?: unknown }).default
        ?? mongooseMod) as typeof import('mongoose');
      const dbConnect = (dbMod as { default: () => Promise<unknown> }).default;

      const SourceSchema = new mongoose.Schema({
        tmdbId: { type: Number, required: true, index: true },
        imdbId: { type: String, default: null },
        mediaType: { type: String, required: true, enum: ['movie', 'tv'] },
        season: { type: Number, default: null },
        episode: { type: Number, default: null },
        title: { type: String, required: true },
        sourceType: { type: String, required: true },
        provider: { type: String, required: true },
        playbackUrl: { type: String, required: true },
        mimeType: { type: String, default: 'video/mp4' },
        authorization: { type: String, default: 'first_party' },
        authorizationStatus: { type: String, default: 'pending' },
        enabled: { type: Boolean, default: true },
        expiresAt: { type: Date, default: null },
        notes: { type: String, default: null },
        rightsStatus: { type: String, default: 'UNVERIFIED' },
        licenseType: { type: String, default: null },
        licenseUrl: { type: String, default: null },
        rightsSourceUrl: { type: String, default: null },
        attributionRequired: { type: Boolean, default: false },
        attributionText: { type: String, default: null },
        verifiedAt: { type: Date, default: null },
        verifiedBy: { type: String, default: null },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      });
      // One source per address. This index is what makes "never overwrite a
      // valid source without an explicit replace" enforceable at the database
      // rather than only in application code.
      SourceSchema.index({ mediaType: 1, tmdbId: 1, season: 1, episode: 1 }, { unique: true });

      await dbConnect();
      const M = (mongoose.models.PlaybackSource as unknown) ?? mongoose.model('PlaybackSource', SourceSchema);
      return M as unknown as StoreModel;
    })();
  }
  return modelPromise;
}

/** Drops the memoized model so a fresh connection can be established. */
export function resetStoreForTests(): void {
  modelPromise = null;
}

function toRecord(doc: unknown): AuthorizedSourceRecord {
  const d = doc as Record<string, unknown>;
  return {
    tmdbId: Number(d.tmdbId),
    imdbId: (d.imdbId as string | null) ?? null,
    mediaType: (d.mediaType as 'movie' | 'tv') ?? 'movie',
    season: (d.season as number | null) ?? null,
    episode: (d.episode as number | null) ?? null,
    title: String(d.title ?? ''),
    sourceType: (d.sourceType as ProviderSourceType) ?? 'first_party',
    provider: String(d.provider ?? 'muragoods'),
    playbackUrl: String(d.playbackUrl ?? ''),
    mimeType: String(d.mimeType ?? 'video/mp4'),
    authorization: (d.authorization as 'first_party' | 'licensed') ?? 'first_party',
    authorizationStatus: (d.authorizationStatus as 'verified' | 'pending' | 'unverified') ?? 'pending',
    enabled: d.enabled !== false,
    expiresAt: (d.expiresAt as Date | null) ?? null,
    createdAt: (d.createdAt as Date) ?? new Date(),
    updatedAt: (d.updatedAt as Date) ?? new Date(),
    notes: (d.notes as string | null) ?? null,
    // Rights fields are read EXACTLY as written. An older document with no
    // rights fields reads as UNVERIFIED and therefore does not play — the
    // safe default, not a silent upgrade to "public domain".
    rightsStatus: (d.rightsStatus as RightsStatus) ?? 'UNVERIFIED',
    licenseType: (d.licenseType as string | null) ?? null,
    licenseUrl: (d.licenseUrl as string | null) ?? null,
    rightsSourceUrl: (d.rightsSourceUrl as string | null) ?? null,
    attributionRequired: d.attributionRequired === true,
    attributionText: (d.attributionText as string | null) ?? null,
    verifiedAt: (d.verifiedAt as Date | null) ?? null,
    verifiedBy: (d.verifiedBy as string | null) ?? null,
  };
}

/** Connect and report. Never throws: a missing database is not a crash. */
export async function storeStatus(): Promise<StoreStatus> {
  try {
    await model();
    return { available: true, detail: 'connected' };
  } catch {
    return { available: false, detail: 'no writable database configured — static sources only' };
  }
}

/** Every source, both tiers. Static first so it is never shadowed silently. */
export async function allSources(): Promise<{ records: AuthorizedSourceRecord[]; store: StoreStatus }> {
  try {
    const M = await model();
    const docs = await M.find({}).lean();
    return {
      records: [...staticSources(), ...docs.map((x) => toRecord(x))],
      store: { available: true, detail: 'connected' },
    };
  } catch {
    return {
      records: [...staticSources()],
      store: { available: false, detail: 'no writable database configured — static sources only' },
    };
  }
}

export type UpsertOutcome =
  | { result: 'imported'; record: AuthorizedSourceRecord }
  | { result: 'duplicate'; existing: AuthorizedSourceRecord }
  | { result: 'invalid'; errors: Array<{ field: string; message: string }> }
  | { result: 'store_unavailable'; detail: string };

/**
 * Register or update one source.
 *
 * `replace` decides what happens when the address is already taken:
 *   false (default) -> reported as DUPLICATE and nothing is written, so a bulk
 *                      import can never silently overwrite a working source
 *   true            -> an explicit, audited replacement
 */
export async function upsertSource(
  input: Record<string, unknown>,
  opts: { replace?: boolean } = {},
): Promise<UpsertOutcome> {
  const validated = validateSourceInput(input);
  // `in` narrowing: boolean-literal discrimination needs strictNullChecks,
  // which the playback test harness compiles without.
  if ('errors' in validated) return { result: 'invalid', errors: validated.errors };

  let M: StoreModel;
  try {
    M = await model();
  } catch {
    return { result: 'store_unavailable', detail: 'no writable database configured' };
  }

  const v = validated.value;
  const filter = {
    mediaType: v.mediaType,
    tmdbId: v.tmdbId,
    season: v.season,
    episode: v.episode,
  };

  const existing = await M.findOne(filter).lean();
  if (existing && !opts.replace) {
    return { result: 'duplicate', existing: toRecord(existing) };
  }

  const doc = await M.findOneAndUpdate(
    filter,
    { $set: { ...v, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, new: true },
  ).lean();

  return { result: 'imported', record: toRecord(doc) };
}

// ── Rights audit (admin "Verify Rights") ─────────────────────────────────
//
// The three decisions a curator can make about a source's licence:
//
//   approve        a playable licence was checked against its evidence URL.
//                  Stamps the verifier and re-enables the source. Refused
//                  outright if the record has no evidence to approve, because
//                  "approved" must never be a way to mint rights.
//   reject         the licence was checked and does not permit our use. The
//                  source is disabled so it cannot reach the player.
//   mark_unverified nobody has checked it yet. Held back, but not disabled,
//                  so the distinction from a real rejection survives.
//
// None of these invent a licence. They only change whether a licence that has
// already been *declared* is trusted, and approve refuses to trust a
// declaration with no evidence URL and no licence type behind it.

export type RightsAuditAction = 'approve' | 'reject' | 'mark_unverified';

/**
 * Why a source may not be approved, as a list of specific reasons.
 *
 * Pure and exported so the rule is testable without a database: a playable
 * status with no evidence behind it is exactly the claim this system exists
 * to refuse, and "approved" must never be a way to mint rights.
 */
export function approvalBlockers(record: {
  rightsStatus: RightsStatus;
  rightsSourceUrl: string | null;
  licenseType: string | null;
}): string[] {
  const errors: string[] = [];
  if (!PLAYABLE_RIGHTS.has(record.rightsStatus)) {
    errors.push(`rightsStatus is ${record.rightsStatus}; approve requires a declared playable status (${[...PLAYABLE_RIGHTS].join(', ')})`);
  }
  if (!record.rightsSourceUrl) errors.push('rightsSourceUrl is required before approval');
  if (!record.licenseType) errors.push('licenseType is required before approval');
  return errors;
}

export type RightsAuditOutcome =
  | { result: 'audited'; record: AuthorizedSourceRecord; action: RightsAuditAction }
  | { result: 'invalid'; errors: string[] }
  | { result: 'not_found' }
  | { result: 'static_protected'; key: string }
  | { result: 'store_unavailable' };

export async function auditRights(
  address: { mediaType: 'movie' | 'tv'; tmdbId: number; season?: number | null; episode?: number | null },
  action: RightsAuditAction,
  opts: { verifiedBy?: string | null; note?: string | null } = {},
): Promise<RightsAuditOutcome> {
  const filter = {
    mediaType: address.mediaType,
    tmdbId: address.tmdbId,
    season: address.season ?? null,
    episode: address.episode ?? null,
  };
  const key = recordKey(filter as { mediaType: 'movie' | 'tv'; tmdbId: number });

  // Static sources are rebuilt from the manifest on every read, so a runtime
  // decision about one would be silently discarded and the operator would be
  // shown an approval that does not hold. Say so instead.
  if (staticSources().some((s) => recordKey(s) === key)) return { result: 'static_protected', key };

  let M: StoreModel;
  try {
    M = await model();
  } catch {
    return { result: 'store_unavailable' };
  }

  const existing = await M.findOne(filter).lean();
  if (!existing) return { result: 'not_found' };
  const current = toRecord(existing);

  let set: Record<string, unknown>;

  if (action === 'approve') {
    const errors = approvalBlockers(current);
    if (errors.length) return { result: 'invalid', errors };

    set = {
      enabled: true,
      verifiedAt: new Date(),
      verifiedBy: opts.verifiedBy ?? 'admin rights audit',
    };
  } else if (action === 'reject') {
    // The declared licence is kept, not erased: it is a record of what was
    // claimed and found wanting. What changes is that it is not trusted and
    // cannot reach the player.
    set = {
      rightsStatus: 'UNVERIFIED' satisfies RightsStatus,
      enabled: false,
      verifiedAt: new Date(),
      verifiedBy: opts.verifiedBy ?? 'admin rights audit',
    };
  } else {
    set = {
      rightsStatus: 'UNVERIFIED' satisfies RightsStatus,
      verifiedAt: new Date(),
      verifiedBy: opts.verifiedBy ?? 'admin rights audit',
    };
  }

  if (opts.note) set.notes = opts.note;

  const doc = await M.findOneAndUpdate(filter, { $set: set }, { new: true }).lean();
  return { result: 'audited', record: toRecord(doc), action };
}

/** Static sources are committed code and are never deletable. */
export async function removeSource(address: {
  mediaType: 'movie' | 'tv'; tmdbId: number; season?: number | null; episode?: number | null;
}): Promise<
  | { result: 'deleted'; key: string }
  | { result: 'not_found' }
  | { result: 'static_protected'; key: string }
  | { result: 'store_unavailable' }
> {
  const key = recordKey({
    mediaType: address.mediaType,
    tmdbId: address.tmdbId,
    season: address.season ?? null,
    episode: address.episode ?? null,
  });
  if (staticSources().some((s) => recordKey(s) === key)) return { result: 'static_protected', key };

  let M: StoreModel;
  try {
    M = await model();
  } catch {
    return { result: 'store_unavailable' };
  }
  const res = await M.deleteOne({
    mediaType: address.mediaType,
    tmdbId: address.tmdbId,
    season: address.season ?? null,
    episode: address.episode ?? null,
  });
  return res.deletedCount ? { result: 'deleted', key } : { result: 'not_found' };
}