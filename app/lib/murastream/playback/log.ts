import crypto from 'crypto';

// ── Structured playback logging ────────────────────────────────────────
//
// Every non-PLAYABLE outcome produces one greppable line so a K-drama that
// will not play can be diagnosed from a log instead of guessed at from the UI.
//
//   PLAYBACK_FAILURE mediaType=tv tmdbId=12345 season=1 episode=4 \
//     reason=EPISODE_NOT_RESOLVED source=first_party httpStatus=404 \
//     responseTime=12ms requestId=abc userId=MG-... ts=2026-01-01T00:00:00Z
//
// What is deliberately NOT logged: API keys, tokens, the TMDB key, database
// URIs, bridge secrets, provider credentials, or full stack traces. The
// redaction list is applied to every value, so a future caller that passes
// something sensitive by accident still cannot leak it.

const REDACT = /(api[_-]?key|token|secret|password|authorization|bearer|mongodb(\+srv)?:\/\/|postgres(ql)?:\/\/)/i;

function safe(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const s = String(value);
  if (REDACT.test(s)) return '[redacted]';
  // A URI carries credentials far more often than it carries useful detail.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return '[uri-redacted]';
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

export function newRequestId(): string {
  return crypto.randomBytes(6).toString('hex');
}

export interface FailureLogInput {
  requestId: string;
  userId?: string | null;
  mediaType: string;
  tmdbId: number;
  season?: number | null;
  episode?: number | null;
  source?: string | null;
  reason: string;
  httpStatus?: number | null;
  status?: string;
  responseTimeMs?: number;
}

/** One line per failed playback attempt. Never throws. */
export function logPlaybackFailure(input: FailureLogInput): void {
  try {
    const parts = [
      'PLAYBACK_FAILURE',
      `requestId=${safe(input.requestId)}`,
      `userId=${safe(input.userId)}`,
      `mediaType=${safe(input.mediaType)}`,
      `tmdbId=${safe(input.tmdbId)}`,
      `season=${safe(input.season)}`,
      `episode=${safe(input.episode)}`,
      `source=${safe(input.source)}`,
      `reason=${safe(input.reason)}`,
      `httpStatus=${safe(input.httpStatus)}`,
      `status=${safe(input.status)}`,
      `responseTime=${safe(input.responseTimeMs)}ms`,
      `ts=${new Date().toISOString()}`,
    ];
    console.warn(parts.join(' '));
  } catch {
    // Logging must never be the reason a playback request fails.
  }
  rememberFailure(input);
}

// ── Recent-failure ring buffer ─────────────────────────────────────────
//
// A log line is only useful if someone is reading it. The admin panel needs
// "what has been failing lately" without shell access to the deploy logs, so
// the last N failures are kept in memory — bounded, oldest dropped, and
// holding ONLY the already-redacted fields above. This is a diagnostic aid,
// not an audit store: it resets when the process restarts, and nothing
// sensitive is retained because `safe()` runs before anything is kept.

export interface RecentFailure {
  at: string;
  requestId: string;
  mediaType: string;
  tmdbId: number;
  season: number | null;
  episode: number | null;
  reason: string;
  status: string;
}

const RECENT_LIMIT = 100;
const recentFailures: RecentFailure[] = [];
export const PLAYBACK_FAILURE_COUNT = { value: 0 };

function rememberFailure(input: FailureLogInput): void {
  try {
    PLAYBACK_FAILURE_COUNT.value += 1;
    recentFailures.unshift({
      at: new Date().toISOString(),
      requestId: safe(input.requestId),
      mediaType: safe(input.mediaType),
      tmdbId: Number(input.tmdbId) || 0,
      season: input.season ?? null,
      episode: input.episode ?? null,
      reason: safe(input.reason),
      status: safe(input.status),
    });
    if (recentFailures.length > RECENT_LIMIT) recentFailures.length = RECENT_LIMIT;
  } catch { /* never let diagnostics break playback */ }
}

/** The most recent failures, newest first. Never throws. */
export function recentPlaybackFailures(limit = 25): RecentFailure[] {
  try {
    return recentFailures.slice(0, Math.max(0, Math.min(RECENT_LIMIT, limit)));
  } catch {
    return [];
  }
}

/** Successful resolutions are logged at debug level, not warn. */
export function logPlaybackResolved(input: Omit<FailureLogInput, 'reason'> & { reason: null }): void {
  try {
    console.log([
      'PLAYBACK_OK',
      `requestId=${safe(input.requestId)}`,
      `mediaType=${safe(input.mediaType)}`,
      `tmdbId=${safe(input.tmdbId)}`,
      `season=${safe(input.season)}`,
      `episode=${safe(input.episode)}`,
      `source=${safe(input.source)}`,
      `responseTime=${safe(input.responseTimeMs)}ms`,
      `ts=${new Date().toISOString()}`,
    ].join(' '));
  } catch { /* ignore */ }
}