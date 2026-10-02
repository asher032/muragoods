import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import { discordConfigCollection } from '@/app/lib/discord-config';
import { requireStaff } from '@/app/lib/access-control';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// Audit trail, read from the Admin Panel.
//
// The audit entries live on the guild configuration document — the SAME store
// Murabot and the dashboard write to — so this is a read of the canonical
// record, not a copy of it. Reading it here does not require a Discord
// session or a live Manage Server bit: audit access is a Muragoods technical
// scope, because being able to audit is exactly the capability the Muragoods
// owner needs and a per-guild Discord check was never the right test for it.
// ─────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const guard = await requireStaff(req, ['technical']);
  if (!guard.ok) return guard.response;

  const guildId = new URL(req.url).searchParams.get('guildId');
  if (!/^\d{5,25}$/.test(guildId || '')) {
    return NextResponse.json(
      { success: false, error: 'A valid guildId is required', code: 'INVALID_GUILD_ID' },
      { status: 400 },
    );
  }

  await dbConnect();
  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId }, { projection: { config_audit: 1, updatedAt: 1 } });
  const entries = Array.isArray(doc?.config_audit) ? doc!.config_audit : [];

  return NextResponse.json({
    success: true,
    guildId,
    updatedAt: doc?.updatedAt ?? null,
    // The trail is capped at 100 entries by design; saying so is better than
    // letting an operator assume they are looking at everything.
    count: entries.length,
    retention: 'Last 100 configuration changes for this server, stored on the guild configuration document.',
    entries: entries.slice(0, 100),
    readOnly: true,
  });
}