import { NextRequest, NextResponse } from 'next/server';
import {
  DISCORD_OAUTH_INVALID_CLIENT,
  DISCORD_OAUTH_INVALID_CLIENT_MESSAGE,
  OAUTH_STATE_COOKIE,
  createSession,
  exchangeCode,
  guildIconUrl,
  sessionCookie,
} from '@/app/lib/discord-session';
import { getRedirectUri } from '../route';
import { getIdentityWithId } from '@/app/lib/identity';

// ── OAuth step 2: Discord redirects here with ?code&state ────────────────
// Verify state → exchange code server-side → fetch user + guilds → create
// Mongo session → set HttpOnly cookie → redirect to /dashboard (or ?next).
// Every failure mode redirects with a readable ?auth_error= message rather
// than silently pretending success.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

/**
 * Redirect with a readable ?auth_error=.
 *
 * `code` is the internal structured error (e.g. DISCORD_OAUTH_INVALID_CLIENT);
 * when present it drives the dashboard's wording so a server-side deployment
 * fault never renders as a message about the visitor's own account.
 */
function fail(req: NextRequest, message: string, code?: string) {
  const url = new URL('/dashboard', req.nextUrl.origin);
  url.searchParams.set('auth_error', message);
  if (code) url.searchParams.set('auth_error_code', code);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const discordError = req.nextUrl.searchParams.get('error');

  // User denied the authorization on Discord's page.
  if (discordError) {
    return fail(req, discordError === 'access_denied'
      ? 'Authorization was cancelled on Discord.'
      : `Discord returned an error: ${discordError}`);
  }
  if (!code || !state) {
    return fail(req, 'Discord callback was missing the authorization code.');
  }

  // State validation: must match the HttpOnly cookie we set on the way out.
  const jar = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  let flow: { state: string; next: string; guild: string | null; mode?: string } | null = null;
  if (jar) {
    try { flow = JSON.parse(jar); } catch { /* corrupt cookie */ }
  }
  if (!flow || flow.state !== state) {
    return fail(req, 'Login state check failed — please try again (expired or missing OAuth state).');
  }

  // Exchange the authorization code for tokens (server-side only).
  const token = await exchangeCode(code, getRedirectUri(req));
  if (!token.ok) {
    // Our own credentials were rejected. Show the neutral "try again later"
    // copy rather than the operator-facing text, and pass the structured code
    // so the dashboard can map it the same way on a page refresh.
    if (token.code === DISCORD_OAUTH_INVALID_CLIENT) {
      return fail(req, DISCORD_OAUTH_INVALID_CLIENT_MESSAGE, DISCORD_OAUTH_INVALID_CLIENT);
    }
    return fail(req, token.error);
  }

  // Fetch the authenticated Discord user.
  const userResp = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    cache: 'no-store',
  });
  if (!userResp.ok) {
    return fail(req, `Could not load your Discord profile (HTTP ${userResp.status}).`);
  }
  const user = (await userResp.json()) as {
    id: string; username: string; global_name?: string; avatar: string | null;
  };

  // Fetch guilds and keep the ones this user may actually manage.
  const guildsResp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    cache: 'no-store',
  });
  if (!guildsResp.ok) {
    return fail(req, `Could not load your Discord servers (HTTP ${guildsResp.status}).`);
  }
  const allGuilds = (await guildsResp.json()) as Array<{
    id: string; name: string; icon: string | null; owner: boolean;
    permissions: string | number; approximate_member_count?: number;
  }>;
  const guilds = allGuilds
    .filter((g) => g.owner || (BigInt(g.permissions) & MANAGE_GUILD) !== BigInt(0) || (BigInt(g.permissions) & ADMINISTRATOR) !== BigInt(0))
    .map((g) => ({
      id: g.id,
      name: g.name,
      icon: guildIconUrl(g.id, g.icon),
      owner: g.owner,
    }));

  // Account-link mode: bind this Discord identity to the signed-in shop
  // user instead of creating a dashboard session. Anti-abuse: the shop
  // session must be valid, and one Discord id links to exactly one account.
  if (flow.mode === 'link') {
    return linkDiscordAccount(req, user);
  }

  // Unified identity: a signed-in Muragoods user connecting Discord from the
  // dashboard flow must NOT end up with a second, unlinked identity. Bind
  // the Discord id to their existing account (same uniqueness guard as link
  // mode), then continue to the dashboard session below.
  try {
    await autoLinkDiscordToShopUser(req, user.id, user.username, user.avatar);
  } catch (err) {
    return fail(req, err instanceof Error ? err.message : 'Account linking conflict.');
  }

  // Preselect: explicit ?guild= deep link, else the first manageable guild
  // where the bot is present is decided later by the dashboard's bot check —
  // here we just take the deep link or leave null (UI shows the chooser).
  const selectedGuildId = flow.guild && guilds.some((g) => g.id === flow?.guild)
    ? flow.guild
    : null;

  const session = await createSession({
    discordId: user.id,
    username: user.username,
    globalName: user.global_name ?? '',
    avatar: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : null,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresIn: token.expiresIn,
    guilds,
    selectedGuildId,
  });

  // Set the session cookie ON THIS RESPONSE. This is the redirect Discord's
  // navigation actually follows, so there is no way for the cookie to be
  // dropped between here and /dashboard — a dropped cookie is exactly what
  // produces the "connected but still shows Connect with Discord" loop.
  const target = new URL(flow.next || '/dashboard', req.nextUrl.origin);
  const res = NextResponse.redirect(target);
  const cookie = sessionCookie(session.sessionId);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  // One-time state is spent either way.
  res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

async function linkDiscordAccount(
  req: NextRequest,
  user: { id: string; username: string; global_name?: string; avatar: string | null },
): Promise<NextResponse> {
  const done = (ok: boolean, msg: string) => {
    const target = new URL('/account/connected', req.nextUrl.origin);
    target.searchParams.set(ok ? 'linked' : 'error', msg);
    const res = NextResponse.redirect(target);
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };
  try {
    const { getSessionUser } = await import('@/app/lib/session');
    const session = await getSessionUser(req);
    if (!session) return done(false, 'Sign in to Muragoods first, then connect Discord.');
    const [{ default: dbConnect }, { default: User }] = await Promise.all([
      import('@/app/lib/mongodb'),
      import('@/app/lib/models/User'),
    ]);
    await dbConnect();
    const emailLc = session.email.toLowerCase();
    // One Discord identity → one Muragoods account, enforced by the unique
    // sparse index and re-checked here for a readable error.
    const taken = await User.findOne({
      $or: [{ 'discord.discordId': user.id }, { 'linkedAccounts.discordUserId': user.id }],
      email: { $ne: session.email },
    })
      .select('_id').lean();
    if (taken) return done(false, 'That Discord account is already linked to another Muragoods account.');
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : '';
    // Linking Discord NEVER creates a second Muragoods account — it attaches
    // the external identity to the account that is already signed in:
    //
    //   userId -> linkedAccounts.discordUserId -> Discord -> Murabot
    //
    // Both field names are written so the historical index and every existing
    // query keep working while the canonical name takes over.
    await User.updateOne(
      { email: session.email },
      {
        $set: {
          'discord.discordId': user.id,
          'discord.username': user.username,
          'discord.avatar': avatar,
          'discord.linkedAt': new Date(),
          'linkedAccounts.discordUserId': user.id,
          'linkedAccounts.discordUsername': user.username,
          'linkedAccounts.discordAvatar': avatar,
          'linkedAccounts.discordLinkedAt': new Date(),
          updatedAt: new Date(),
        },
      },
    );
    // Backfill the join keys onto existing ecosystem rows so history,
    // progress and favorites instantly become cross-platform. Both the
    // Discord id and the canonical userId are stamped, which is what lets
    // Murabot find this person's wallets through either key.
    const identity = await getIdentityWithId(req);
    const [{ default: GameProgress }, { default: UserPreference }, { default: UserActivity }, { default: GameReward }] =
      await Promise.all([
        import('@/app/lib/models/GameProgress'),
        import('@/app/lib/models/UserPreference'),
        import('@/app/lib/models/UserActivity'),
        import('@/app/lib/models/GameReward'),
      ]);
    const joinKeys = identity
      ? { discordId: user.id, canonicalUserId: identity.userId }
      : { discordId: user.id };
    await Promise.all([
      GameProgress.updateMany({ userEmail: emailLc }, { $set: joinKeys }),
      UserPreference.updateMany({ userEmail: emailLc }, { $set: joinKeys }),
      UserActivity.updateMany({ userEmail: emailLc }, { $set: joinKeys }),
      GameReward.updateMany({ userEmail: emailLc }, { $set: joinKeys }),
    ]);
    await UserActivity.create({
      ...(identity ? { canonicalUserId: identity.userId } : {}),
      userEmail: emailLc, discordId: user.id, type: 'link',
      text: `Connected Discord @${user.username}`, visibility: 'private',
    }).catch(() => undefined);
    return done(true, `@${user.username}`);
  } catch {
    return done(false, 'Linking failed — please try again.');
  }
}

/**
 * Best-effort auto-link for the dashboard login flow: when the browser
 * already holds a valid Muragoods shop session, the Discord identity just
 * authorized is bound to that SAME account instead of floating unlinked.
 * Never merges: a Discord id taken by another account aborts the login with
 * a clear account-linking error. No shop session → dashboard-only session,
 * no User record created.
 */
async function autoLinkDiscordToShopUser(
  req: NextRequest,
  discordId: string,
  username: string,
  avatar: string | null,
): Promise<void> {
  try {
    const { getSessionUser } = await import('@/app/lib/session');
    const session = await getSessionUser(req);
    if (!session) return;
    const [{ default: dbConnect }, { default: User }] = await Promise.all([
      import('@/app/lib/mongodb'),
      import('@/app/lib/models/User'),
    ]);
    await dbConnect();
    const me = await User.findOne({ email: session.email }).select('discord').lean() as {
      discord?: { discordId?: string };
    } | null;
    if (!me) return;
    if (me.discord?.discordId === discordId) return; // already linked
    if (me.discord?.discordId) return; // linked to a different Discord id — keep explicit link flow
    const taken = await User.findOne({
      $or: [{ 'discord.discordId': discordId }, { 'linkedAccounts.discordUserId': discordId }],
    }).select('_id').lean();
    if (taken) {
      // Linked elsewhere: do NOT silently merge. Surface the conflict at the
      // dashboard gate instead of creating a duplicate identity.
      throw new Error(
        'That Discord account is already linked to another Muragoods account. Sign in with that account, or unlink it first.',
      );
    }
    const avatarUrl = avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=128`
      : '';
    const now = new Date();
    await User.updateOne(
      { email: session.email },
      {
        $set: {
          'discord.discordId': discordId,
          'discord.username': username,
          'discord.avatar': avatarUrl,
          'discord.linkedAt': now,
          'linkedAccounts.discordUserId': discordId,
          'linkedAccounts.discordUsername': username,
          'linkedAccounts.discordAvatar': avatarUrl,
          'linkedAccounts.discordLinkedAt': now,
          updatedAt: now,
        },
      },
    );
    const emailLc = session.email.toLowerCase();
    const identity = await getIdentityWithId(req);
    const [{ default: GameProgress }, { default: UserPreference }, { default: UserActivity }, { default: GameReward }] =
      await Promise.all([
        import('@/app/lib/models/GameProgress'),
        import('@/app/lib/models/UserPreference'),
        import('@/app/lib/models/UserActivity'),
        import('@/app/lib/models/GameReward'),
      ]);
    const joinKeys = identity ? { discordId, canonicalUserId: identity.userId } : { discordId };
    await Promise.all([
      GameProgress.updateMany({ userEmail: emailLc }, { $set: joinKeys }),
      UserPreference.updateMany({ userEmail: emailLc }, { $set: joinKeys }),
      UserActivity.updateMany({ userEmail: emailLc }, { $set: joinKeys }),
      GameReward.updateMany({ userEmail: emailLc }, { $set: joinKeys }),
    ]);
  } catch (err) {
    // Re-throw linking conflicts so GET can redirect with the message;
    // anything else is best-effort (dashboard session still works).
    if (err instanceof Error && err.message.includes('already linked')) throw err;
  }
}
