import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import DiscordGuildConfig from '@/app/lib/models/DiscordGuildConfig';

// Dashboard config API — authorization model:
//   1. The caller presents a Discord access token (from the OAuth flow).
//   2. We fetch their guilds from Discord and verify they have MANAGE_GUILD
//      (0x20) or ADMINISTRATOR (0x8) on the requested guild.
//   3. Only then do we read/write that guild's bot config.
// The dashboard's session cookie alone never grants access here.

export const dynamic = 'force-dynamic';

const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;

interface DashGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | number;
}

function hasManage(perms: string | number): boolean {
  const p = typeof perms === 'string' ? Number(BigInt(perms)) : perms;
  return Boolean((p & MANAGE_GUILD) || (p & ADMINISTRATOR));
}

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function getManageableGuilds(accessToken: string): Promise<Map<string, DashGuild>> {
  const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });
  if (!resp.ok) return new Map();
  const guilds = (await resp.json()) as DashGuild[];
  return new Map(guilds.filter((g) => hasManage(g.permissions)).map((g) => [g.id, g]));
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return bad('Discord token required', 401);
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required');

  const manageable = await getManageableGuilds(token);
  const guild = manageable.get(guildId);
  if (!guild) return bad('You do not have permission to manage this server', 403);

  await dbConnect();
  let config = await DiscordGuildConfig.findOne({ guildId }).lean();
  if (!config) {
    config = { guildId, guildName: guild.name, guildIcon: guild.icon || '' };
  }
  return NextResponse.json({
    success: true,
    guild: { id: guild.id, name: guild.name, icon: guild.icon },
    config,
  });
}

export async function PATCH(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  if (!token) return bad('Discord token required', 401);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return bad('Invalid JSON body');
  const guildId = String((body as Record<string, unknown>).guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required');

  const manageable = await getManageableGuilds(token);
  const guild = manageable.get(guildId);
  if (!guild) return bad('You do not have permission to manage this server', 403);

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
    update.music = {
      djRoleId: String(m.djRoleId || '').slice(0, 25),
      musicChannelId: String(m.musicChannelId || '').slice(0, 25),
      controlMode: ['everyone', 'dj', 'moderators'].includes(String(m.controlMode))
        ? String(m.controlMode) : 'everyone',
      defaultVolume: Math.max(1, Math.min(150, Number(m.defaultVolume) || 50)),
    };
  }
  if (safe.moderation && typeof safe.moderation === 'object') {
    const m = safe.moderation;
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

  await dbConnect();
  await DiscordGuildConfig.findOneAndUpdate({ guildId }, update, { upsert: true });

  // Audit trail: who changed what (actor = Discord user id from token).
  try {
    const meResp = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    let actor = 'unknown';
    if (meResp.ok) {
      const me = (await meResp.json()) as { id?: string; username?: string };
      actor = me.username ? `${me.username} (${me.id})` : actor;
    }
    const { auditConfigChange } = await import('@/app/lib/dashboard-audit');
    await auditConfigChange(guildId, actor, 'Updated bot settings via dashboard');
  } catch {
    // Audit is best-effort; the config write already succeeded.
  }
  return NextResponse.json({ success: true });
}
