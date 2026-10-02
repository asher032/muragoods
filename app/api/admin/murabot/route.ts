import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, requireStaff } from '@/app/lib/access-control';
import { botStatus } from '@/app/lib/bot-presence';
import {
  readGuildConfig,
  writeGuildConfigFields,
  pushGuildConfigToBot,
  saveGuildPrefix,
  readGuildPrefix,
  validatePrefix,
  verifyGuildPrefixWithBot,
} from '@/app/lib/murabot-config';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// Murabot administration from the Muragoods Admin Panel.
//
// ARCHITECTURE THIS ENFORCES (the dashboard is NOT in this path):
//
//   Muragoods Admin → this API → Murabot bridge → Discord API
//
// The old shape was: the owner had to sign in to the Discord dashboard and
// pick a server, because the only code that could write guild configuration
// sat behind a per-guild OAuth permission check. The Muragoods owner — who
// owns the bot — was therefore made to prove they held Manage Server on every
// server they own. Discord says nothing about who owns Muragoods, so that
// check was simply wrong for this audience.
//
// Here the OWNER is authorized by Muragoods authority alone, and the guild id
// is still validated and still written to the one canonical store. What is
// deliberately NOT bypassed: the bridge secret, Discord's API, and any action
// Discord itself enforces (role hierarchy for a role action, for example).
// Global configuration and per-guild configuration both go through Murabot's
// own bridge, so there is one canonical value — never a dashboard copy and an
// admin copy of the same setting.
// ─────────────────────────────────────────────────────────────────────────

function bridgeSecret(): string | null {
  return process.env.DISCORD_BRIDGE_SECRET || null;
}

function botBase(): string {
  return process.env.BOT_HEALTH_URL?.replace(/\/health$/, '')
    || 'https://murastream-bot-pf11.onrender.com';
}

/** Bounded bridge call. Reports what happened instead of pretending. */
async function bridge(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; ms: number; body: unknown; error?: string }> {
  const secret = bridgeSecret();
  if (!secret) {
    return { ok: false, status: 0, ms: 0, body: null, error: 'BRIDGE_NOT_CONFIGURED' };
  }
  const { timeoutMs = 5000, ...rest } = init;
  const started = Date.now();
  try {
    const resp = await fetch(`${botBase()}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        ...(rest.headers || {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, ms: Date.now() - started, body };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - started, body: null, error: 'BRIDGE_UNREACHABLE' };
  }
}

/**
 * GET — Murabot state, commands, guild inventory, configuration source.
 * With ?guildId=… it returns that server's canonical configuration instead.
 */
export async function GET(req: Request) {
  // Owner for administration; technical staff may READ this surface.
  const guard = await requireStaff(req, ['technical']);
  if (!guard.ok) return guard.response;

  const guildId = new URL(req.url).searchParams.get('guildId');

  // One canonical configuration, read straight from the store Murabot reads.
  if (guildId) {
    if (!/^\d{5,25}$/.test(guildId)) {
      return NextResponse.json({ success: false, error: 'Valid guildId required', code: 'INVALID_GUILD_ID' }, { status: 400 });
    }
    const [config, prefix, botPrefix] = await Promise.all([
      readGuildConfig(guildId),
      readGuildPrefix(guildId),
      verifyGuildPrefixWithBot(guildId),
    ]);
    return NextResponse.json({
      success: true,
      guildId,
      prefix,
      config,
      bot: { confirmed: botPrefix.confirmed, prefix: botPrefix.prefix, reason: botPrefix.reason ?? null },
      readOnly: guard.access.level !== 'muragoods_owner',
    });
  }

  const bot = await botStatus().catch(() => null);
  const bridgeOk = bridgeSecret() !== null;

  let commands: unknown = null;
  let commandsState = 'NOT_CONFIGURED' as string;
  if (bridgeOk) {
    const r = await bridge('/bot/commands');
    commandsState = r.ok ? 'ONLINE' : r.error === 'BRIDGE_UNREACHABLE' ? 'OFFLINE' : r.status === 401 ? 'UNAUTHORIZED' : 'DEGRADED';
    if (r.ok) commands = r.body;
  }

  return NextResponse.json({
    success: true,
    // The one canonical configuration, stated explicitly so nobody asks
    // "which of these is the real prefix?" ever again.
    configurationSource: {
      owner: 'Murabot guild configuration',
      store: "the site's guild_config collection (canonical)",
      readBy: 'Murabot command handlers',
      editedBy: ['Discord dashboard', 'Muragoods Admin Panel'],
      verifiedBy: 'Murabot, over the bridge, after every write',
    },
    bridge: {
      configured: bridgeOk,
      base: botBase(),
      reachable: bot?.error === null ? true : bridgeOk ? false : null,
    },
    bot: bot
      ? {
        online: bot.online,
        state: bot.state,
        latencyMs: bot.latencyMs,
        uptimeSeconds: bot.uptimeSeconds,
        heartbeatAgeSeconds: bot.heartbeatAgeSeconds,
        reconnectCount: bot.reconnectCount,
        guildCount: bot.guildIds.length,
        botUserId: bot.botUserId,
        error: bot.error,
      }
      : null,
    commands: { state: commandsState, data: commands },
    readOnly: guard.access.level !== 'muragoods_owner',
  });
}

/**
 * PATCH — write canonical Murabot configuration.
 *
 * Body: { guildId, prefix?, fields? }
 *
 * Both surfaces (dashboard and admin) funnel through app/lib/murabot-config,
 * so a value set here and a value set in Discord's dashboard are the SAME
 * value in the SAME place. The response distinguishes "stored" from "live".
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireOwner(req);
  if (!guard.ok) return guard.response;

  let body: { guildId?: string; prefix?: string; fields?: Record<string, unknown> };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const guildId = String(body.guildId || '');
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Valid guildId required', code: 'INVALID_GUILD_ID' }, { status: 400 });
  }

  if (typeof body.prefix === 'string') {
    // Validation happens BEFORE the write so a malformed prefix is reported as
    // a client error (400), not as a failed save (503). A 503 here would tell
    // the operator to retry something that can never succeed, and would make a
    // typo indistinguishable from the database being down.
    const valid = validatePrefix(body.prefix);
    if (!valid.ok) {
      return NextResponse.json(
        { success: false, saved: false, code: 'INVALID_PREFIX', error: valid.error, field: 'prefix' },
        { status: 400 },
      );
    }
    const result = await saveGuildPrefix(guildId, valid.value);
    if (!result.ok) {
      // The prefix passed validation and the guild id is well-formed, so a
      // failure here really is a failed write — and it is retryable.
      return NextResponse.json(
        { success: false, saved: false, code: 'SAVE_FAILED', error: result.message, retryable: true },
        { status: 503 },
      );
    }
    return NextResponse.json({
      success: true,
      saved: true,
      guildId,
      prefix: result.value,
      propagation: result.propagation,
      appliedInDiscord: result.propagation === 'applied',
      message: result.propagation === 'applied'
        ? 'Prefix saved and applied in Discord.'
        : result.message,
      by: { userId: guard.access.userId, email: guard.access.email },
    });
  }

  if (body.fields && typeof body.fields === 'object') {
    // Only a small, explicitly-listed set of top-level guild settings is
    // writable here. Module bodies are validated by the dashboard's own
    // schema; letting an arbitrary object through would create a second
    // writer for configuration that already has one.
    const ALLOWED = ['welcome', 'tickets', 'notifications', 'community'];
    const fields: Record<string, unknown> = {};
    const rejected: string[] = [];
    for (const [k, v] of Object.entries(body.fields)) {
      if (ALLOWED.includes(k) && v && typeof v === 'object') fields[k] = v;
      else rejected.push(k);
    }
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({
        success: false,
        error: `No writable section supplied. Allowed: ${ALLOWED.join(', ')}.`,
        code: 'NO_WRITABLE_FIELDS',
      }, { status: 400 });
    }
    const written = await writeGuildConfigFields(guildId, fields);
    if (!written.ok) {
      return NextResponse.json({ success: false, saved: false, error: written.error }, { status: 503 });
    }
    const push = await pushGuildConfigToBot(guildId, fields);
    return NextResponse.json({
      success: true,
      saved: true,
      guildId,
      sections: Object.keys(fields),
      rejected,
      // Same honesty as the dashboard: stored is not the same claim as live.
      propagation: push.notified ? 'applied' : 'pending',
      message: push.notified
        ? 'Stored canonically and pushed to Murabot.'
        : 'Stored canonically. Murabot did not confirm the push yet; it will pick it up '
          + 'on its next reload.',
      by: { userId: guard.access.userId, email: guard.access.email },
    });
  }

  return NextResponse.json({
    success: false,
    error: 'Provide either a prefix or a fields object.',
    code: 'INVALID_REQUEST',
  }, { status: 400 });
}
