import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { getSessionUser, isAdminEmail, type SessionUser } from '@/app/lib/session';
import { getSession } from '@/app/lib/discord-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';

// ─────────────────────────────────────────────────────────────────────────
// ONE authority for the whole Muragoods ecosystem.
//
// The panel and the dashboard used to answer "may I?" with two unrelated
// mechanisms: an email list for /admin, and a live Discord permission bit for
// /dashboard. That produced two wrong behaviours at once:
//
//   1. The Muragoods owner — who runs the bot, the shop and the site — could
//      be refused by a DISCORD server check when acting on Muragoods data.
//      Discord says nothing about who owns Muragoods.
//   2. "Admin" was a boolean. Every staff member was a super-admin, and there
//      was no way to give someone support access without giving them the
//      economy ledger and the user table.
//
// This module is the only place that decides. Three levels, no fourth:
//
//   MURAGOODS_OWNER    the whole ecosystem: site, shop, Murastream, games,
//                      letters, economy, Murabot, users, security, audit.
//                      NOT gated by Discord server permissions — but every
//                      action that physically touches Discord is still
//                      validated against Discord's API and role hierarchy
//                      where it is executed (see the Murabot bridge), so
//                      "full access" never means "faked permission".
//
//   MURAGOODS_STAFF    granular scopes on Muragoods data only:
//                      support · moderation · content · shop · murastream
//                      · economy · technical · analytics
//
//   GUILD_ADMIN        exactly the guilds their Discord identity genuinely
//                      manages right now (owner, MANAGE_GUILD or
//                      ADMINISTRATOR, re-checked live). Never global.
//
// A signed-in user with none of these is USER. There is deliberately no
// client-side override and no query-parameter bypass: identity is derived
// from the HttpOnly session, always.
// ─────────────────────────────────────────────────────────────────────────

export const STAFF_SCOPES = [
  'support',
  'moderation',
  'content',
  'shop',
  'murastream',
  'economy',
  'technical',
  'analytics',
] as const;

export type StaffScope = (typeof STAFF_SCOPES)[number];

export type AccessLevel =
  | 'muragoods_owner'
  | 'muragoods_staff'
  | 'guild_admin'
  | 'user';

export interface AccessIdentity {
  /** Which of the three levels this identity resolves to. */
  level: AccessLevel;
  /** Canonical Muragoods userId, when a Muragoods account is linked. */
  userId?: string;
  email?: string;
  name?: string;
  /** Present when the identity came from a Discord OAuth session. */
  discordId?: string;
  discordUsername?: string;
  /** Granted staff scopes; always empty for non-staff. */
  scopes: StaffScope[];
  /** Guilds this identity may manage, proven live by Discord. */
  managedGuildIds: string[];
}

function normalizeScopes(raw: unknown): StaffScope[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(STAFF_SCOPES);
  const out: StaffScope[] = [];
  for (const s of raw) {
    const v = String(s).trim().toLowerCase();
    if (allowed.has(v) && !out.includes(v as StaffScope)) out.push(v as StaffScope);
  }
  return out;
}

/** Is this Muragoods account the ecosystem owner? */
function isOwnerAccount(u: { role?: string | null; email?: string | null } | null): boolean {
  if (!u) return false;
  return u.role === 'admin' || isAdminEmail(u.email ?? '');
}

type StoredUser = {
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  staffScopes?: unknown;
} | null;

async function loadUserByEmail(email: string): Promise<StoredUser> {
  await dbConnect();
  return User.findOne({ email }).select('userId name email role staffScopes').lean<StoredUser>();
}

async function loadUserByDiscordId(discordId: string): Promise<StoredUser> {
  await dbConnect();
  return User.findOne({ 'discord.discordId': discordId })
    .select('userId name email role staffScopes')
    .lean<StoredUser>();
}

/**
 * Resolve WHO is calling, from the session only.
 *
 * Two doors, one definition of identity: the Muragoods account session (the
 * cookie the site itself sets) and the Discord OAuth session the dashboard
 * uses. Either door resolves to the same canonical Muragoods account, so
 * signing in the "other way" can never change what someone is allowed to do.
 */
export async function resolveAccess(req?: Request): Promise<AccessIdentity> {
  // Door 1 — the site's own account session.
  const shop = req ? await getSessionUser(req) : null;
  if (shop) {
    const stored = await loadUserByEmail(shop.email);
    return fromStoredUser(stored ?? { email: shop.email, name: shop.name, role: shop.role }, shop);
  }

  // Door 2 — Discord OAuth. Resolved to the LINKED Muragoods account, so a
  // Discord login can never be a way to become someone else.
  try {
    const dash = await getSession();
    if (dash?.discordId) {
      const stored = await loadUserByDiscordId(dash.discordId);
      return fromStoredUser(stored, {
        email: stored?.email,
        name: stored?.name,
        discordId: dash.discordId,
        discordUsername: dash.session.username,
      });
    }
  } catch {
    // An unreachable database must not silently upgrade anyone: fall through
    // to the lowest level.
  }

  return { level: 'user', scopes: [], managedGuildIds: [] };
}

function fromStoredUser(
  stored: StoredUser,
  extra: { email?: string | null; name?: string | null; discordId?: string; discordUsername?: string },
): AccessIdentity {
  const base: AccessIdentity = {
    level: 'user',
    userId: stored?.userId || undefined,
    email: (stored?.email ?? extra.email ?? undefined)?.toLowerCase(),
    name: stored?.name ?? extra.name ?? undefined,
    discordId: extra.discordId,
    discordUsername: extra.discordUsername,
    scopes: [],
    managedGuildIds: [],
  };
  if (isOwnerAccount(stored ?? { email: extra.email ?? null })) {
    // Owner is owner of Muragoods. Guilds are listed separately, on demand —
    // they are NOT a precondition for owner-level Muragoods authority.
    return { ...base, level: 'muragoods_owner', scopes: [...STAFF_SCOPES] };
  }
  const scopes = normalizeScopes(stored?.staffScopes);
  if (scopes.length > 0) return { ...base, level: 'muragoods_staff', scopes };
  return base;
}

/**
 * Which guilds may this identity manage, per LIVE Discord permission?
 *
 * Only meaningful for a Discord session; a Muragoods-account session with no
 * Discord link manages no guilds, and — importantly — losing that ability
 * does NOT reduce Muragoods-level authority for an owner or staff member.
 */
export async function managedGuilds(access: AccessIdentity): Promise<string[]> {
  if (!access.discordId) return access.managedGuildIds;
  try {
    const dash = await getSession();
    if (!dash) return access.managedGuildIds;
    const { fetchUserGuilds } = await import('@/app/lib/discord-guilds');
    const res = await fetchUserGuilds(dash.accessToken);
    if (!res.ok) return access.managedGuildIds;
    return res.guilds.filter((g) => g.owner || hasManage(g.permissions)).map((g) => g.id);
  } catch {
    return access.managedGuildIds;
  }
}

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);
function hasManage(perms: string | number): boolean {
  try {
    const p = BigInt(perms);
    return (p & MANAGE_GUILD) !== BigInt(0) || (p & ADMINISTRATOR) !== BigInt(0);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Route guards
// ─────────────────────────────────────────────────────────────────────────

export type Guard<T> = { ok: true; access: T } | { ok: false; response: NextResponse };

function refuse(status: number, error: string, code: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: false, error, code, ...(extra || {}) }, { status });
}

/** Muragoods owner only — the whole ecosystem. */
export async function requireOwner(req: Request): Promise<Guard<AccessIdentity & { level: 'muragoods_owner' }>> {
  const access = await resolveAccess(req);
  if (access.level === 'muragoods_owner') {
    return { ok: true, access: access as AccessIdentity & { level: 'muragoods_owner' } };
  }
  return {
    ok: false,
    response: refuse(
      403,
      'Muragoods owner access required.',
      'MURAGOODS_OWNER_REQUIRED',
      { level: access.level },
    ),
  };
}

/**
 * Muragoods owner, OR staff holding every requested scope.
 *
 * The response says WHICH level was missing, so the UI can tell a person
 * "you are support staff; this page needs economy" instead of a flat 403.
 */
export async function requireStaff(
  req: Request,
  scopes: StaffScope[],
): Promise<Guard<AccessIdentity>> {
  const access = await resolveAccess(req);
  if (access.level === 'muragoods_owner') return { ok: true, access };
  if (access.level === 'muragoods_staff') {
    const missing = scopes.filter((s) => !access.scopes.includes(s));
    if (missing.length === 0) return { ok: true, access };
    return {
      ok: false,
      response: refuse(403, `This action needs the ${missing.join(' + ')} scope.`, 'STAFF_SCOPE_REQUIRED', {
        missingScopes: missing,
        yourScopes: access.scopes,
      }),
    };
  }
  return {
    ok: false,
    response: refuse(403, 'Muragoods staff access required.', 'STAFF_REQUIRED', { level: access.level }),
  };
}

/**
 * Guild-scoped Muragoods DISCORD authority for one server.
 *
 * The Muragoods owner and staff pass this too — their authority is global —
 * but the guild id is still validated, because the data being written belongs
 * to a real Discord server and a forged id must never be stored.
 */
export async function requireGuildAuthority(
  req: Request,
  guildId: string,
): Promise<Guard<AccessIdentity & { guildId: string }>> {
  const access = await resolveAccess(req);
  if (!/^\d{5,25}$/.test(guildId)) {
    return { ok: false, response: refuse(400, 'Valid guildId required.', 'INVALID_GUILD_ID') };
  }
  if (access.level === 'muragoods_owner' || access.level === 'muragoods_staff') {
    return { ok: true, access: { ...access, guildId } };
  }

  // Discord member: proven by the live permission bit, never by the browser.
  try {
    const dash = await getSession();
    if (!dash) {
      return { ok: false, response: refuse(401, 'Sign in with Discord to manage a server.', 'AUTH_REQUIRED') };
    }
    const check = await requireGuildManage(dash.accessToken, guildId);
    if (!check.ok) {
      return {
        ok: false,
        response: refuse(check.status, check.error, check.code, {
          retryable: check.retryable,
          ...(check.retryAfterMs ? { retryAfterMs: check.retryAfterMs } : {}),
        }),
      };
    }
    return {
      ok: true,
      access: {
        ...access,
        level: 'guild_admin',
        discordId: dash.discordId,
        managedGuildIds: [guildId],
        guildId,
      },
    };
  } catch {
    return { ok: false, response: refuse(502, 'Discord could not be reached.', 'DISCORD_UNREACHABLE') };
  }
}

/** Human-readable summary for the admin/dashboard shells. */
export function describeAccess(access: AccessIdentity): {
  label: string;
  detail: string;
} {
  switch (access.level) {
    case 'muragoods_owner':
      return { label: 'Muragoods owner', detail: 'Full control of the entire Muragoods ecosystem.' };
    case 'muragoods_staff':
      return {
        label: 'Muragoods staff',
        detail: `Scoped access: ${access.scopes.join(', ') || 'none'}.`,
      };
    case 'guild_admin':
      return {
        label: 'Discord server admin',
        detail: 'Control of the servers you manage in Discord. No global Muragoods access.',
      };
    default:
      return { label: 'Signed-in member', detail: 'Normal Muragoods and Murabot features only.' };
  }
}
