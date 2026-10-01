// ── Murastream playback contract ────────────────────────────────────────
//
// Types shared by the resolver, the API route and the player. The point of
// putting them here is that a status can never be invented at the call site:
// the resolver returns one of these, the API passes it through, and the UI
// renders one of the messages in REASON_MESSAGE.

/**
 * Catalog availability and playback availability are DIFFERENT questions.
 *
 * TMDB having a title says nothing about whether Murastream is licensed to
 * play it, so the two are never collapsed:
 *
 *   METADATA_AVAILABLE  the catalog knows this title; no authorized source yet
 *   SOURCE_AVAILABLE    an authorized source exists, not yet validated
 *   PLAYABLE            validated and safe to hand to the player
 *   TEMPORARILY_FAILED  the source failed but may recover; retried later
 *   UNAVAILABLE         no authorized playable source exists
 *
 * The UI must never show "Watch Now" on anything but PLAYABLE.
 */
export type PlaybackStatus =
  | 'METADATA_AVAILABLE'
  | 'SOURCE_AVAILABLE'
  | 'PLAYABLE'
  | 'TEMPORARILY_FAILED'
  | 'UNAVAILABLE';

/** Machine-readable cause. Every non-PLAYABLE outcome has one. */
export type PlaybackReason =
  | 'SOURCE_404'
  | 'SOURCE_INVALID'
  | 'PROVIDER_TIMEOUT'
  | 'EPISODE_NOT_RESOLVED'
  | 'SEASON_NOT_RESOLVED'
  | 'REGION_BLOCKED'
  | 'SOURCE_NOT_AUTHORIZED'
  | 'PLAYBACK_SERVICE_UNAVAILABLE'
  | 'INVALID_REQUEST';

export const PLAYBACK_REASONS: readonly PlaybackReason[] = [
  'SOURCE_404',
  'SOURCE_INVALID',
  'PROVIDER_TIMEOUT',
  'EPISODE_NOT_RESOLVED',
  'SEASON_NOT_RESOLVED',
  'REGION_BLOCKED',
  'SOURCE_NOT_AUTHORIZED',
  'PLAYBACK_SERVICE_UNAVAILABLE',
  'INVALID_REQUEST',
];

/**
 * What a source actually is. A trailer is never presented as full playback —
 * that distinction is the whole point of the enum.
 */
export type SourceKind = 'FULL_PLAYBACK' | 'TRAILER' | 'PREVIEW';

/**
 * Only two authorization classes exist, and both are authorized by
 * construction:
 *
 *   first_party  media Muragoods owns or is licensed to distribute, served
 *                from our own origin. No third party can inject anything into
 *                it, which is what makes "no ads" a structural guarantee
 *                rather than a promise about someone else's page.
 *   licensed     an official preview published through a licensed API (TMDB
 *                video records). Offered as TRAILER/PREVIEW only.
 *
 * There is deliberately no "aggregator" or "embed" class. The old provider
 * list could not be expressed in this type at all, which is why no ad
 * stripping is needed anywhere: nothing that injects ads can reach the player.
 */
export type AuthorizationClass = 'first_party' | 'licensed';

export interface PlaybackSource {
  provider: string;
  authorization: AuthorizationClass;
  kind: SourceKind;
  mediaType: 'movie' | 'tv';
  /** Direct media URL. Always same-origin for first_party. */
  url: string;
  container: 'mp4' | 'hls' | 'youtube';
  tmdbId: number;
  /** Present for tv sources only. */
  season?: number | null;
  episode?: number | null;
  /** Shown in the UI so a trailer is never mistaken for an episode. */
  label: string;
  durationSec?: number | null;
}

export interface ResolveRequest {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  season?: number | null;
  episode?: number | null;
}

export interface ResolveResult {
  status: PlaybackStatus;
  reason: PlaybackReason | null;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  season: number | null;
  episode: number | null;
  /** Only ever PLAYABLE sources. */
  sources: PlaybackSource[];
  /** Non-blocking extras, e.g. an official trailer when playback is blocked. */
  trailers: PlaybackSource[];
  /** Server-side detail. Never sent to the browser. */
  diagnostics?: PlaybackDiagnostic[];
}

export interface PlaybackDiagnostic {
  provider: string;
  kind: SourceKind;
  outcome: 'ok' | 'skipped' | 'failed';
  detail: string;
  httpStatus?: number | null;
  durationMs?: number | null;
}

/**
 * User-facing text. Deliberately vague and identical in shape across causes:
 * it says the source could not be produced, never WHY in a way that could
 * describe internal infrastructure, and never reveals a provider or a URL.
 */
export const REASON_MESSAGE: Record<PlaybackReason, string> = {
  SOURCE_404: 'Playback source unavailable.',
  SOURCE_INVALID: 'Playback source unavailable.',
  PROVIDER_TIMEOUT: 'The playback service took too long to respond.',
  EPISODE_NOT_RESOLVED: 'This episode has no authorized source right now.',
  SEASON_NOT_RESOLVED: 'This season is not available.',
  REGION_BLOCKED: 'This title is not available in your region.',
  SOURCE_NOT_AUTHORIZED: 'Playback source unavailable.',
  PLAYBACK_SERVICE_UNAVAILABLE: 'Playback service temporarily unavailable.',
  INVALID_REQUEST: 'That request could not be understood.',
};

/** Statuses from which the player must never be given a URL. */
export const NON_PLAYABLE: ReadonlySet<PlaybackStatus> = new Set<PlaybackStatus>([
  'METADATA_AVAILABLE',
  'SOURCE_AVAILABLE',
  'TEMPORARILY_FAILED',
  'UNAVAILABLE',
]);