import { NextResponse } from 'next/server';

// ── Dashboard API response contract ──────────────────────────────────────
// Success: { success: true, ...data }
// Failure: { success: false, code, error, retryable?, debug? }
// Every route must return JSON on ALL paths — including unexpected throws.
// A thrown error must never become an HTML 500 page the frontend cannot parse
// (that used to surface as a generic "Network error" with the real status lost).

export function apiOk<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function apiFail(
  code: string,
  error: string,
  status: number,
  opts: { retryable?: boolean; debug?: unknown } = {},
) {
  return NextResponse.json(
    {
      success: false,
      code,
      error,
      ...(opts.retryable !== undefined ? { retryable: opts.retryable } : {}),
      ...(opts.debug !== undefined ? { debug: opts.debug } : {}),
    },
    { status },
  );
}

export function logApi(route: string, method: string, status: number, ms: number, code?: string) {
  // Dev-only request trace: endpoint + status + duration + code.
  // Never logs tokens, cookies, headers, or bodies.
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Dashboard API] ${method} ${route} END ${status} ${ms}ms${code ? ` ${code}` : ''}`);
  }
}
