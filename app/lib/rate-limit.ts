// Simple fixed-window in-memory rate limiter for auth endpoints. Per Vercel
// serverless instance (fine for abuse damping — the DB is the real backstop).
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client identity from proxy headers. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

// Periodic cleanup so the map doesn't grow unbounded.
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }, 5 * 60_000);
  if (typeof timer === 'object' && 'unref' in timer) (timer as { unref: () => void }).unref();
}
