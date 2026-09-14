// Server-Sent Events stream of watch-party snapshots (playback state, chat,
// typing, presence). Clients subscribe per party code and receive a full
// snapshot within ~1s of any change, replacing the old 4s per-client polling.
// One global interval per active code serves every subscriber of that party.
import { NextRequest } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Party from '@/app/lib/models/Party';

export const maxDuration = 300; // Vercel Fluid compute ceiling for streams
export const dynamic = 'force-dynamic';

const MAX_CHAT_MESSAGES = 50;
const TICK_MS = 1000;

type Member = { email: string; name: string; lastSeen: Date };
type ChatMessage = { email: string; name: string; text: string; at: Date };
type TypingFlag = { name: string; at: Date };

const rooms = new Map<string, Set<(payload: string) => void>>();
const lastPayload = new Map<string, string>(); // skip sends when nothing changed
let interval: ReturnType<typeof setInterval> | null = null;

function cleanCode(raw: string | null): string {
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function buildPayload(party: {
  state: unknown; hostEmail?: string;
  members?: Member[]; messages?: ChatMessage[]; typingUsers?: TypingFlag[];
} | null): string {
  if (!party) return `data: ${JSON.stringify({ ended: true })}\n\n`;
  const now = Date.now();
  const body = {
    state: party.state ?? null,
    hostEmail: party.hostEmail ?? '',
    members: (party.members || [])
      .filter(m => now - new Date(m.lastSeen).getTime() < 60_000)
      .map(m => ({ email: m.email, name: m.name })),
    messages: (party.messages || []).slice(-MAX_CHAT_MESSAGES),
    typing: ((party.typingUsers || []) as TypingFlag[])
      .filter(t => now - new Date(t.at).getTime() < 5000)
      .map(t => ({ name: t.name })),
    ended: false,
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

async function broadcast(code: string) {
  try {
    await dbConnect();
    const party = await Party.findOne({ code }).select('state hostEmail members messages typingUsers').lean();
    const payload = buildPayload(party as never);
    if (lastPayload.get(code) === payload) return; // nothing changed — skip
    lastPayload.set(code, payload);
    for (const send of rooms.get(code) || []) send(payload);
  } catch {
    // transient DB error — keep the stream alive; EventSource auto-reconnects
  }
}

async function tick() {
  for (const code of Array.from(rooms.keys())) await broadcast(code);
}

function ensureInterval() {
  if (!interval) interval = setInterval(() => { void tick(); }, TICK_MS);
}

function release(code: string) {
  if ((rooms.get(code)?.size ?? 0) === 0) {
    rooms.delete(code);
    lastPayload.delete(code);
  }
  if (rooms.size === 0 && interval) {
    clearInterval(interval);
    interval = null;
  }
}

export async function GET(request: NextRequest) {
  const code = cleanCode(request.nextUrl.searchParams.get('code'));
  if (code.length < 4) {
    return Response.json({ success: false, error: 'Party code is required' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let send: ((payload: string) => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      send = (payload: string) => {
        try { controller.enqueue(encoder.encode(payload)); } catch { /* client gone */ }
      };
      if (!rooms.has(code)) rooms.set(code, new Set());
      rooms.get(code)!.add(send);
      ensureInterval();
      // Fresh connection is correct at t0; also bypasses the dedupe cache.
      lastPayload.delete(code);
      void broadcast(code);

      // Keepalive comment every 15s keeps proxies from closing idle streams.
      const keepalive = setInterval(() => send?.(': keepalive\n\n'), 15000);
      request.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        if (send) rooms.get(code)?.delete(send);
        release(code);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      if (send) rooms.get(code)?.delete(send);
      release(code);
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
