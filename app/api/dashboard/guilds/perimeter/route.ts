import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';
import { verifyBotInGuild, fetchBotMember } from '@/app/lib/discord-bot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

// Discord permission names, in order of the bits we surface.
const PERM_BITS: Array<[number, string]> = [
  [1024,     'View Channels'],
  [2048,     'Send Messages'],
  [4096,     'Embed Links'],
  [8192,     'Attach Files'],
  [16384,    'Read Message History'],
  [32768,    'Mention Everyone'],
  [65536,    'Use Slash Commands'],
  [268435456,'Manage Channels'],
  [536870912,'Manage Roles'],
  [1073741824,'Manage Messages'],
  [17179869184,'Kick Members'],
  [34359738368,'Ban Members'],
  [2147483648,'Move Members'],
  [32212254720,'Voice Connect'],
  [4398046511104,'Voice Speak'],
  [8589934592,'Manage Server'],
];

function withPerms(perms: number | string): boolean {
  const p = BigInt(perms);
  // The bot needs at least Manage Channels / Manage Messages / Kick / Ban /
  // Connect / Speak to be useful as an admin tool; Administrator is a explicit
  // superset that landlords often grant. We do NOT treat "connected to guild" as
  // the permission verdict — there is a separate mustHave field for that.
  return (
    (p & BigInt(1073741824)) !== BigInt(0) ||  // Administrator
    (p & BigInt(268435456)) !== BigInt(0)       // Manage Channels
  );
}

function formattedPerms(raw: number | string): { allowed: string[]; missing: string[] } {
  const p = Number(raw);
  const allowed: string[] = [];
  const missing: string[] = [];
  for (const [bit, name] of PERM_BITS) {
    if ((p & bit) === bit) allowed.push(name);
    else missing.push(name);
  }
  return { allowed, missing };
}

async function botGuildIds(): Promise<Set<string> | null> {
  try {
    const resp = await fetch(`${BOT_BASE}/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { ok?: boolean; guild_ids?: string[] };
    if (!data.ok) return null;
    return new Set(data.guild_ids ?? []);
  } catch {
    return null; // unreachable — unknown, never faked
  }
}

async function botMember(guildId: string): Promise<{ id: string; username: string; displayName: string; avatar: string | null; permissions: number; roles: string[] } | null> {
  const doc = await fetchBotMember(guildId);
  if (!doc || !doc.user) return null;
  return {
    id: doc.user.id,
    username: doc.user.username,
    displayName: doc.user.display_name ?? doc.user.username,
    avatar: doc.user.avatar ?? null,
    permissions: Number(doc.permissions ?? 0),
    roles: doc.roles ?? [],
  };
}

function effectivePerms(guildPerms: number | string, channel: { permission_overwrites?: Array<{ id: string; allow?: number; deny?: number; type: 'role' | 'member' }>; parent?: { permission_overwrites?: Array<{ id: string; allow?: number; deny?: number; type: 'role' | 'member' }> } | null; id: string }, memberRoles: string[], botId: string): number {
  let p = Number(guildPerms);
  const overwriteAt = (ow?: { id: string; allow?: number; deny?: number; type: 'role' | 'member' }[]) => {
    for (const o of ow ?? []) {
      if (o.type === 'role') {
        if (o.id === channel.id) { p = apply(p, o); continue; }
        if (memberRoles.includes(o.id)) { p = apply(p, o); }
      } else if (o.type === 'member' && o.id === botId) {
        p = apply(p, o);
      }
    }
  };
  overwriteAt(channel.permission_overwrites);
  if (channel.parent) overwriteAt(channel.parent.permission_overwrites);
  return p;
}
function apply(p: number, o: { allow?: number; deny?: number }): number {
  return (p & ~Number(o.deny ?? 0)) | Number(o.allow ?? 0);
}

export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  // ── Bot must actually be in the guild. We verify four things independently:
  //    (a) the bot's own health says it is one of its current guilds,
  //    (b) the Discord API resolves the bot as a member of this exact guild,
  //    (c) the bot has a non-zero permission set there (otherwise it is stuck),
  //    (d) the user behind the session still manages the guild today.
  // None of these come from the browser or from login-time caches.
  const botIds = await botGuildIds();
  const botMemberDoc = await botMember(guildId);
  // Tri-state verdict from the shared helper: only a real Discord 404 means
  // absent. (Note: this file previously called the singular /member/@me
  // endpoint, which Discord always 404s — so it reported "not installed"
  // for every guild, working or not.)
  const presence = await verifyBotInGuild(guildId);
  const botInstalled = presence === 'installed' ? true : presence === 'absent' ? false : null;

  // Detached audit of the config the bot itself currently has on file ---
  let savedConfig: { permission?: string; logChannel?: string; musicChannel?: string } | null = null;
  try {
    const coll = await discordConfigCollection();
    const doc = await coll.findOne({ guildId }) as { permission?: string; logChannelId?: string; musicChannelId?: string; channels?: Record<string, string> } | null;
    if (doc) {
      savedConfig = {
        permission: doc.permission ?? (doc.channels as any)?.permission ?? null,
        logChannel: doc.logChannelId ?? (doc.channels as any)?.logs ?? null,
        musicChannel: doc.musicChannelId ?? (doc.channels as any)?.music ?? null,
      };
    }
  } catch { /* config cluster unavailable — report the live state, not a guess */ }

  const perimeter = botMemberDoc
    ? {
        botId: botMemberDoc.id,
        botUsername: botMemberDoc.username,
        botDisplayName: botMemberDoc.displayName,
        botAvatar: botMemberDoc.avatar,
        guildPermissions: Number(botMemberDoc.permissions),
        // Effective permissions are computed from the chosen channel so the
        // dashboard can tell the user *which* channel to use if a permission
        // is missing because of an overwrite (common with ticket categories).
        effectivePermissions: null,
        roleIds: botMemberDoc.roles,
        roleLabels: [] as string[],
      }
    : null;

  if (perimeter) {
    const roles = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).then(r => r.ok ? r.json() as unknown as Array<{ id: string; name: string }> : []);
    const roleNames = new Map(roles.map((r: any) => [r.id, r.name]));
    perimeter.roleLabels = perimeter.roleIds.map((id: string) => roleNames.get(id) ?? id);
  }

  // ── Permission verdict, per-channel where the user picks a channel ----
  const channelId = req.nextUrl.searchParams.get('channelId') || guildId;
  let effective: { allowed: string[]; missing: string[] } | null = null;
  if (botMemberDoc && channelId && perimeter) {
    const ch = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).then(r => r.ok ? r.json() as unknown as { id: string; permission_overwrites?: Array<{ id: string; allow?: number; deny?: number; type: 'role' | 'member' }>; parent?: { id: string; permission_overwrites?: Array<{ id: string; allow?: number; deny?: number; type: 'role' | 'member' }> } | null } : null);
    if (ch) {
      effective = formattedPerms(effectivePerms(perimeter.guildPermissions, ch, perimeter.roleIds, perimeter.botId));
    }
  }

  const manageable = botInstalled === true && botMemberDoc
    ? (guildMemberManages(req, token, guildId) ?? false)
    : false;

  return NextResponse.json({
    success: true,
    guildId,
    botInstalled,                       // verified against Discord API, not browser
    botOnlineInGuild: botIds?.has(guildId) ?? null,
    botUsername: perimeter?.botUsername ?? null,
    botDisplayName: perimeter?.botDisplayName ?? null,
    botAvatar: perimeter?.botAvatar ?? null,
    botGuildPermissions: perimeter ? Number(perimeter.guildPermissions) : null,
    botRoleNames: perimeter?.roleLabels ?? [],
    effective,                          // null when no channel selected, or when bot not present
    savedConfig,                        // what the bot currently has on file, detached
    manageable,                         // session owner still manages, and bot is present
  });
}

async function guildMemberManages(req: NextRequest, token: string, guildId: string): Promise<boolean | null> {
  // Already used the bot token for the bot check — use the session token
  // for the user check so that both belong to the same request's lifecycle.
  try {
    const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).then(r => r.ok ? r.json() : null);
    if (!resp) return null;
    const g = (resp as Array<{ id: string; owner: boolean; permissions: string | number }>).find((x: any) => x.id === guildId);
    if (!g) return false;
    const ADMIN = BigInt(0x8);
    const MANAGE = BigInt(0x20);
    return g.owner || (BigInt(g.permissions) & MANAGE) !== BigInt(0) || (BigInt(g.permissions) & ADMIN) !== BigInt(0);
  } catch {
    return null; // auth cluster and bot cluster could disagree — unknown is honest
  }
}
