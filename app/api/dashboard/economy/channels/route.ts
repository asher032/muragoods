import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import {
  guildSnapshot,
  judgeChannel,
  listSelectableChannels,
  type RequiredPermission,
} from '@/app/lib/discord-channels';
import { ECONOMY_ERROR_CODES } from '@/app/lib/economy-schema';
import { discordConfigCollection } from '@/app/lib/discord-config';
import { NextRequest, NextResponse } from 'next/server';

// GET ?guildId=…&requires=view,send,embed
//
// Backs the channel dropdown. Returns every text channel on the server with
// whether Murabot can actually use it, plus the verdict for the channel
// CURRENTLY stored in the config — so a channel that has since been deleted is
// reported as broken instead of quietly rendering as an empty select.
//
// Discord reads are cached and de-duplicated in `guildSnapshot`, so rendering
// the page and opening this dropdown cost one set of calls, not one per field.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_REQUIRES: RequiredPermission[] = ['view', 'send', 'embed'];

export async function GET(req: NextRequest) {
  const token = await sessionToken();
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) {
    return NextResponse.json(
      { success: false, code: 'AUTH_REQUIRED', error: 'Sign in with Discord to continue' },
      { status: 401 },
    );
  }
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' },
      { status: 400 },
    );
  }
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    return NextResponse.json(
      { success: false, code: check.code, error: check.error, retryable: check.retryable },
      { status: check.status },
    );
  }

  const requested = (req.nextUrl.searchParams.get('requires') || 'view,send')
    .split(',')
    .map((r) => r.trim())
    .filter((r): r is RequiredPermission => (VALID_REQUIRES as string[]).includes(r));
  const requires = requested.length > 0 ? requested : (['view', 'send'] as RequiredPermission[]);

  let snapshot;
  try {
    snapshot = await guildSnapshot(guildId);
  } catch (err) {
    const failure = err as { code?: string; message?: string; retryAfterSec?: number };
    // A rate limit or an outage is a TRANSIENT condition. It must never be
    // reported as "your channel is invalid" — that would make the operator
    // change a perfectly good setting because Discord was busy.
    const retryable = failure.code !== ECONOMY_ERROR_CODES.BOT_NOT_IN_GUILD;
    const status = failure.code === ECONOMY_ERROR_CODES.BOT_NOT_IN_GUILD ? 404 : 503;
    return NextResponse.json(
      {
        success: false,
        code: failure.code ?? ECONOMY_ERROR_CODES.DISCORD_UNAVAILABLE,
        error: failure.message ?? 'Could not verify channels with Discord right now.',
        retryable,
        retryAfterSec: failure.retryAfterSec,
      },
      {
        status,
        headers: failure.retryAfterSec ? { 'Retry-After': String(failure.retryAfterSec) } : undefined,
      },
    );
  }

  // Judge the stored channel too, so a previously-valid channel that has since
  // been deleted or locked out is surfaced as broken.
  let current: { id: string; valid: boolean; message?: string; missingPermission?: string } | null = null;
  try {
    const collection = await discordConfigCollection();
    const doc = await collection.findOne({ guildId });
    const stored = (doc?.economy as Record<string, unknown> | undefined)?.logChannelId;
    if (typeof stored === 'string' && /^\d{5,25}$/.test(stored)) {
      const verdict = judgeChannel(snapshot, guildId, stored, requires);
      current = {
        id: stored,
        valid: verdict.valid,
        message: verdict.valid ? undefined : verdict.message,
        missingPermission: verdict.missingPermission,
      };
    }
  } catch {
    // A config read failure must not hide the channel list; the verdict for
    // the stored channel simply comes back unknown (current: null).
    current = null;
  }

  return NextResponse.json({
    success: true,
    channels: listSelectableChannels(snapshot, guildId, requires),
    current,
    requires,
  });
}
