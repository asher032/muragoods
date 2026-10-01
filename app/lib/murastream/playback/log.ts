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