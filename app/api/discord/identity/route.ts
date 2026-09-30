import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

/**
 * GET /api/discord/identity?discordId=<snowflake>
 *
 * The canonical identity lookup: given a Discord account, return the
 * Muragoods `userId` that owns it — and nothing else.
 *
 * This route is the reason there is only ONE identity system. The bot asks the
 * site "who is this person?" instead of keeping its own user table, so a
 * Discord account can never acquire a second, divergent Muragoods identity.
 *
 * SECURITY
 * - Authenticated by the same shared secret as the rest of the Discord bridge.
 * - Returns an opaque id and a boolean. No email, no name, no role, no
 *   balance, no database details. An identity oracle that leaked an email
 *   would turn a leaked snowflake into a PII disclosure.
 * - "Not linked" is a 200 with `linked: false`, not a 404: an unlinked member
 *   is a normal state, and a 404 would tempt callers to treat it as an error.
 */

export const dynamic = 'force-dynamic';

/** Discord snowflakes are 17–20 digits today; anything else is not one. */
const SNOWFLAKE_RE = /^\d{17,20}$/;

function checkSecret(req: Request): boolean {
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const raw = new URL(req.url).searchParams.get('discordId')?.trim() ?? '';
  if (!SNOWFLAKE_RE.test(raw)) {
    return NextResponse.json(
      { success: false, error: 'A valid discordId is required' },
      { status: 400 },
    );
  }

  try {
    await dbConnect();
    const user = await User.findOne(
      { 'discord.discordId': raw },
      { userId: 1, 'discord.linkedAt': 1 },
    ).lean();

    if (!user) {
      return NextResponse.json({ success: true, linked: false, canonicalUserId: null });
    }

    // An account with no userId has never been issued a canonical id. Report
    // it as unlinked rather than handing back null-as-an-identity, so the
    // bot's cache stores a clean "no" instead of a value that might later be
    // mistaken for a real id.
    const canonical = typeof user.userId === 'string' ? user.userId.trim() : '';
    if (!canonical) {
      return NextResponse.json({ success: true, linked: false, canonicalUserId: null });
    }

    return NextResponse.json({
      success: true,
      linked: true,
      canonicalUserId: canonical,
      linkedAt: user.discord?.linkedAt ?? null,
    });
  } catch {
    // Never echo the driver message: it can embed the connection string.
    return NextResponse.json(
      { success: false, error: 'Identity lookup failed' },
      { status: 503 },
    );
  }
}
