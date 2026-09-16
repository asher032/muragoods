import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import mongoose from 'mongoose';
import DiscordGuildConfig from '@/app/lib/models/DiscordGuildConfig';

// Dashboard audit history + reset-to-default.
// GET  ?guildId=... → last 15 config changes
// POST { guildId, action: 'reset' } → restore defaults (permission-checked)

export const dynamic = 'force-dynamic';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

function hasManage(owner: boolean, perms: string | number): boolean {
  if (owner) return true;
  const p = BigInt(perms);
  return (p & MANAGE_GUILD) !== BigInt(0) || (p & ADMINISTRATOR) !== BigInt(0);
}

async function verify(token: string, guildId: string): Promise<{ ok: boolean; name?: string }> {
  const resp = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return { ok: false };
  const guilds = (await resp.json()) as Array<{ id: string; name: string; owner: boolean; permissions: string | number }>;
  const g = guilds.find((x) => x.id === guildId);
  if (!g || !hasManage(g.owner, g.permissions)) return { ok: false };
  return { ok: true, name: g.name };
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Token required' }, { status: 401 });
  if (!guildId) return NextResponse.json({ success: false, error: 'guildId required' });

  const check = await verify(token, guildId);
  if (!check.ok) return NextResponse.json({ success: false, error: 'No permission' }, { status: 403 });

  await dbConnect();
  const docs = await mongoose.connection.collection('config_audit')
    .find({ guildId })
    .sort({ at: -1 })
    .limit(15)
    .toArray();
  return NextResponse.json({
    success: true,
    audit: docs.map((d) => ({ actor: d.actor, summary: d.summary, at: d.at })),
  });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  if (!token) return NextResponse.json({ success: false, error: 'Token required' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const guildId = body && typeof body === 'object' ? String((body as Record<string, unknown>).guildId || '') : '';
  if (!guildId) return NextResponse.json({ success: false, error: 'guildId required' });

  const check = await verify(token, guildId);
  if (!check.ok) return NextResponse.json({ success: false, error: 'No permission' }, { status: 403 });

  await dbConnect();
  // Reset = delete the doc; defaults come from the schema on next read.
  await DiscordGuildConfig.deleteOne({ guildId });
  try {
    const me = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meData = me.ok ? (await me.json()) as { username?: string } : null;
    const col = mongoose.connection.collection('config_audit');
    await col.insertOne({
      guildId, actor: meData?.username || 'unknown',
      summary: 'Reset all settings to defaults',
      at: new Date(),
    });
  } catch {
    // audit best-effort
  }
  return NextResponse.json({ success: true });
}
