import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

// Dashboard config API — authorization model:
//   1. The caller presents a Discord access token (from the OAuth flow).
//   2. We fetch their guilds from Discord and verify they have MANAGE_GUILD
//      (0x20) or ADMINISTRATOR (0x8) on the requested guild.
//   3. Only then do we read/write that guild's bot config.
// The dashboard's session cookie alone never grants access here.

export const dynamic = 'force-dynamic';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

interface DashGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | number;
}

function hasManage(owner: boolean, perms: string | number): boolean {
  if (owner) return true;
  const p = BigInt(perms);
  return (p & MANAGE_GUILD) !== BigInt(0) || (p & ADMINISTRATOR) !== BigInt(0);
}

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, ...(code ? { code } : {}) },
    { status },
  );
}

// Structured authorization outcomes — the dashboard renders a distinct state
// per code instead of one generic "not allowed". A 403 never claims the bot
// is missing when the real problem is the caller's permission, and PATCH
// refuses to store settings for a server the bot is not installed on.
type Authz =
  | { ok: true; guild: DashGuild }
  | { ok: false; status: number; code: string; error: string };

async function authorize(token: string | null, guildId: string): Promise<Authz> {
  if (!token) {
    return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Sign in with Discord to continue' };
  }
  if (!guildId || !SNOWFLAKE.test(guildId)) {
    return { ok: false, status: 400, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' };
  }
  const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
  if (!resp.ok) {
    return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Discord rejected the session — sign in again' };
  }
  const guilds = (await resp.json()) as DashGuild[];
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) {
    return { ok: false, status: 403, code: 'NOT_GUILD_MEMBER', error: 'You are not a member of that server' };
  }
  if (!hasManage(guild.owner, guild.permissions)) {
    return { ok: false, status: 403, code: 'INSUFFICIENT_GUILD_PERMISSION', error: 'You need Manage Server permission on that server' };
  }
  return { ok: true, guild };
}

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN?.trim() || process.env.DISCORD_TOKEN?.trim() || null;
}

/** Is the bot installed on this guild (Discord API, bot token)? null = unknown. */
async function botInstalled(guildId: string): Promise<boolean | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const resp = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 404 || resp.status === 403) return false;
    if (!resp.ok) return null;
    return true;
  } catch {
    return null;
  }
}

// ── Server-side resource verification (§22) ──────────────────────────────
// The dashboard validates selections client-side before saving, but a forged
// PATCH must not store another guild's (or a nonexistent) channel/role.
// Every snowflake-valued *Id field is re-verified against the Discord API
// with the bot token: existence, same-guild belonging, and — for roles —
// hierarchy (the bot must actually be able to manage the role). Friendly
// field names in errors; raw IDs never echoed.
const SNOWFLAKE = /^\d{5,25}$/;

interface BotCheck {
  channels: Map<string, { guild_id?: string; type?: number; name?: string }>;
  roles: Map<string, { name: string; managed: boolean; position: number }>;
  botRoleIds: string[];
  botIsAdmin: boolean;
  botTopPosition: number;
}

async function loadBotCheck(guildId: string, botToken: string): Promise<BotCheck | null> {
  try {
    const [channelsRes, rolesRes, memberRes] = await Promise.all([
      fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${botToken}` }, cache: 'no-store',
      }),
      fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${botToken}` }, cache: 'no-store',
      }),
      fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
        headers: { Authorization: `Bot ${botToken}` }, cache: 'no-store',
      }),
    ]);
    if (!channelsRes.ok || !rolesRes.ok || !memberRes.ok) return null;
    const channels = (await channelsRes.json()) as Array<{ id: string; guild_id?: string; type?: number; name?: string }>;
    const roles = (await rolesRes.json()) as Array<{ id: string; name: string; managed: boolean; position: number; permissions: string }>;
    const member = (await memberRes.json()) as { roles: string[] };
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const botRoleIds: string[] = Array.isArray(member.roles) ? member.roles : [];
    let botIsAdmin = false;
    let botTopPosition = 0;
    for (const rid of botRoleIds) {
      const r = roleById.get(rid);
      if (!r) continue;
      try {
        if ((BigInt(r.permissions) & BigInt(0x8)) !== BigInt(0)) botIsAdmin = true;
      } catch { /* ignore */ }
      if (r.position > botTopPosition) botTopPosition = r.position;
    }
    return {
      channels: new Map(channels.map((c) => [c.id, c])),
      roles: new Map(roles.map((r) => [r.id, r])),
      botRoleIds,
      botIsAdmin,
      botTopPosition,
    };
  } catch {
    return null;
  }
}

async function memberInGuild(guildId: string, userId: string, botToken: string): Promise<boolean> {
  try {
    const resp = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` }, cache: 'no-store',
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function collectIdFields(update: Record<string, unknown>): Array<{ section: string; field: string; value: string }> {
  const out: Array<{ section: string; field: string; value: string }> = [];
  for (const [section, val] of Object.entries(update)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    for (const [field, fval] of Object.entries(val as Record<string, unknown>)) {
      if (/(Channel|Category|Role|Member|User)Id$/.test(field) && typeof fval === 'string' && SNOWFLAKE.test(fval)) {
        out.push({ section, field, value: fval });
      }
    }
  }
  return out;
}

function friendlyField(section: string, field: string): string {
  return field
    .replace(/Id$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const auth = await authorize(token, guildId);
  if (!auth.ok) return bad(auth.error, auth.status, auth.code);
  const guild = auth.guild;

  const collection = await discordConfigCollection();
  const config = await collection.findOne({ guildId }) || {
    guildId,
    guildName: guild.name,
    guildIcon: guild.icon || '',
  };
  // Bot presence rides along (never blocks a read — settings remain
  // viewable while the bot is away); null = could not be determined.
  const installed = await botInstalled(guildId);
  return NextResponse.json({
    success: true,
    guild: { id: guild.id, name: guild.name, icon: guild.icon },
    config,
    bot: { installed },
  });
}

export async function PATCH(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return bad('Invalid JSON body');
  const guildId = String((body as Record<string, unknown>).guildId || '');
  const auth = await authorize(token, guildId);
  if (!auth.ok) return bad(auth.error, auth.status, auth.code);
  const guild = auth.guild;

  // Storing settings for a server without the bot serves nothing and hides
  // misconfiguration — refuse with the precise state, not a generic 403.
  const installed = await botInstalled(guildId);
  if (installed === false) {
    return bad('The bot is not installed on this server. Invite it first — settings apply once it joins.',
      404, 'BOT_NOT_INSTALLED');
  }

  const patch = (body as Record<string, unknown>).config;
  if (!patch || typeof patch !== 'object') return bad('config object required');
  const safe = patch as Record<string, Record<string, unknown>>;

  // Whitelist updatable sections with type coercion + bounds.
  const update: Record<string, unknown> = {
    guildName: guild.name,
    guildIcon: guild.icon || '',
    updatedAt: new Date(),
  };
  if (safe.modules && typeof safe.modules === 'object') {
    update.modules = Object.fromEntries(
      Object.entries(safe.modules).slice(0, 16).map(([k, v]) => [k.slice(0, 30), Boolean(v)]),
    );
  }
  if (safe.securitySettings && typeof safe.securitySettings === 'object') {
    const s = safe.securitySettings;
    update.securitySettings = {
      antiRaidEnabled: Boolean(s.antiRaidEnabled),
      joinSpikeThreshold: Math.max(3, Math.min(50, Number(s.joinSpikeThreshold) || 8)),
      antiNukeEnabled: Boolean(s.antiNukeEnabled),
      minAccountAgeHours: Math.max(0, Math.min(168, Number(s.minAccountAgeHours) || 24)),
    };
  }
  if (safe.community && typeof safe.community === 'object') {
    const c = safe.community;
    update.community = {
      giveawayChannelId: String(c.giveawayChannelId || '').slice(0, 25),
      suggestionChannelId: String(c.suggestionChannelId || '').slice(0, 25),
      reportChannelId: String(c.reportChannelId || '').slice(0, 25),
    };
  }
  if (safe.music && typeof safe.music === 'object') {
    const m = safe.music;
    const rawFilters = Array.isArray(m.filters) ? m.filters : [];
    const FILTERS = ['bassboost', 'nightcore', 'vaporwave', '8d', 'karaoke', 'tremolo'];
    update.music = {
      djRoleId: String(m.djRoleId || '').slice(0, 25),
      musicChannelId: String(m.musicChannelId || '').slice(0, 25),
      voiceChannelId: String(m.voiceChannelId || '').slice(0, 25),
      textChannelId: String(m.textChannelId || '').slice(0, 25),
      nowPlayingChannelId: String(m.nowPlayingChannelId || '').slice(0, 25),
      commandsChannelId: String(m.commandsChannelId || '').slice(0, 25),
      musicLogsChannelId: String(m.musicLogsChannelId || '').slice(0, 25),
      djOnlyMode: Boolean(m.djOnlyMode),
      voiceChannelRequired: m.voiceChannelRequired !== false,
      enableNowPlayingEmbed: m.enableNowPlayingEmbed !== false,
      enableQueueEmbed: m.enableQueueEmbed !== false,
      enableMusicButtons: m.enableMusicButtons !== false,
      controlMode: ['everyone', 'dj', 'moderators'].includes(String(m.controlMode))
        ? String(m.controlMode) : 'everyone',
      defaultVolume: Math.max(1, Math.min(150, Number(m.defaultVolume) || 50)),
      maxVolume: Math.max(10, Math.min(150, Number(m.maxVolume) || 150)),
      maxQueueSize: Math.max(1, Math.min(500, Number(m.maxQueueSize) || 100)),
      defaultLoop: ['off', 'track', 'queue'].includes(String(m.defaultLoop))
        ? String(m.defaultLoop) : 'off',
      filters: rawFilters.filter((f) => FILTERS.includes(String(f))).slice(0, 3),
      twentyFourSeven: Boolean(m.twentyFourSeven),
      autoPlay: Boolean(m.autoPlay),
      autoLeave: Boolean(m.autoLeave),
      enableNowPlaying: m.enableNowPlaying !== false,
    };
  }
  if (safe.moderation && typeof safe.moderation === 'object') {
    const m = safe.moderation;
    const rawThresholds = Array.isArray(m.warnThresholds) ? m.warnThresholds : [];
    const warnThresholds = rawThresholds.slice(0, 5)
      .map((t) => {
        const r = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
        const count = Math.max(1, Math.min(100, Number(r.count) || 0));
        const action = ['timeout', 'kick', 'ban'].includes(String(r.action)) ? String(r.action) : 'timeout';
        const durationMinutes = Math.max(1, Math.min(40320, Number(r.durationMinutes) || 60));
        return count ? { count, action, durationMinutes } : null;
      })
      .filter((t): t is { count: number; action: string; durationMinutes: number } => t !== null)
      .sort((a, b) => a.count - b.count);
    const dm = (m.dmNotifications && typeof m.dmNotifications === 'object'
      ? m.dmNotifications : {}) as Record<string, unknown>;
    update.moderation = {
      modRoleId: String(m.modRoleId || '').slice(0, 25),
      logChannelId: String(m.logChannelId || '').slice(0, 25),
      automodEnabled: Boolean(m.automodEnabled),
      antiSpam: Boolean(m.antiSpam),
      antiInvite: Boolean(m.antiInvite),
      antiLink: Boolean(m.antiLink),
      antiCaps: Boolean(m.antiCaps),
      capsThreshold: Math.max(10, Math.min(100, Number(m.capsThreshold) || 70)),
      mentionThreshold: Math.max(3, Math.min(50, Number(m.mentionThreshold) || 8)),
      escalation: Array.isArray(m.escalation)
        ? m.escalation.slice(0, 5).map((s) => String(s).slice(0, 20))
        : ['warn', 'timeout', 'timeout', 'kick', 'ban'],
      warnThresholds: warnThresholds.length ? warnThresholds : [{ count: 3, action: 'timeout', durationMinutes: 60 }],
      dmNotifications: {
        warn: dm.warn !== false,
        timeout: dm.timeout !== false,
        kick: dm.kick !== false,
        ban: dm.ban !== false,
      },
    };
  }
  if (safe.welcome && typeof safe.welcome === 'object') {
    const w = safe.welcome;
    update.welcome = {
      enabled: Boolean(w.enabled),
      channelId: String(w.channelId || '').slice(0, 25),
      message: String(w.message || '').slice(0, 500),
      autoRoleId: String(w.autoRoleId || '').slice(0, 25),
    };
  }
  if (safe.tickets && typeof safe.tickets === 'object') {
    update.tickets = {
      categoryId: String((safe.tickets as Record<string, unknown>).categoryId || '').slice(0, 25),
      supportRoleId: String((safe.tickets as Record<string, unknown>).supportRoleId || '').slice(0, 25),
    };
  }
  if (safe.notifications && typeof safe.notifications === 'object') {
    const n = safe.notifications;
    update.notifications = {
      channelId: String(n.channelId || '').slice(0, 25),
      newContent: Boolean(n.newContent),
      requestUpdates: Boolean(n.requestUpdates),
    };
  }

  const collection = await discordConfigCollection();

  // Server-side resource verification: every selected channel/category/role
  // must exist in THIS guild and be usable by the bot — a forged guildId or
  // a foreign ID is rejected here, never stored.
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || '';
  const idFields = collectIdFields(update as Record<string, unknown>);
  if (idFields.length > 0) {
    if (!botToken) {
      return bad('The bot cannot verify these server settings right now (bot token not configured). Try again later.', 503);
    }
    const check = await loadBotCheck(guildId, botToken);
    if (!check) {
      return bad('The bot cannot read this server right now. Check that it is still installed, then try again.', 502);
    }
    for (const { field, value } of idFields) {
      const label = friendlyField('', field);
      if (/ChannelId$/.test(field)) {
        const ch = check.channels.get(value);
        if (!ch || ch.guild_id !== guildId) {
          return bad(`${label} is no longer available on this server. Pick another channel.`);
        }
      } else if (/CategoryId$/.test(field)) {
        const ch = check.channels.get(value);
        if (!ch || ch.guild_id !== guildId || ch.type !== 4) {
          return bad(`${label} is no longer a category on this server. Pick another category.`);
        }
      } else if (/RoleId$/.test(field)) {
        const role = check.roles.get(value);
        if (!role || value === guildId) {
          return bad(`${label} is no longer available on this server. Pick another role.`);
        }
        if (role.managed) {
          return bad(`${role.name} is managed by an integration and cannot be used here.`);
        }
        if (!check.botIsAdmin && check.botTopPosition <= role.position) {
          return bad(
            `This role can't be managed by the bot — move the bot's role above ${role.name} in Discord's Server Settings → Roles, then save again.`,
            403,
          );
        }
      } else {
        // MemberId / UserId
        if (!(await memberInGuild(guildId, value, botToken))) {
          return bad(`${label} is no longer on this server. Pick another member.`);
        }
      }
    }
  }

  // Diff before writing so the audit trail records real before/after values.
  const existing = await collection.findOne({ guildId });
  const { diffConfigUpdate, auditConfigChange } = await import('@/app/lib/dashboard-audit');
  const changes = diffConfigUpdate(
    existing as Record<string, unknown> | null,
    update as Record<string, unknown>,
  );

  await collection.updateOne({ guildId }, { $set: update }, { upsert: true });

  // Push music settings to the bot host: the dashboard writes the SITE
  // database, but the player reads the BOT's guild_config store. Without
  // this push, DJ/volume/24/7 settings would silently never apply.
  // Best-effort — the site save already succeeded, and the bot re-reads
  // with a short TTL anyway.
  if (update.music && typeof update.music === 'object') {
    const secret = process.env.DISCORD_BRIDGE_SECRET || '';
    const botBase = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';
    if (secret) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        await fetch(`${botBase}/music/config/${guildId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ music: update.music }),
          signal: controller.signal,
        });
        clearTimeout(timer);
      } catch { /* bot offline — settings apply on next push/save */ }
    }
  }

  // Audit trail: who changed what (actor = Discord user from token).
  try {
    const meResp = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    let actor = 'unknown';
    if (meResp.ok) {
      const me = (await meResp.json()) as { id?: string; username?: string };
      actor = me.username ? `${me.username} (${me.id})` : actor;
    }
    const summary = changes.length
      ? `Updated ${changes.length} setting${changes.length === 1 ? '' : 's'}: ${changes.slice(0, 3).map((c) => `${c.section ? `${c.section}.` : ''}${c.field}`).join(', ')}${changes.length > 3 ? '…' : ''}`
      : 'Saved settings (no changes)';
    await auditConfigChange(guildId, actor, summary, changes);
  } catch {
    // Audit is best-effort; the config write already succeeded.
  }
  return NextResponse.json({ success: true });
}
