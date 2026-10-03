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
  // ── Registry states: the title resolved to an ADDRESS but no usable
  //    authorized source is registered there. These are the states an
  //    operator can act on by registering a source, which is why they are
  //    distinct from a resolver fault.
  | 'SOURCE_NOT_REGISTERED'
  | 'SOURCE_DISABLED'
  | 'SOURCE_EXPIRED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_INVALID'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'EPISODE_NOT_FOUND'
  | 'SEASON_NOT_RESOLVED'
  | 'REGION_BLOCKED'
  | 'SOURCE_NOT_AUTHORIZED'
  | 'RIGHTS_UNVERIFIED'
  | 'PLAYER_INCOMPATIBLE'
  | 'PLAYBACK_SERVICE_UNAVAILABLE'
  | 'MEDIA_ID_INVALID'
  | 'MEDIA_TYPE_MISMATCH'
  | 'INVALID_REQUEST';

export const PLAYBACK_REASONS: readonly PlaybackReason[] = [
  'SOURCE_NOT_REGISTERED',
  'SOURCE_DISABLED',
  'SOURCE_EXPIRED',
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_INVALID_RESPONSE',
  'SOURCE_NOT_FOUND',
  'SOURCE_INVALID',
  'PROVIDER_TIMEOUT',
  'PROVIDER_ERROR',
  'EPISODE_NOT_FOUND',
  'SEASON_NOT_RESOLVED',
  'REGION_BLOCKED',
  'SOURCE_NOT_AUTHORIZED',
  'RIGHTS_UNVERIFIED',
  'PLAYER_INCOMPATIBLE',
  'PLAYBACK_SERVICE_UNAVAILABLE',
  'MEDIA_ID_INVALID',
  'MEDIA_TYPE_MISMATCH',
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
/**
 * User-facing text.
 *
 * Deliberately vague and identical in shape across causes: it says the
 * source could not be produced, never WHY in a way that could describe
 * internal infrastructure, and never reveals a provider or a URL.
 *
 * Every message here is written for a VIEWER. "No authorized source" — the
 * old wording — is an internal term describing Muragoods' licensing posture,
 * not something a viewer can act on or understand, so it does not appear in
 * any user-visible string. Each message also implies what to do next.
 */
export const REASON_MESSAGE: Record<PlaybackReason, string> = {
  SOURCE_NOT_REGISTERED: "Playback for this title hasn't been added to the library yet.",
  SOURCE_DISABLED: "Playback for this title is switched off right now.",
  SOURCE_EXPIRED: "The playback licence for this title has expired.",
  PROVIDER_NOT_CONFIGURED: "Playback isn't set up for this title yet.",
  PROVIDER_UNAVAILABLE: "The playback provider is temporarily unreachable.",
  PROVIDER_INVALID_RESPONSE: "The playback provider returned an unexpected response.",
  SOURCE_NOT_FOUND: "This title isn't available for playback right now.",
  SOURCE_INVALID: "This title isn't available for playback right now.",
  PROVIDER_TIMEOUT: "Playback couldn't be started. Try again.",
  PROVIDER_ERROR: "Playback couldn't be started. Try again.",
  EPISODE_NOT_FOUND: "This episode isn't available for playback right now.",
  SEASON_NOT_RESOLVED: "This season isn't available right now.",
  REGION_BLOCKED: "This title isn't available in your region.",
  SOURCE_NOT_AUTHORIZED: "This title isn't available for playback right now.",
  RIGHTS_UNVERIFIED: "Playback for this title is not cleared yet. We have to verify our rights to it first.",
  PLAYER_INCOMPATIBLE: "Your browser can't play this video format.",
  PLAYBACK_SERVICE_UNAVAILABLE: 'Playback service is temporarily unavailable.',
  MEDIA_ID_INVALID: "This title isn't available for playback right now.",
  MEDIA_TYPE_MISMATCH: "This title isn't available for playback right now.",
  INVALID_REQUEST: "That request could not be understood.",
};

/**
 * Whether a Try Again button is meaningful for a reason.
 *
 * Only faults that can actually recover get one. Offering "Try again" for a
 * title with no licensed source would be an infinite loop of a request whose
 * answer cannot change.
 */
export function isRetryable(reason: PlaybackReason | null): boolean {
  if (!reason) return false;
  return reason === 'PROVIDER_TIMEOUT'
    || reason === 'PROVIDER_ERROR'
    || reason === 'PLAYBACK_SERVICE_UNAVAILABLE'
    || reason === 'SOURCE_INVALID'
    || reason === 'PROVIDER_UNAVAILABLE'
    || reason === 'PROVIDER_INVALID_RESPONSE';
}

/**
 * Whether "Try Again" is honest for this reason.
 *
 * A title with no registered source will not change by being retried, so it
 * deliberately does NOT qualify — offering the button there taught viewers
 * that retrying is a real remedy when it never was.
 */
export function isPermanent(reason: PlaybackReason | null): boolean {
  if (!reason) return false;
  return reason === 'SOURCE_NOT_REGISTERED'
    || reason === 'SOURCE_DISABLED'
    || reason === 'SOURCE_EXPIRED'
    || reason === 'PROVIDER_NOT_CONFIGURED'
    || reason === 'MEDIA_ID_INVALID';
}

/** Statuses from which the player must never be given a URL. */
export const NON_PLAYABLE: ReadonlySet<PlaybackStatus> = new Set<PlaybackStatus>([
  'METADATA_AVAILABLE',
  'SOURCE_AVAILABLE',
  'TEMPORARILY_FAILED',
  'UNAVAILABLE',
]);