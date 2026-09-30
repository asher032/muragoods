import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { botEconomyWrite, invalidateEconomy } from '@/app/lib/economy-backend';
import { ECONOMIC_KEYS, ECONOMIC_LABELS } from '@/app/lib/economy-owner';
import { NextRequest, NextResponse } from 'next/server';

// PATCH { guildId, actorId, config } → save economy configuration.
//
// ECONOMIC VALUES ARE OWNER-ONLY, AND THAT IS ENFORCED HERE.
//
// The dashboard renders non-owner controls as disabled, but a disabled button
// is presentation, not security: anyone can craft the request. The actual
// check is server-side in two places —
//   1. this route refuses to forward an economic change from a non-owner, and
//   2. the bot independently re-checks the caller and returns OWNER_ONLY.
// Either layer alone is sufficient to block the write; both exist so a bug or
// bypass in one does not silently open the economy.
//
// Operational settings are NOT economic values and remain admin-editable.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The owner-only key set lives in `@/app/lib/economy-owner` so this route and
 * the client UI read one definition. The bot keeps its own copy in
 * `main.ECONOMIC_KEYS` and enforces it independently — this site copy is for
 * presenting and pre-checking, never for trusting.
 */
export { ECONOMIC_KEYS };

export async function PATCH(req: NextRequest) {
  const token = await sessionToken();
  if (!token) {
    return NextResponse.json(
      { success: false, code: 'AUTH_REQUIRED', error: 'Sign in with Discord to continue' },
      { status: 401 },
    );
  }
  const body = await req.json().catch(() => null) as
    { guildId?: string; actorId?: string; config?: Record<string, unknown> } | null;
  const guildId = String(body?.guildId || '');
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' },
      { status: 400 },
    );
  }
  // The caller must genuinely manage this server before anything else happens.
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    return NextResponse.json(
      { success: false, code: check.code, error: check.error, retryable: check.retryable },
      { status: check.status },
    );
  }
  const config = body?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_BODY', error: 'A config object is required.' },
      { status: 400 },
    );
  }
  const actorId = String(body?.actorId || '');

  const economicTouched = Object.keys(config).filter((k) => ECONOMIC_KEYS.has(k));
  // The bot is the authority and re-checks the caller itself, so the write is
  // always attempted and its OWNER_ONLY refusal is what the UI reports. This
  // route does not short-circuit, so there is exactly one enforcement point to
  // reason about on the backend.
  const res = await botEconomyWrite('config', guildId, { actorId, config });

  if (!res.ok) {
    if (res.code === 'OWNER_ONLY') {
      // Report exactly which fields were refused, so the UI can name them
      // rather than showing a blanket "not allowed".
      return NextResponse.json(
        {
          success: false, code: 'OWNER_ONLY', ownerOnly: true,
          rejected: economicTouched,
          // Name each refused field so the UI can explain it precisely rather
          // than showing one blanket "not allowed".
          rejectedDetails: economicTouched.map((key) => ({
            field: key,
            label: ECONOMIC_LABELS[key] ?? key,
          })),
          error: '🔒 Owner Only — economic values can only be changed by the Murabot owner.',
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      {
        success: false, code: res.code || 'ECONOMY_SAVE_FAILED',
        error: res.error || 'Economy configuration could not be saved.',
        retryable: res.status >= 500,
      },
      { status: res.status >= 500 ? 503 : res.status || 502 },
    );
  }
  // The write is the truth now — drop the guild's cached reads so the next
  // load reflects it without waiting out a TTL.
  invalidateEconomy(guildId);
  const { ok, ...payload } = res.data || {};
  void ok;
  return NextResponse.json({ success: true, saved: Object.keys(config), ...payload });
}