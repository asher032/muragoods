import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';
import { verifyBotInGuild, botToken } from '@/app/lib/discord-bot';
import { apiFail, logApi } from '@/app/lib/dashboard-response';
import { SERVER_CARD_BACKGROUNDS, SERVER_CARD_DEFAULT } from '@/app/lib/server-card-backgrounds';

const SERVER_CARD_IDS = new Set(SERVER_CARD_BACKGROUNDS.map((b) => b.id));

// Dashboard config API — authorization model:
//   1. The caller presents a Discord access token (from the OAuth flow).
//   2. We fetch their guilds from Discord and verify they have MANAGE_GUILD
//      (0x20) or ADMINISTRATOR (0x8) on the requested guild.
//   3. Only then do we read/write that guild's bot config.
// The dashboard's session cookie alone never grants access here.

export const dynamic = 'force-dynamic';

interface DashGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | number;
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
  // Shared cached guard: one Discord guild-list read per 30s per token across
  // ALL dashboard routes. The old inline fetch ran uncached on every call and
  // turned rate limits/outages into a false "sign in again" 401.
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    return { ok: false, status: check.status, code: check.code, error: check.error };
  }
  return { ok: true, guild: check.guild };
}

/** Is the bot installed on this guild? Tri-state via the shared helper:
 *  true = verified member, false = real Discord 404, null = unverifiable
 *  (no token / rejected credential / rate limit / challenged network).
 *  Only `false` may ever gate a save or an invite prompt. */
async function botInstalled(guildId: string): Promise<boolean | null> {
  const presence = await verifyBotInGuild(guildId);
  return presence === 'installed' ? true : presence === 'absent' ? false : null;
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
  const started = Date.now();
  try {
    const token = (await sessionToken());
    const guildId = req.nextUrl.searchParams.get('guildId') || '';
    const auth = await authorize(token, guildId);
    if (!auth.ok) {
      logApi('/api/dashboard/config', 'GET', auth.status, Date.now() - started, auth.code);
      return bad(auth.error, auth.status, auth.code);
    }
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
    logApi('/api/dashboard/config', 'GET', 200, Date.now() - started);
    return NextResponse.json({
      success: true,
      guild: { id: guild.id, name: guild.name, icon: guild.icon },
      config,
      bot: { installed },
    });
  } catch {
    // Never leak HTML: DB/Discord throws resolve to a retryable JSON error.
    logApi('/api/dashboard/config', 'GET', 502, Date.now() - started, 'DATABASE_ERROR');
    return apiFail(
      'DATABASE_ERROR',
      'Configuration could not be loaded — retry in a moment.',
      502,
      { retryable: true },
    );
  }
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
  if (safe.leveling && typeof safe.leveling === 'object') {
    const l = safe.leveling as Record<string, unknown>;
    const num = (v: unknown, lo: number, hi: number, fb: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : fb;
    };
    const str25 = (v: unknown) => String(v || '').slice(0, 25);
    const rewards: Record<string, string> = {};
    const rawRewards = (l.rewards && typeof l.rewards === 'object' ? l.rewards : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(rawRewards).slice(0, 100)) {
      if (/^\d{1,3}$/.test(k) && /^\d{5,25}$/.test(String(v || ''))) rewards[k] = String(v);
    }
    // Legacy dashboard role fields map onto the same rewards dict.
    for (const n of ['5', '10', '25', '50', '100']) {
      const v = String((l as Record<string, unknown>)[`reward${n}`] || '');
      if (/^\d{5,25}$/.test(v)) rewards[n] = v;
    }
    update.leveling = {
      xpMin: num(l.xpMin, 1, 100, 15),
      xpMax: num(l.xpMax, 1, 100, 25),
      xpCooldownSec: num(l.xpCooldownSec, 5, 3600, 60),
      voiceXp: Boolean(l.voiceXp),
      voiceXpAmount: num(l.voiceXpAmount, 1, 500, 10),
      blacklistedChannels: Array.isArray(l.blacklistedChannels)
        ? l.blacklistedChannels.filter((s) => /^\d{5,25}$/.test(String(s))).map(String).slice(0, 100) : [],
      blacklistedRoles: Array.isArray(l.blacklistedRoles)
        ? l.blacklistedRoles.filter((s) => /^\d{5,25}$/.test(String(s))).map(String).slice(0, 100) : [],
      levelUpChannelId: str25(l.levelUpChannelId),
      levelUpMessage: String(l.levelUpMessage || '').slice(0, 300),
      dmNotify: Boolean(l.dmNotify),
      rewardReplace: l.rewardReplace !== false,
      announceMinLevel: num(l.announceMinLevel, 1, 100, 1),
      announceMod: num(l.announceMod, 0, 100, 0),
      rewardOnly: Boolean(l.rewardOnly),
      cardColor: /^#[0-9a-fA-F]{6}$/.test(String(l.cardColor || '')) ? String(l.cardColor) : '#5865F2',
      cardOpacity: Math.max(0, Math.min(1, Number(l.cardOpacity ?? 1) || 0)),
      serverBackground: SERVER_CARD_IDS.has(String(l.serverBackground || ''))
        ? String(l.serverBackground)
        : SERVER_CARD_DEFAULT,
      rewards,
    };
  }
  if (safe.economy && typeof safe.economy === 'object') {
    const e = safe.economy as Record<string, unknown>;
    const num = (v: unknown, lo: number, hi: number, fb: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : fb;
    };
    update.economy = {
      currencyName: String(e.currencyName || 'coins').slice(0, 20),
      currencySymbol: String(e.currencySymbol || '🪙').slice(0, 8),
      startBalance: num(e.startBalance, 0, 100000, 100),
      dailyAmount: num(e.dailyAmount, 0, 100000, 250),
      weeklyAmount: num(e.weeklyAmount, 0, 500000, 1500),
      monthlyAmount: num(e.monthlyAmount, 0, 2000000, 6000),
      workMin: num(e.workMin, 0, 100000, 50),
      workMax: num(e.workMax, 0, 100000, 300),
      gambleMax: num(e.gambleMax, 10, 1000000, 10000),
      workCooldownSec: num(e.workCooldownSec, 60, 86400, 3600),
      begCooldownSec: num(e.begCooldownSec, 30, 86400, 300),
      lotteryTicketPrice: num(e.lotteryTicketPrice, 1, 100000, 100),
      disabledItems: Array.isArray(e.disabledItems)
        ? e.disabledItems.map((s) => String(s).slice(0, 40)).slice(0, 50) : [],
    };
  }

  const collection = await discordConfigCollection();

  // Server-side resource verification: every selected channel/category/role
  // must exist in THIS guild and be usable by the bot — a forged guildId or
  // a foreign ID is rejected here, never stored.
  const bToken = botToken();
  const idFields = collectIdFields(update as Record<string, unknown>);
  if (idFields.length > 0) {
    if (!bToken) {
      return bad('The bot cannot verify these server settings right now (bot token not configured). Try again later.', 503);
    }
    const check = await loadBotCheck(guildId, bToken);
    if (!check) {
      return bad('Discord did not answer the verification check — the bot may be unreachable or rate-limited. Wait a moment and try saving again.', 502);
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
        if (!(await memberInGuild(guildId, value, bToken))) {
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
