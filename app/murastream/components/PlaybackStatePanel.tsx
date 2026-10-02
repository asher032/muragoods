'use client';

// ── Playback state panel ────────────────────────────────────────────────
//
// ONE component for every non-playing state, so the viewer-facing wording is
// written once and cannot drift between pages.
//
// The old screen said "Playback source unavailable. / No authorized source" for
// every possible outcome. That is Muragoods' internal licensing posture, not
// something a viewer can act on, and it hid the difference between "try again
// in a moment" and "this title has no licensed source at all".
//
// Each state below says what happened and what to do next. None of them
// mentions a provider, a URL, or an internal reason code — that detail lives
// in the server log and the admin panel, keyed by requestId.

export type PlaybackPanelPhase = 'loading' | 'failed' | 'blocked' | 'error';

interface Copy {
  title: string;
  body: string;
}

const COPY: Record<Exclude<PlaybackPanelPhase, 'loading'>, Copy> = {
  failed: {
    title: "Playback couldn't be started.",
    body: 'This is usually temporary. Try again in a moment.',
  },
  blocked: {
    title: "This title isn't available for playback right now.",
    body: 'You can still browse it and see what is known about it.',
  },
  error: {
    title: 'Playback service is temporarily unavailable.',
    body: 'We could not reach the playback service. Try again in a moment.',
  },
};

const LOADING_COPY: Copy = {
  title: 'Loading playback…',
  body: 'Finding a source for this title.',
};

export default function PlaybackStatePanel({
  phase,
  message,
  onRetry,
  retryable,
  cooldownMs,
  trailers,
  requestId,
}: {
  phase: PlaybackPanelPhase;
  message?: string;
  onRetry?: () => void;
  retryable?: boolean;
  cooldownMs?: number;
  trailers?: Array<{ url: string; label: string; kind: string }>;
  requestId?: string | null;
}) {
  const copy = phase === 'loading' ? LOADING_COPY : COPY[phase];
  // The server's own message wins when it has one; it is always viewer-facing.
  const title = phase !== 'loading' && message ? message : copy.title;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 14, padding: 32, textAlign: 'center',
        background: 'rgba(18,18,24,0.7)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
      }}
    >
      {phase === 'loading' && <div className="custom-loader" />}

      <p style={{ margin: 0, fontSize: 15, color: '#f5f5f5', fontWeight: 600 }}>{title}</p>
      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.55)', maxWidth: 420 }}>{copy.body}</p>

      {/* A licensed trailer is a real, clearly-labelled extra. It is never
          presented as the episode, and it is only offered when the resolver
          found one through TMDB's licensed API. */}
      {trailers && trailers.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Official trailer available:
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {trailers.map((t) => (
              <a
                key={t.url}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="deco-btn deco-btn-sm"
                style={{ textDecoration: 'none' }}
              >
                ▶ {t.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Try Again is shown only when a retry could genuinely change the
          answer. Offering it on a permanently unplayable title would be an
          invitation to loop forever against an answer that cannot move. */}
      {onRetry && phase !== 'loading' && (
        <button
          type="button"
          onClick={onRetry}
          disabled={phase === 'error' ? false : !retryable}
          style={{
            marginTop: 4,
            background: retryable || phase === 'error' ? 'rgba(255,255,255,0.1)' : 'transparent',
            border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10,
            color: '#fff', padding: '8px 18px', cursor: 'pointer', fontSize: 13,
            opacity: retryable || phase === 'error' ? 1 : 0.45,
          }}
        >
          {cooldownMs && cooldownMs > 0 ? `Try again in ${Math.ceil(cooldownMs / 1000)}s` : 'Try again'}
        </button>
      )}

      {/* The request id is the join between what a viewer sees and what an
          operator sees. It carries no internal detail by itself. */}
      {requestId && (
        <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>
          Reference: {requestId}
        </p>
      )}
    </div>
  );
}