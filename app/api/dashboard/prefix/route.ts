import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';
import {
  readGuildPrefix,
  saveGuildPrefix,
  verifyGuildPrefixWithBot,
  validatePrefix,
  DEFAULT_PREFIX,
} from '@/app/lib/murabot-config';

export const dynamic = 'force-dynamic';

// The command prefix, from the dashboard — no Discord command required.
//
// THE BUG THIS FIXES. Saving showed "Command prefix → Request timed out".
// Three separate network waits ran inside one request: a Discord token
// liveness read (8s), the live guild-permission read (8s) and the bot
// notification (5s) — up to ~21s, while the page gave up after 12s. So a slow
// but perfectly successful save was reported to the operator as a failure,
// and nothing said whether the prefix had actually changed. Typing
// `mg!prefix !` in Discord was the workaround, which is exactly what a
// configuration dashboard exists to avoid.
//
// Now: the authorization decision is cached and shared, the bot notification
// is short and best-effort, and the response states three distinct outcomes
// instead of one. "Saved but Murabot has not confirmed yet" is not "saved",
// and "not saved" is never dressed up as either.

async function guard(token: string, guildId: string) {
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
    { status: check.status },
  );
}

// GET /api/dashboard/prefix?guildId=xxx — load the canonical prefix
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const prefix = await readGuildPrefix(guildId);
  // What the BOT currently holds, so the panel can tell "you changed this"
  // from "Murabot is still on the old value" instead of assuming.
  const bot = await verifyGuildPrefixWithBot(guildId);
  return NextResponse.json({
    success: true,
    prefix,
    defaultPrefix: DEFAULT_PREFIX,
    bot: { confirmed: bot.confirmed, prefix: bot.prefix, reason: bot.reason ?? null },
  });
}

// PATCH /api/dashboard/prefix — save the canonical prefix for a guild
export async function PATCH(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; prefix?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const valid = validatePrefix(body.prefix);
  if (!valid.ok) {
    return NextResponse.json({ success: false, saved: false, code: 'INVALID_PREFIX', error: valid.error }, { status: 400 });
  }

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const result = await saveGuildPrefix(guildId, valid.value);
  if (!result.ok) {
    // Nothing was written. Say so plainly and give no success signal at all.
    return NextResponse.json(
      { success: false, saved: false, code: 'SAVE_FAILED', error: result.message, retryable: true },
      { status: 503 },
    );
  }

  const applied = result.propagation === 'applied';
  return NextResponse.json({
    success: true,
    saved: true,
    prefix: result.value,
    // applied   = Murabot confirmed it; the prefix is live in Discord.
    // pending   = canonically stored, not yet confirmed by Murabot. The UI
    //             must render this as a distinct, non-success state.
    propagation: result.propagation,
    appliedInDiscord: applied,
    retryWithinSec: result.retryWithinSec ?? null,
    message: applied
      ? 'Prefix saved and applied in Discord.'
      : result.message ?? 'Saved, but Murabot has not confirmed yet.',
  });
}
