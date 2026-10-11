import { NextRequest, NextResponse } from 'next/server';
import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { discordConfigCollection } from '@/app/lib/discord-config';
import { listSelectableChannels } from '@/app/lib/discord-channels';
import { verifyBotInGuild } from '@/app/lib/discord-bot';
import { apiFail, logApi } from '@/app/lib/dashboard-response';
import { EMBED_LIMITS, validateEmbed } from '@/app/lib/embed-schema';

export const dynamic = 'force-dynamic';

// ── Embed Builder data ───────────────────────────────────────────────────
//
// GET    /api/dashboard/embeds?guildId=…      usable channels + saved drafts
// POST   /api/dashboard/embeds                save (or update) a draft
// DELETE /api/dashboard/embeds?guildId=…&id=… remove a draft
//
// Two deliberate boundaries:
//
//   * The channel list is answered by MURABOT, not by the dashboard's own bot
//     token. Murabot holds the gateway connection and the resolved permission
//     overwrites, so "can Murabot post an embed here?" is answered by the thing
//     that would be doing the posting. A channel it cannot use is still shown,
//     with the exact missing permission, so the operator can fix the overwrites
//     rather than wonder why a channel vanished from the list.
//
//   * A saved draft is DASHBOARD state, not bot configuration — Murabot never
//     reads `embeds`. It lives in the guild's own document because that is
//     where this dashboard's per-guild state already lives (the audit trail
//     does the same), and it is validated with the same limit rules the send
//     route applies, so a draft can never be saved in a shape Discord rejects.
//
// Sending is a separate route (/api/dashboard/messages) because a send has to
// report the REAL Discord answer, which is not something a save can pretend to.

const SNOWFLAKE = /^\d{5,25}$/;
/** Saved drafts kept per guild. Old ones fall off the end, newest first. */
const MAX_SAVED_EMBEDS = 25;

interface SavedEmbed {
  id: string;
  name: string;
  embed: Record<string, unknown>;
  updatedAt: string;
}

function bad(code: string, error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, code, error, ...extra }, { status });
}

async function guard(token: string | null, guildId: string) {
  if (!token) return bad('AUTH_REQUIRED', 'Sign in with Discord to continue', 401);
  if (!SNOWFLAKE.test(guildId)) return bad('INVALID_GUILD_ID', 'Valid guildId required', 400);
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json({
    success: false,
    code: check.code,
    error: check.error,
    retryable: check.retryable,
    ...(check.retryAfterMs !== undefined ? { retryAfterMs: check.retryAfterMs } : {}),
  }, { status: check.status });
}

async function readSaved(guildId: string): Promise<SavedEmbed[]> {
  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId }, { projection: { embeds: 1 } });
  const list = doc?.embeds;
  if (!Array.isArray(list)) return [];
  return list
    .filter((e): e is SavedEmbed => Boolean(e) && typeof e === 'object')
    .slice(0, MAX_SAVED_EMBEDS);
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const token = await sessionToken();
    const guildId = req.nextUrl.searchParams.get('guildId') || '';
    const denied = await guard(token, guildId);
    if (denied) return denied;

    const [channels, saved, presence] = await Promise.all([
      listSelectableChannels(guildId, ['view', 'send', 'embed']),
      readSaved(guildId),
      verifyBotInGuild(guildId),
    ]);

    logApi('/api/dashboard/embeds', 'GET', 200, Date.now() - started);
    return NextResponse.json({
      success: true,
      // Every channel Murabot can see, each with its own verdict. The UI shows
      // unusable ones as disabled WITH the reason, rather than hiding them.
      channels: channels.channels,
      channelError: channels.error
        ? { code: channels.error.code, message: channels.error.message }
        : null,
      saved,
      bot: {
        installed: presence === 'installed' ? true : presence === 'absent' ? false : null,
      },
      limits: EMBED_LIMITS,
      maxSaved: MAX_SAVED_EMBEDS,
    });
  } catch {
    logApi('/api/dashboard/embeds', 'GET', 502, Date.now() - started, 'DATABASE_ERROR');
    return apiFail('DATABASE_ERROR', 'The embed builder could not be loaded — retry in a moment.', 502, { retryable: true });
  }
}

// `guard()` reads the session from the database, so a database outage must not
// reach the browser as an HTML 500 — every path answers JSON.
export async function POST(req: NextRequest) {
  try {
    return await saveDraft(req);
  } catch {
    return apiFail('INTERNAL_ERROR',
      'The draft could not be saved — the request failed before it reached the database. Nothing was changed.',
      502, { retryable: true });
  }
}

async function saveDraft(req: NextRequest) {
  const started = Date.now();
  try {
    const token = await sessionToken();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return bad('INVALID_JSON', 'Invalid JSON body', 400);
    const guildId = String(body.guildId || '');
    const denied = await guard(token, guildId);
    if (denied) return denied;

    const result = validateEmbed(body.embed);
    if (!result.ok) {
      logApi('/api/dashboard/embeds', 'POST', 422, Date.now() - started, 'INVALID_EMBED');
      return NextResponse.json({
        success: false,
        saved: false,
        code: 'INVALID_EMBED',
        errors: result.errors,
        message: 'Nothing was saved. ' + result.errors.map((e) => e.message).join(' '),
      }, { status: 422 });
    }

    const name = String(body.name || '').trim().slice(0, 80) || 'Untitled embed';
    const id = typeof body.id === 'string' && body.id
      ? body.id.slice(0, 64)
      : (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    const draft: SavedEmbed = {
      id,
      name,
      embed: result.embed as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
    const existing = await readSaved(guildId);
    // Replacing a draft keeps its position; a new one goes to the front, and
    // the list is capped so a guild's document cannot grow without bound.
    const next = [draft, ...existing.filter((e) => e.id !== id)].slice(0, MAX_SAVED_EMBEDS);

    try {
      const collection = await discordConfigCollection();
      await collection.updateOne(
        { guildId },
        { $set: { embeds: next, updatedAt: new Date() } },
        { upsert: true },
      );
    } catch {
      logApi('/api/dashboard/embeds', 'POST', 503, Date.now() - started, 'DATABASE_ERROR');
      return bad('DATABASE_ERROR',
        'The draft could not be saved to the database. Nothing was changed — try again in a moment.',
        503, { retryable: true });
    }

    logApi('/api/dashboard/embeds', 'POST', 200, Date.now() - started);
    return NextResponse.json({ success: true, saved: true, draft, saved_embeds: next });
  } catch {
    logApi('/api/dashboard/embeds', 'POST', 502, Date.now() - started, 'INTERNAL_ERROR');
    return apiFail('INTERNAL_ERROR', 'The draft could not be saved — retry in a moment.', 502, { retryable: true });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    return await removeDraft(req);
  } catch {
    return apiFail('INTERNAL_ERROR',
      'The saved embed could not be removed — the request failed before it reached the database. Nothing was changed.',
      502, { retryable: true });
  }
}

async function removeDraft(req: NextRequest) {
  const started = Date.now();
  try {
    const token = await sessionToken();
    const guildId = req.nextUrl.searchParams.get('guildId') || '';
    const id = req.nextUrl.searchParams.get('id') || '';
    const denied = await guard(token, guildId);
    if (denied) return denied;
    if (!id) return bad('INVALID_ID', 'A saved embed id is required', 400);

    const existing = await readSaved(guildId);
    const next = existing.filter((e) => e.id !== id);
    if (next.length === existing.length) {
      return bad('NOT_FOUND', 'That saved embed no longer exists.', 404);
    }
    try {
      const collection = await discordConfigCollection();
      await collection.updateOne({ guildId }, { $set: { embeds: next, updatedAt: new Date() } });
    } catch {
      return bad('DATABASE_ERROR', 'The saved embed could not be removed. Nothing was changed.', 503, { retryable: true });
    }
    logApi('/api/dashboard/embeds', 'DELETE', 200, Date.now() - started);
    return NextResponse.json({ success: true, deleted: id, saved: next });
  } catch {
    logApi('/api/dashboard/embeds', 'DELETE', 502, Date.now() - started, 'INTERNAL_ERROR');
    return apiFail('INTERNAL_ERROR', 'The saved embed could not be removed — retry in a moment.', 502, { retryable: true });
  }
}
