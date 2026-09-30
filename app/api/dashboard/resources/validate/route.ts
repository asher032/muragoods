import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { verifyResource, type VerifyResult } from '@/app/lib/resource-verifier';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/dashboard/resources/validate — pre-save permission check.
// Body: { guildId, kind: 'channel'|'category'|'role'|'member', id, require?: string[] }
//
// WHAT CHANGED, AND WHY
//
// This route used to hold its own copy of the bot token and call Discord's
// REST API directly. That was a second Discord client for a single bot, living
// in a second deployment, and every selector blocked on two to four round-trips
// to discord.com from inside a serverless function. When those did not return —
// a cold start, a throttle, a Cloudflare challenge — the response was
// "Discord did not respond in time", which reads as a statement about the
// selected channel and is not one at all. The giveaways save then refused to
// write, over a check that was never necessary.
//
// Murabot's gateway already holds the guild, its channels, its roles and their
// permission overwrites. Verification now goes there, over the existing bridge,
// and does no Discord I/O from the site. One client, one credential, and no
// request that can time out because Discord is slow.
//
// The response SHAPE is unchanged, so nothing downstream had to be rewritten,
// and the meaning is now stricter: `verified` is true only when a real verdict
// came back. A timeout, a rate limit or an unreachable Murabot all report
// `verified: false` and a code from the closed set, so the UI can say "we could
// not check this" instead of "this is wrong".

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PERMISSION_KEYS = new Set([
  'view', 'send', 'embed', 'history', 'react', 'manageMessages', 'connect', 'speak',
]);

type Kind = 'channel' | 'category' | 'role' | 'member';

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, valid: false, verified: false, message, checks: [], ...(code ? { code } : {}) },
    { status },
  );
}

function respond(r: VerifyResult, retryAfterMs?: number) {
  const status = r.code === 'VERIFIED' ? 200
    : r.code === 'INVALID_SELECTION' ? 404
      : r.code === 'PERMISSION_DENIED' ? 403
        : r.code === 'BOT_NOT_IN_GUILD' ? 404
          : r.code === 'DISCORD_RATE_LIMITED' ? 429
            : r.code === 'AUTHENTICATION_ERROR' ? 401
              : 503;
  return NextResponse.json(
    {
      success: r.outcome === 'verified',
      // A verdict about the SELECTION. `valid: false` here means Discord was
      // asked and said no.
      valid: r.valid,
      // Whether the check RAN. `verified: false` means we never found out, and
      // the caller must not treat that as a reason to reject or overwrite.
      verified: r.outcome === 'verified',
      code: r.code,
      message: r.message,
      retryable: r.retryable,
      requestId: r.requestId,
      objectName: r.objectName,
      missingPermissions: r.missingPermissions,
      checks: r.checks,
    },
    {
      status,
      headers: retryAfterMs !== undefined
        ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
        : undefined,
    },
  );
}

export async function POST(req: NextRequest) {
  const userToken = await sessionToken();
  if (!userToken) return bad('Sign in with Discord to continue', 401, 'AUTH_REQUIRED');

  const body = (await req.json().catch(() => null)) as {
    guildId?: string; kind?: string; id?: string; require?: string[]; bypassCache?: boolean;
  } | null;
  const guildId = String(body?.guildId || '');
  const kind = String(body?.kind || '');
  const objectId = String(body?.id || '');
  const require = Array.isArray(body?.require)
    ? body.require.map(String).filter((r) => PERMISSION_KEYS.has(r))
    : [];

  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(objectId)) {
    return bad('Valid guildId and object id are required', 400, 'INVALID_GUILD_ID');
  }
  if (!['channel', 'category', 'role', 'member'].includes(kind)) {
    return bad('kind must be channel, category, role or member', 400, 'INVALID_OP');
  }

  // The caller must manage this guild right now. The id is never trusted, and
  // this check stays on the SITE side because it proves something about the
  // signed-in user, which Murabot cannot see.
  const manage = await requireGuildManage(userToken, guildId);
  if (!manage.ok) return bad(manage.error, manage.status, manage.code);

  const r = await verifyResource(
    guildId, kind as Kind, objectId, require,
    { bypassCache: body?.bypassCache === true },
  );
  return respond(r, r.code === 'DISCORD_RATE_LIMITED' ? 1000 : undefined);
}
