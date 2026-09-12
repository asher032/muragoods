// Server-Sent Events stream of provider-config changes.
// Active MuraStream players subscribe here so an admin disabling a provider
// takes effect on open players within ~1s (instead of the 60s poll /
// 2-min CDN cache in /api/murastream/provider-config).
//
// Implementation note: change broadcast rides the same MongoDB the rest of
// the app uses. Polling Mongo every 2s per connection is capped by a global
// cap on concurrent streams; payloads are tiny (list of provider ids).
import { NextRequest } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import ProviderConfig from '@/app/lib/models/ProviderConfig';

export const maxDuration = 300; // Vercel Fluid compute ceiling for streams
export const dynamic = 'force-dynamic';

// Global registry so one interval serves every connected client.
const clients = new Set<(payload: string) => void>();
let interval: ReturnType<typeof setInterval> | null = null;

async function broadcast() {
  try {
    await dbConnect();
    const disabled = await ProviderConfig.find({ disabled: true }).select('provider -_id').lean();
    const payload = `data: ${JSON.stringify({ disabled: (disabled as { provider: string }[]).map(d => d.provider) })}\n\n`;
    for (const send of clients) send(payload);
  } catch {
    // transient DB error — keep the stream alive, clients have poll fallback
  }
}

function ensureInterval() {
  if (!interval) interval = setInterval(() => { void broadcast(); }, 2000);
}

function maybeClearInterval() {
  if (clients.size === 0 && interval) {
    clearInterval(interval);
    interval = null;
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let send: ((payload: string) => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      send = (payload: string) => {
        try { controller.enqueue(encoder.encode(payload)); } catch { /* client gone */ }
      };
      clients.add(send);
      ensureInterval();
      // Send current state immediately so a fresh connection is correct at t0.
      void broadcast();

      // Keepalive comment every 15s keeps proxies from closing idle streams.
      const keepalive = setInterval(() => send?.(': keepalive\n\n'), 15000);
      request.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        if (send) { clients.delete(send); maybeClearInterval(); }
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      if (send) { clients.delete(send); maybeClearInterval(); }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
