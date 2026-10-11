import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';
import { apiFail } from '@/app/lib/dashboard-response';
import { validateChannelSetting } from '@/app/lib/discord-channels';
import { ECONOMY_ERROR_CODES } from '@/app/lib/economy-schema';
import { EMBED_LIMITS, validateEmbeds } from '@/app/lib/embed-schema';

export const dynamic = 'force-dynamic';

// POST /api/dashboard/messages — send a Discord message (text and/or embeds)
//
// Three things this route now does that it did not:
//
//   1. It validates the embed against Discord's real limits BEFORE calling the
//      API. It used to `.slice()` each value to the limit, so an over-long
//      description was silently truncated, posted, and reported as a success.
//   2. It verifies the channel through Murabot first — but ONLY acts on a
//      verdict. A bridge that is offline, unconfigured or throttled reports
//      "unknown" and the send proceeds, because the send itself is the check.
//      Refusing to send because a second service is down would break a working
//      feature to add a precheck.
//   3. It reports the REAL Discord answer: 403 says which permission or that
//      the bot's credential was rejected, 404 says the channel is gone, 429
//      forwards Discord's own Retry-After. No failure is collapsed into
//      "Failed to send".

const SNOWFLAKE = /^\d{5,25}$/;

interface SendError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  discordStatus?: number;
  discordMessage?: string;
}

function fail(err: SendError, status: number) {
  return NextResponse.json({ success: false, sent: false, ...err }, { status });
}

// Every dashboard route must answer JSON on ALL paths. `sessionToken()` reads
// the session from the database, so a database outage would otherwise throw
// past the handler and reach the browser as an HTML 500 the dashboard cannot
// parse — surfacing as a generic "Network error" with the real status lost.
// Handled once, here, for the whole route.
export async function POST(req: NextRequest) {
  try {
    return await sendMessage(req);
  } catch {
    return apiFail('INTERNAL_ERROR',
      'The send request failed before it could be attempted. Nothing was sent — retry in a moment.',
      502, { retryable: true });
  }
}

async function sendMessage(req: NextRequest) {
  const token = await sessionToken();
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) return fail({ code: 'AUTH_REQUIRED', message: 'Sign in with Discord to continue', retryable: false }, 401);
  if (!botToken) {
    return fail({
      code: 'BOT_NOT_CONFIGURED',
      message: 'This deployment has no Discord bot credential, so nothing can be sent. '
        + 'This is a server configuration problem, not a problem with your message.',
      retryable: false,
    }, 503);
  }

  let body: {
    guildId?: string; channelId?: string; content?: string;
    embeds?: unknown; target?: { type: string; id: string };
  };
  try { body = await req.json(); } catch {
    return fail({ code: 'INVALID_JSON', message: 'Invalid JSON body', retryable: false }, 400);
  }

  const guildId = String(body.guildId || '');
  const channelId = String(body.channelId || '');
  if (!SNOWFLAKE.test(guildId)) return fail({ code: 'INVALID_GUILD_ID', message: 'Valid guildId required', retryable: false }, 400);
  if (!SNOWFLAKE.test(channelId)) return fail({ code: 'INVALID_CHANNEL_ID', message: 'Valid channelId required', retryable: false }, 400);

  // Authorize through the shared cached guard: distinct codes for a dead token,
  // a non-member and an unmanaged guild — never a collapsed boolean that turns
  // every Discord failure into a false 403.
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    return NextResponse.json({
      success: false,
      sent: false,
      code: check.code,
      message: check.error,
      error: check.error,
      retryable: check.retryable,
      debug: check.debug,
      ...(check.retryAfterMs !== undefined ? { retryAfterMs: check.retryAfterMs } : {}),
    }, { status: check.status });
  }

  const content = String(body.content ?? '').trim();
  if (content.length > EMBED_LIMITS.CONTENT) {
    return fail({
      code: 'CONTENT_TOO_LONG',
      message: `The message is ${content.length} characters — Discord's limit is ${EMBED_LIMITS.CONTENT}. Nothing was sent.`,
      retryable: false,
    }, 422);
  }

  const rawEmbeds = body.embeds === undefined ? [] : body.embeds;
  const embedded = validateEmbeds(rawEmbeds);
  if (!embedded.ok) {
    return NextResponse.json({
      success: false,
      sent: false,
      code: 'INVALID_EMBED',
      message: 'Nothing was sent. ' + embedded.errors.map((e) => e.message).join(' '),
      errors: embedded.errors,
      retryable: false,
    }, { status: 422 });
  }
  if (!content && embedded.embeds.length === 0) {
    return fail({
      code: 'EMPTY_MESSAGE',
      message: 'A message needs text or an embed. Nothing was sent.',
      retryable: false,
    }, 422);
  }

  // ── Channel verification, advisory unless it is a real verdict ─────────
  const verdict = await validateChannelSetting(
    guildId, 'channelId', 'Channel', channelId, ['view', 'send', 'embed'],
  );
  if (verdict && (verdict.code === ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND
    || verdict.code === ECONOMY_ERROR_CODES.MISSING_BOT_PERMISSION
    || verdict.code === ECONOMY_ERROR_CODES.CHANNEL_NOT_TEXT_CAPABLE)) {
    // Murabot answered, and its answer is a judgement about THIS channel.
    return fail({
      code: verdict.code,
      message: `${verdict.message} Nothing was sent.`,
      retryable: false,
      ...(verdict.missingPermission ? { missingPermission: verdict.missingPermission } : {}),
    } as SendError, 422);
  }
  // Any other outcome (bridge offline/unconfigured, rate limited, gateway not
  // ready) told us nothing about the channel. The send below is the check.

  const payload: Record<string, unknown> = {};
  if (content) payload.content = content;
  if (embedded.embeds.length > 0) payload.embeds = embedded.embeds;

  let resp: Response;
  try {
    resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return fail({
      code: timedOut ? 'DISCORD_TIMEOUT' : 'DISCORD_UNREACHABLE',
      message: timedOut
        ? 'Discord did not answer in time. We cannot tell whether the message was posted — check the channel before sending again.'
        : 'Discord could not be reached. Nothing was confirmed as sent — check the channel before sending again.',
      retryable: true,
    }, 502);
  }

  if (!resp.ok) {
    const discordBody = (await resp.json().catch(() => null)) as
      { message?: string; retry_after?: number } | null;
    const discordMessage = typeof discordBody?.message === 'string' ? discordBody.message : undefined;

    if (resp.status === 429) {
      const headerRetry = Number(resp.headers.get('retry-after') ?? '0');
      const retryAfterMs = Math.max(1000, Math.ceil((discordBody?.retry_after ?? headerRetry ?? 1) * 1000));
      return NextResponse.json({
        success: false,
        sent: false,
        code: 'RATE_LIMITED',
        message: `Discord is rate limiting sends (${Math.ceil(retryAfterMs / 1000)}s). ` + 'Nothing was sent — retry after that.',
        retryable: true,
        retryAfterMs,
        discordStatus: 429,
        ...(discordMessage ? { discordMessage } : {}),
      }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } });
    }
    if (resp.status === 401) {
      return fail({
        code: 'BOT_CREDENTIAL_REJECTED',
        message: 'Discord rejected this dashboard\'s bot credential, so nothing was sent. '
          + 'This is a deployment problem, not a problem with your message or your channel.',
        retryable: false,
        discordStatus: 401,
        ...(discordMessage ? { discordMessage } : {}),
      }, 502);
    }
    if (resp.status === 403) {
      return fail({
        code: 'MISSING_BOT_PERMISSION',
        message: 'Murabot is not allowed to post in that channel (Discord returned 403). '
          + 'Grant it View Channel and Send Messages on the channel, or pick another channel. Nothing was sent.',
        retryable: false,
        discordStatus: 403,
        ...(discordMessage ? { discordMessage } : {}),
      }, 403);
    }
    if (resp.status === 404) {
      return fail({
        code: 'CHANNEL_NOT_FOUND',
        message: 'That channel no longer exists, or Murabot cannot see it. Nothing was sent — pick another channel.',
        retryable: false,
        discordStatus: 404,
        ...(discordMessage ? { discordMessage } : {}),
      }, 404);
    }
    return fail({
      code: 'DISCORD_API_ERROR',
      message: `Discord refused the message (HTTP ${resp.status}). Nothing was sent.`,
      retryable: resp.status >= 500,
      discordStatus: resp.status,
      ...(discordMessage ? { discordMessage } : {}),
    }, 502);
  }

  const message = (await resp.json().catch(() => null)) as { id?: string; channel_id?: string } | null;
  if (!message?.id) {
    // A 2xx with no message id is not a confirmation, so it is not reported as
    // one — the operator is told to check the channel instead of being told a
    // message exists that the dashboard cannot point at.
    return fail({
      code: 'UNCONFIRMED',
      message: 'Discord accepted the request but did not return the message. Check the channel before sending again.',
      retryable: true,
    }, 502);
  }

  return NextResponse.json({
    success: true,
    sent: true,
    channelId: message.channel_id ?? channelId,
    messageId: message.id,
    embeds: embedded.embeds.length,
    message: embedded.embeds.length > 0
      ? `Sent to Discord — ${embedded.embeds.length} embed${embedded.embeds.length === 1 ? '' : 's'} delivered.`
      : 'Sent to Discord.',
  });
}

// GET — a real delivery check: does this message still exist in the channel?
// The dashboard links to it after a send, so "delivered" is verifiable rather
// than assumed.
export async function GET(req: NextRequest) {
  try {
    return await checkDelivery(req);
  } catch {
    return apiFail('INTERNAL_ERROR',
      'The delivery check could not be run. This says nothing about the message — retry in a moment.',
      502, { retryable: true });
  }
}

async function checkDelivery(req: NextRequest) {
  const token = await sessionToken();
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) return fail({ code: 'AUTH_REQUIRED', message: 'Sign in with Discord to continue', retryable: false }, 401);
  if (!botToken) return fail({ code: 'BOT_NOT_CONFIGURED', message: 'No bot credential is configured on this deployment.', retryable: false }, 503);

  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const channelId = req.nextUrl.searchParams.get('channelId') || '';
  const messageId = req.nextUrl.searchParams.get('messageId') || '';
  if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(channelId) || !SNOWFLAKE.test(messageId)) {
    return fail({ code: 'INVALID_INPUT', message: 'guildId, channelId and messageId are required', retryable: false }, 400);
  }
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    return NextResponse.json({
      success: false, code: check.code, message: check.error, error: check.error, retryable: check.retryable,
    }, { status: check.status });
  }
  try {
    const resp = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      { headers: { Authorization: `Bot ${botToken}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    if (!resp.ok) {
      return NextResponse.json({
        success: true,
        exists: false,
        message: resp.status === 404
          ? 'That message is no longer in the channel — it was deleted.'
          : `Discord could not confirm the message (HTTP ${resp.status}).`,
      });
    }
    const data = (await resp.json().catch(() => null)) as { id?: string } | null;
    return NextResponse.json({
      success: true,
      exists: data?.id === messageId,
      message: data?.id === messageId ? 'Delivered — the message is in the channel.' : 'Discord answered with a different message.',
    });
  } catch {
    return NextResponse.json({
      success: true,
      exists: null,
      message: 'Discord did not answer, so delivery could not be confirmed.',
    });
  }
}
