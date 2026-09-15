// Safe client-side navigation helper. Notification URLs (and any other URL
// that originates from storage, payloads, or query params) must never be
// assigned to window.location directly — javascript:/data: URLs would run.

/** Returns true only for internal paths (must start with a single "/"). */
export function isInternalPath(url: string): boolean {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}

/**
 * Navigate to a notification/storage-supplied URL safely.
 * - Internal paths (starting with a single "/") navigate client-side via
 *   Next.js router — no full reload.
 * - Absolute URLs are allowed only with http(s): protocol.
 * - javascript:, data:, vbscript:, blob: and malformed URLs are rejected.
 */
export function safeNavigate(url: string | undefined, router?: { push: (url: string) => void }): void {
  if (!url || typeof url !== 'string') return;
  const trimmed = url.trim();
  if (!trimmed) return;

  if (isInternalPath(trimmed)) {
    if (router) {
      router.push(trimmed);
    } else {
      window.location.assign(trimmed);
    }
    return;
  }

  // Absolute URL — verify the scheme explicitly.
  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      window.location.assign(parsed.toString());
    }
    // Anything else (javascript:, data:, unknown scheme) is silently dropped.
  } catch {
    // Malformed URL — ignore.
  }
}
