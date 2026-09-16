// ─── Admin bridge: Discord API proxy + module config ──────────────────
// Admin-only (site session). Never exposes the bot token — it lives here.
// Handles: guilds, channels, roles, members, config save/load, perm check.
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import DiscordGuildConfig from '@/app/lib/models/DiscordGuildConfig';
import { requireAdmin } from '@/app/lib/session';

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_TOKEN;

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function botMember(guildId: string) {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/member/@me`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// Effective permission bits in a channel for a member, using Discord's
// overwrite model: allow/dis denied per role & member, deny takes precedence.
function channelPerms(guildPerms: number, channel: any, memberRoles: string[], botId: string) {
  let p = guildPerms;
  const everyone = channel.permissionOverwrites?.find((o: any) => o.type === 'role' && o.id === channel.guildId);
  const category = channel.parent?.permissionOverwrites;
  const targets = [
    ...(category || []),
    ...(channel.permissionOverwrites || []),
  ];
  for (const ow of targets) {
    if (ow.type === 'role') {
      if (ow.id === channel.guildId) { p = apply(p, ow); continue; }
      if (memberRoles.includes(ow.id)) { p = apply(p, ow); }
    } else if (ow.type === 'member' && ow.id === botId) {
      p = apply(p, ow);
    }
  }
  return p;
}
function apply(p: number, ow: any) {
  const allow = ow.allow ?? 0;
  const deny = ow.deny ?? 0;
  p = (p & ~Number(deny)) | Number(allow);
  return p;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  await dbConnect();

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const guildId = url.searchParams.get('guildId');

  if (!BOT_TOKEN) {
    return bad('Discord bot token not configured', 500);
  }

  // ── List guilds the bot is in ────────────────────────────────
  if (action === 'guilds') {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds?with_counts=true`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!res.ok) return bad('Discord API error', res.status);
    const guilds = (await res.json()) as Array<{
      id: string; name: string; icon: string | null; owner: boolean; permissions: string;
      approximate_count?: number;
    }>;
    return NextResponse.json({
      success: true,
      data: guilds.slice(0, 200).map((g) => ({
        id: g.id, name: g.name, icon: g.icon, owner: g.owner, permissions: g.permissions,
        members: g.approximate_count ?? null,
      })),
    });
  }

  if (!guildId) return bad('guildId required');

  // ── Channels grouped by type ─────────────────────────────────
  if (action === 'channels') {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels?with_counts=true`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!res.ok) return bad('Discord API error', res.status);
    const raw = (await res.json()) as Array<{
      id: string; name: string; type: number; parent_id?: string | null; position: number; topic?: string | null; bitrate?: number | null; user_limit?: number | null;
    }>;
    const kindName = (t: number): string => ({ 0: 'text', 2: 'voice', 4: 'category', 5: 'news', 13: 'stage', 14: 'store', 15: 'directory' }[t] ?? 'text');
    const channels = raw
      .map((c) => ({
        id: c.id, name: c.name, type: kindName(c.type) as any,
        categoryId: c.parent_id, position: c.position, topic: c.topic ?? null,
        memberCount: c.user_limit ?? null, bitrate: c.bitrate ?? null,
      }))
      .sort((a, b) => a.position - b.position);
    const grouped: Record<string, typeof channels> = {};
    for (const c of channels) {
      const group = c.type === 'category' ? 'Categories' : (c.type === 'voice' ? 'Voice Channels' : 'Text Channels');
      (grouped[group] = grouped[group] ?? []).push(c);
    }
    return NextResponse.json({ success: true, data: grouped });
  }

  // ── Roles sorted by position ─────────────────────────────────
  if (action === 'roles') {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles?with_counts=true`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!res.ok) return bad('Discord API error', res.status);
    const raw = (await res.json()) as Array<{
      id: string; name: string; color: number; position: number; icon?: string | null; hoist?: boolean;
    }>;
    const roles = raw
      .map((r) => ({
        id: r.id, name: r.name, color: '#' + r.color.toString(16).padStart(6, '0'), position: r.position, icon: r.icon ?? null,
      }))
      .filter((r) => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position);
    return NextResponse.json({ success: true, data: roles });
  }

  // ── Members (searchable) ─────────────────────────────────────
  if (action === 'members') {
    const query = url.searchParams.get('query') ?? '';
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members?limit=100${query ? `&query=${encodeURIComponent(query)}` : ''}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!res.ok) return bad('Discord API error', res.status);
    const raw = (await res.json()) as Array<{
      user: { id: string; username: string; avatar?: string | null; bot?: boolean };
      nick?: string | null; roles: string[];
    }>;
    const members = raw.map((m) => ({
      id: m.user.id,
      name: m.nick ?? m.user.username,
      username: m.user.username,
      bot: m.user.bot ?? false,
      avatar: m.user.avatar ?? null,
      roles: m.roles,
    })).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    return NextResponse.json({ success: true, data: members });
  }

  // ── Saved config ─────────────────────────────────────────────
  if (action === 'config') {
    const config = await DiscordGuildConfig.findOne({ guildId }).lean();
    return NextResponse.json({ success: true, data: config ?? {} });
  }

  return bad('Unknown action');
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  await dbConnect();

  if (!BOT_TOKEN) {
    return bad('Discord bot token not configured', 500);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return bad('Invalid JSON body');
  const action = String((body as Record<string, unknown>).action ?? '');
  const guildId = String((body as Record<string, unknown>).guildId ?? '');

  if (!guildId) return bad('guildId required');

  // ── Save module config ───────────────────────────────────────
  if (action === 'saveConfig') {
    const data = (body as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') return bad('data required');
    const doc = await DiscordGuildConfig.findOne({ guildId });
    const docData: Record<string, unknown> = {
      ...(doc ? doc.toObject() : {}),
      ...data,
      guildId,
      updatedAt: new Date(),
    };
    // Strip mongoose internals from a lean existing doc
    delete (docData as any).__v;
    delete (docData as any)._id;
    await DiscordGuildConfig.updateOne({ guildId }, { $set: docData }, { upsert: true });
    const saved = await DiscordGuildConfig.findOne({ guildId }).lean();
    return NextResponse.json({ success: true, data: saved });
  }

  // ── Test bot permissions in a channel ────────────────────────
  if (action === 'testPermissions') {
    const channelId = String((body as Record<string, unknown>).channelId ?? '');
    const member = await botMember(guildId);
    if (!member) return bad('Could not resolve bot member', 500);
    const botId = (member as any).user?.id ?? '';
    const memberRoles: string[] = (member as any).roles ?? [];
    const guildPerms = Number((member as any).permissions ?? 0);

    let channel: any = null;
    if (channelId) {
      const ch = await fetch(`${DISCORD_API}/channels/${channelId}`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      });
      if (ch.ok) channel = await ch.json();
    }
    let bitmask = guildPerms;
    if (channel) bitmask = channelPerms(guildPerms, channel, memberRoles, botId);

    const result: Record<string, boolean> = {};
    for (const [bit, name] of Object.entries({
      1024: 'View Channels', 2048: 'Send Messages', 4096: 'Embed Links',
      8192: 'Attach Files', 16384: 'Read Message History', 32768: 'Mention Everyone',
      65536: 'Use Slash Commands', 268435456: 'Manage Channels', 536870912: 'Manage Roles',
      1073741824: 'Administrator', 2147483648: 'Move Members',
    })) {
      result[name] = (bitmask & Number(bit)) === Number(bit);
    }
    return NextResponse.json({ success: true, data: result });
  }

  return bad('Unknown action');
}
