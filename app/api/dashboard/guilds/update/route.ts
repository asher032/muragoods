import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';

// PATCH /api/dashboard/guilds/update — update guild display info
export async function PATCH(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; guildName?: string; guildIcon?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const collection = await discordConfigCollection();
  await collection.updateOne({ guildId }, {
    $set: {
      guildName: String(body.guildName || '').slice(0, 100),
      guildIcon: String(body.guildIcon || '').slice(0, 25),
      updatedAt: new Date(),
    },
  }, { upsert: true });

  return NextResponse.json({ success: true });
}
