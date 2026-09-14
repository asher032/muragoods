import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Party from '@/app/lib/models/Party';

// Watch Party REST API.
//  POST /api/murastream/party              → create a party, returns { code }
//  GET  /api/murastream/party?code=XXXX    → party snapshot (state + members)
//  PATCH /api/murastream/party?code=XXXX   → update playback state or add a member
//  DELETE /api/murastream/party?code=XXXX  → end the party (host only)

type ChatMessage = { email: string; name: string; text: string; at: Date };
type TypingFlag = { name: string; at: Date };

const MAX_CHAT_CHARS = 300;
const MAX_CHAT_MESSAGES = 50;
// Validate + normalize host playback state. Returns null for junk (wrong
// shapes) so garbage never enters the doc and guests never follow it.
function sanitizeState(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const type = s.type === 'tv' ? 'tv' : s.type === 'movie' ? 'movie' : null;
  const id = Number(s.id);
  if (!type || !Number.isInteger(id) || id <= 0) return null;
  const season = Math.max(1, Math.floor(Number(s.season)) || 1);
  const episode = Math.max(1, Math.floor(Number(s.episode)) || 1);
  const source = typeof s.source === 'string' && /^[a-z0-9-]{1,24}$/i.test(s.source) ? s.source : '';
  // Host's playback start (wall-clock ms). Guests use it to align timelines.
  const startAtNum = Number(s.startAt);
  const startAt = Number.isFinite(startAtNum) && startAtNum > 0 ? Math.floor(startAtNum) : undefined;
  const next: Record<string, unknown> = { type, id, season, episode, source, updatedAt: new Date() };
  if (startAt !== undefined) next.startAt = startAt;
  return next;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/1, O/0 confusion

// Match a member row by email, falling back to name for anonymous guests.
function memberMatch(email: string, name: string): Record<string, unknown> {
  return email ? { email } : { name };
}

function newCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

function cleanCode(raw: string | null): string {
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const hostEmail: string = typeof body.email === 'string' ? body.email : '';
    const hostName: string = typeof body.name === 'string' && body.name ? body.name : 'Host';
    const state = sanitizeState(body.state);

    // Retry a few times in the unlikely event of a code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const party = await Party.create({
          code: newCode(),
          hostEmail,
          hostName,
          state,
          members: [{ email: hostEmail, name: hostName, lastSeen: new Date() }],
        });
        return NextResponse.json({ success: true, data: { code: party.code } }, { status: 201 });
      } catch (err: unknown) {
        // duplicate key → regenerate and try again
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    return NextResponse.json({ success: false, error: 'Could not allocate a party code' }, { status: 500 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const code = cleanCode(searchParams.get('code'));
    if (!code) {
      return NextResponse.json({ success: false, error: 'Party code is required' }, { status: 400 });
    }
    const party = await Party.findOne({ code }).lean();
    if (!party) {
      return NextResponse.json({ success: false, error: 'Party not found — check the code' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: {
        code: party.code,
        hostName: party.hostName,
        hostEmail: party.hostEmail,
        state: party.state,
        members: party.members || [],
        messages: ((party.messages || []) as ChatMessage[]).slice(-MAX_CHAT_MESSAGES),
        typing: (((party.typingUsers || []) as TypingFlag[]))
          .filter(t => Date.now() - new Date(t.at).getTime() < 5000),
        createdAt: party.createdAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const code = cleanCode(searchParams.get('code'));
    if (!code) {
      return NextResponse.json({ success: false, error: 'Party code is required' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));

    const partyExists = await Party.findOne({ code }).select('_id').lean();
    if (!partyExists) {
      return NextResponse.json({ success: false, error: 'Party not found — check the code' }, { status: 404 });
    }

    // All member mutations below use atomic updateOne operations instead of
    // load-modify-save. Concurrent joins/heartbeats/chat used to trip Mongoose
    // version conflicts (VersionError) when two requests saved the same doc.

    // join: { action: 'join', email, name }
    if (body.action === 'join') {
      const email: string = typeof body.email === 'string' ? body.email : '';
      const name: string = typeof body.name === 'string' && body.name ? body.name : 'Guest';
      const refreshed = await Party.updateOne(
        { code, members: { $elemMatch: memberMatch(email, name) } },
        { $set: { 'members.$.lastSeen': new Date() } },
      );
      if (refreshed.matchedCount === 0) {
        // Conditional push: only fires when the member is genuinely absent.
        await Party.updateOne(
          { code, members: { $not: { $elemMatch: memberMatch(email, name) } } },
          { $push: { members: { email, name, lastSeen: new Date() } } },
        );
      }
      const fresh = await Party.findOne({ code }).select('state').lean();
      return NextResponse.json({ success: true, data: { joined: true, state: fresh?.state ?? null } });
    }

    // typing signal: { action: 'typing', email, name } — any member. Persisted
    // as tiny self-expiring flags (staleness-checked on every read).
    if (body.action === 'typing') {
      const email: string = typeof body.email === 'string' ? body.email : '';
      const name: string = typeof body.name === 'string' && body.name ? body.name : 'Guest';
      const isMember = await Party.exists({ code, members: { $elemMatch: memberMatch(email, name) } });
      if (isMember) {
        const now = new Date();
        // Drop this member's old flag and any stale ones, then push fresh.
        await Party.updateOne(
          { code },
          { $pull: { typingUsers: { $or: [{ name }, { at: { $lt: new Date(now.getTime() - 5000) } }] } } },
        );
        await Party.updateOne(
          { code, 'typingUsers.name': { $ne: name } },
          { $push: { typingUsers: { name, at: now } } },
        );
      }
      return NextResponse.json({ success: true });
    }

    // chat send: { action: 'chat', email, name, text } — any party member.
    if (body.action === 'chat') {
      const email: string = typeof body.email === 'string' ? body.email : '';
      const name: string = typeof body.name === 'string' && body.name ? body.name : 'Guest';
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_CHAT_CHARS) : '';
      if (!text) {
        return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
      }
      const isMember = await Party.exists({ code, members: { $elemMatch: memberMatch(email, name) } });
      if (!isMember) {
        return NextResponse.json({ success: false, error: 'Join the party to chat' }, { status: 403 });
      }
      await Party.updateOne(
        { code },
        { $push: { messages: { $each: [{ email, name, text, at: new Date() }], $slice: -MAX_CHAT_MESSAGES } } },
      );
      return NextResponse.json({ success: true });
    }

    // heartbeat: { action: 'heartbeat', email, name } — keeps the member visible
    if (body.action === 'heartbeat') {
      const email: string = typeof body.email === 'string' ? body.email : '';
      const name: string = typeof body.name === 'string' && body.name ? body.name : 'Guest';
      await Party.updateOne(
        { code, members: { $elemMatch: memberMatch(email, name) } },
        { $set: { 'members.$.lastSeen': new Date() } },
      );
      return NextResponse.json({ success: true });
    }

    // default: update playback state — host only. When the host has no
    // email (anonymous host), anonymous clients are allowed through; any
    // identified member is always rejected.
    const hostParty = await Party.findOne({ code }).select('hostEmail').lean();
    if (!hostParty) {
      return NextResponse.json({ success: false, error: 'Party not found — check the code' }, { status: 404 });
    }
    const isHost = hostParty.hostEmail
      ? body.email === hostParty.hostEmail
      : !body.email || body.email === hostParty.hostEmail;
    if (!isHost) {
      return NextResponse.json({ success: false, error: 'Only the host controls playback' }, { status: 403 });
    }
    if (body.state !== undefined) {
      const next = sanitizeState(body.state);
      if (!next) {
        return NextResponse.json({ success: false, error: 'Invalid playback state' }, { status: 400 });
      }
      await Party.updateOne({ code }, { $set: { state: next } });
    }
    const after = await Party.findOne({ code }).select('state').lean();
    return NextResponse.json({ success: true, data: { state: after?.state ?? null } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const code = cleanCode(searchParams.get('code'));
    const email = searchParams.get('email') || '';
    if (!code) {
      return NextResponse.json({ success: false, error: 'Party code is required' }, { status: 400 });
    }
    const party = await Party.findOne({ code });
    if (!party) return NextResponse.json({ success: true });
    if (party.hostEmail && email && party.hostEmail !== email) {
      return NextResponse.json({ success: false, error: 'Only the host can end the party' }, { status: 403 });
    }
    await Party.deleteOne({ _id: party._id });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
