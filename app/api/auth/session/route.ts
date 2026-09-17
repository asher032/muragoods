import { GET } from '@/app/api/auth/discord/me/route';

// ── Current MuraGoods session ────────────────────────────────────────────
// Returns the ACTUAL server-side session:
//   { authenticated: true,  user, guilds, selectedGuildId, bot, … }
//   { authenticated: false }
// Authentication is decided by the HttpOnly session cookie + Mongo record,
// never by anything the browser asserts. Shares one implementation with
// /api/auth/discord/me so the two can never disagree.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export { GET };
