import { NextRequest, NextResponse } from 'next/server';
import { getSession, revokeSession, sessionManagesGuild } from '@/app/lib/discord-session';
import dbConnect from '@/app/lib/mongodb';
import DiscordSession from '@/app/lib/models/DiscordSession';

// ── Sign out ─────────────────────────────────────────────────────────────
// Revokes the server-side session record, clears the cookie. After this,
// /dashboard must authenticate again. Idempotent.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  const wasActive = await revokeSession();
  return NextResponse.json({ success: true, revoked: wasActive });
}

// ── Guild selection (PATCH semantics via POST for client simplicity) ─────
// Body: { guildId } — verified server-side against the LIVE Discord guild
// list; a stale or forged guildId is rejected, never trusted.
export async function PUT(req: NextRequest) {
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  let body: { guildId?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const guildId = body.guildId;
  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  }

  const check = await sessionManagesGuild(auth.accessToken, guildId);
  if (!check.ok || !check.guild) {
    return NextResponse.json(
      { success: false, error: check.error || 'Not allowed to manage that server' },
      { status: check.status || 403 },
    );
  }

  await dbConnect();
  await DiscordSession.updateOne(
    { sessionId: auth.session.sessionId },
    { $set: { selectedGuildId: guildId } },
  );

  // Persist into the guild snapshot with fresh names/icons.
  await DiscordSession.updateOne(
    { sessionId: auth.session.sessionId, 'guilds.id': { $ne: guildId } },
    { $push: { guilds: { id: check.guild.id, name: check.guild.name, icon: check.guild.icon, owner: check.guild.owner } } },
  );

  return NextResponse.json({
    success: true,
    guild: {
      id: check.guild.id,
      name: check.guild.name,
      icon: check.guild.icon ? `https://cdn.discordapp.com/icons/${check.guild.id}/${check.guild.icon}.png` : null,
      owner: check.guild.owner,
    },
  });
}
