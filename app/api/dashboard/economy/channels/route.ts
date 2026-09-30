import { requireSession } from '@/app/lib/require-session';
import { botChannels, invalidateBotPresence, type BotCheckCode } from '@/app/lib/bot-presence';
import { discordConfigCollection } from '@/app/lib/discord-config';
import { NextRequest, NextResponse } from 'next/server';

// GET ?guildId=…&requires=view,send,embed
//
// Backs the Economy Log Channel selector.
//
// The channel list comes from Murabot's own gateway cache, and so does the
// answer to "can Murabot post here". The dashboard previously made its own
// Discord REST calls with a site-side bot token; when that token was missing
// or rejected, Discord's 401 was flattened into "Discord did not answer the
// bot check" and shown under the channel field as though the channel were at
// fault.
//
// Every outcome is distinct here, and a stored channel that is no longer
// usable is reported as broken rather than hidden:
//
//   BOT_ONLINE · BOT_OFFLINE · BOT_GATEWAY_NOT_READY · BOT_NOT_IN_GUILD
//   BOT_PERMISSION_MISSING · DISCORD_RATE_LIMITED · AUTHENTICATION_ERROR
//   BRIDGE_NOT_CONFIGURED · INTERNAL_ERROR · DISCORD_API_ERROR

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_REQUIRES = ['view', 'send', 'embed', 'read'] as const;

/** HTTP status per failure code, so a client can back off correctly. */
function statusFor(code: BotCheckCode): number {
  if (code === 'BOT_NOT_IN_GUILD') return 404;
  if (code === 'AUTHENTICATION_ERROR') return 502;
  if (code === 'DISCORD_RATE_LIMITED') return 429;
  if (code === 'BRIDGE_NOT_CONFIGURED' || code === 'INTERNAL_ERROR') return 503;
  return 503;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const guildId = (params.get('guildId') || '').trim();

  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' },
      { status: 400 },
    );
  }
  const auth = await requireSession(guildId);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, error: auth.error },
      { status: auth.status },
    );
  }

  const requested = (params.get('requires') || 'view,send,embed')
    .split(',').map((r) => r.trim())
    .filter((r): r is (typeof VALID_REQUIRES)[number] => (VALID_REQUIRES as readonly string[]).includes(r));
  const requires = requested.length > 0 ? requested : ['view', 'send', 'embed'];

  if (params.get('fresh') === '1') invalidateBotPresence(guildId);
  const result = await botChannels(guildId, requires);

  if (result.error) {
    return NextResponse.json(
      {
        success: false,
        code: result.error.code,
        error: result.error.message,
        // Retryability is a property of the failure, not a guess: a rate limit
        // and a missing bridge are both retryable, a missing guild is not.
        retryable: result.error.code !== 'BOT_NOT_IN_GUILD',
        retryAfterMs: result.retryAfterMs,
        bot: result.presence,
        channels: [],
        current: null,
      },
      {
        status: statusFor(result.error.code),
        headers: result.retryAfterMs ? { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) } : undefined,
      },
    );
  }

  // The verdict for the channel CURRENTLY stored in the config, so a channel
  // that has since been deleted or locked out is surfaced as broken instead of
  // rendering as an empty select.
  let current: { id: string; valid: boolean; message?: string; missingPermission?: string } | null = null;
  try {
    const collection = await discordConfigCollection();
    const doc = await collection.findOne({ guildId });
    const stored = (doc?.economy as Record<string, unknown> | undefined)?.logChannelId;
    if (typeof stored === 'string' && /^\d{5,25}$/.test(stored)) {
      const found = result.channels.find((c) => c.id === stored);
      if (found) {
        current = {
          id: stored,
          valid: found.usable,
          message: found.usable ? undefined : found.missing
            ? `Murabot is missing the ${found.missing.label} permission in #${found.name}.`
            : `#${found.name} cannot receive economy logs.`,
          missingPermission: found.missing?.label,
        };
      } else {
        // Not offered any more: deleted, foreign, or the bot can no longer see
        // it. Say so rather than pretending the field is simply empty.
        current = {
          id: stored,
          valid: false,
          message: 'This channel no longer exists on this server, or Murabot can no longer see it. Please select another channel.',
        };
      }
    }
  } catch {
    // A config read failure must not hide the channel list; the verdict for the
    // stored channel simply comes back unknown.
    current = null;
  }

  return NextResponse.json({
    success: true,
    channels: result.channels,
    current,
    requires: result.requires,
    bot: result.presence,
    cached: result.cached,
  });
}
