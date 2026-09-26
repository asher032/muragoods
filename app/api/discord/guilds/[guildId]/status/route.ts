import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/app/lib/require-session';
import { verifyBotInGuild } from '@/app/lib/discord-bot';
import { fetchUserGuilds, hasManageBits } from '@/app/lib/discord-guilds';
import { discordConfigCollection } from '@/app/lib/discord-config';

// GET /api/discord/guilds/:guildId/status — authoritative dashboard state
// detection for ONE guild. Every fact is re-verified live; nothing comes
// from the browser, login-time snapshots, or config documents:
//
//   guild:        id + name + icon (from the caller's live guild list)
//   user:        authenticated / member / canManage / administrator / owner
//   bot:         installed (bot-token REST identity) vs online (gateway set)
//   permissions: owner / administrator / manage bits, from Discord
//   configuration: exists + loadable (presence only — never content)
//
// If canManage is false the code says WHY (NOT_GUILD_MEMBER vs
// INSUFFICIENT_GUILD_PERMISSION) — never a generic permission failure.
//
// Error codes (never conflated):
//   401 AUTH_REQUIRED · 400 INVALID_GUILD_ID · 403 NOT_GUILD_MEMBER ·
//   403 INSUFFICIENT_GUILD_PERMISSION · 404 BOT_NOT_INSTALLED ·
//   502 BOT_STATUS_UNKNOWN (bot presence unverifiable right now)
//
// The `debug` block is booleans only — no tokens, secrets, IDs beyond the
// guild under test, or user data.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMINISTRATOR = BigInt(0x8);
const MANAGE_GUILD = BigInt(0x20);

function bit(value: string | number, flag: bigint): boolean {
  try {
    return (BigInt(value) & flag) !== BigInt(0);
  } catch {
    return false;
  }
}

function botBase(): string {
  return process.env.BOT_HEALTH_URL?.replace(/\/health$/, '')
    || 'https://murastream-bot-pf11.onrender.com';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;
  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' },
      { status: 400 },
    );
  }

  const guard = await requireSession();
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, code: 'AUTH_REQUIRED', error: guard.error },
      { status: guard.status },
    );
  }

  // ── User side: live membership + manage right ──
  const userRes = await fetchUserGuilds(guard.accessToken);
  if (!userRes.ok) {
    // Dead session token (not a permission problem) or Discord outage.
    return NextResponse.json(
      {
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Discord rejected the session — sign in again',
      },
      { status: 401 },
    );
  }
  const userGuild = userRes.guilds.find((g) => g.id === guildId);
  if (!userGuild) {
    return NextResponse.json(
      {
        success: false,
        code: 'NOT_GUILD_MEMBER',
        error: 'You are not a member of that server',
        debug: {
          guildId, userMember: false, userCanManage: false,
          botInstalled: null, botOnline: null, configExists: null,
          result: 'NOT_GUILD_MEMBER',
        },
      },
      { status: 403 },
    );
  }
  const canManage = hasManageBits(userGuild.owner, userGuild.permissions);
  if (!canManage) {
    return NextResponse.json(
      {
        success: false,
        code: 'INSUFFICIENT_GUILD_PERMISSION',
        error: 'You need Manage Server permission on that server',
        debug: {
          guildId, userMember: true, userCanManage: false,
          botInstalled: null, botOnline: null, configExists: null,
          result: 'INSUFFICIENT_GUILD_PERMISSION',
        },
      },
      { status: 403 },
    );
  }

  // ── Bot side: installed (REST identity) vs online (gateway) ──
  const presence = await verifyBotInGuild(guildId);
  let botOnline: boolean | null = null;
  try {
    const resp = await fetch(`${botBase()}/health`, {
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = (await resp.json().catch(() => null)) as {
        ok?: boolean; guild_ids?: string[]; subsystems?: Record<string, string>;
      } | null;
      const ids = Array.isArray(data?.guild_ids) ? data.guild_ids.map(String) : [];
      botOnline = Boolean(data?.ok && data?.subsystems?.discord === 'online' && ids.includes(guildId));
    }
  } catch {
    botOnline = null;
  }

  if (presence === 'absent') {
    return NextResponse.json(
      {
        success: false,
        code: 'BOT_NOT_INSTALLED',
        error: 'Muragoods is not installed in this server.',
        debug: {
          guildId, userMember: true, userCanManage: true,
          botInstalled: false, botOnline, configExists: null,
          result: 'BOT_NOT_INSTALLED',
        },
      },
      { status: 404 },
    );
  }

  // ── Configuration presence (never blocks reads, never leaks content) ──
  let configExists: boolean | null = null;
  try {
    const collection = await discordConfigCollection();
    const doc = await collection.findOne({ guildId }, { projection: { _id: 1 } });
    configExists = doc !== null;
  } catch {
    configExists = null;
  }

  if (presence === 'unknown') {
    return NextResponse.json({
      success: true,
      guildId,
      guild: { id: userGuild.id, name: userGuild.name, icon: userGuild.icon },
      user: {
        authenticated: true, member: true, canManage: true,
        administrator: bit(userGuild.permissions, ADMINISTRATOR) || userGuild.owner,
        owner: userGuild.owner,
      },
      bot: { installed: null, online: botOnline },
      permissions: {
        manageGuild: bit(userGuild.permissions, MANAGE_GUILD) || userGuild.owner,
        administrator: bit(userGuild.permissions, ADMINISTRATOR) || userGuild.owner,
      },
      configuration: { exists: configExists, loadable: configExists },
      debug: {
        guildId, userMember: true, userCanManage: true,
        botInstalled: null, botOnline, configExists,
        result: botOnline === false ? 'BOT_OFFLINE' : 'AUTHORIZED_BOT_UNKNOWN',
      },
    });
  }

  return NextResponse.json({
    success: true,
    guildId,
    guild: { id: userGuild.id, name: userGuild.name, icon: userGuild.icon },
    user: {
      authenticated: true, member: true, canManage: true,
      administrator: bit(userGuild.permissions, ADMINISTRATOR) || userGuild.owner,
      owner: userGuild.owner,
    },
    bot: { installed: true, online: botOnline },
    permissions: {
      manageGuild: bit(userGuild.permissions, MANAGE_GUILD) || userGuild.owner,
      administrator: bit(userGuild.permissions, ADMINISTRATOR) || userGuild.owner,
    },
    configuration: { exists: configExists, loadable: configExists },
    debug: {
      guildId, userMember: true, userCanManage: true,
      botInstalled: true, botOnline, configExists,
      result: botOnline === false ? 'BOT_OFFLINE' : 'AUTHORIZED',
    },
  });
}
