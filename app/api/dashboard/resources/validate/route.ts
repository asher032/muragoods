import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/dashboard/resources/validate — pre-save permission check.
// Body: { guildId, kind: 'channel'|'category'|'role'|'member', id, require?: string[] }
//
// The dashboard calls this BEFORE saving a channel/role/member setting so a
// broken configuration is never stored. The guildId is re-verified (the
// caller must manage the guild right now); the object must exist via the bot
// token; the bot's effective permission is computed from roles + channel
// overwrites — never trusted from the frontend.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCORD_API = 'https://discord.com/api/v10';
const ADMINISTRATOR = BigInt(0x8);

const PERM_BITS: Record<string, { bit: bigint; label: string }> = {
  view: { bit: BigInt(1024), label: 'View Channel' },
  send: { bit: BigInt(2048), label: 'Send Messages' },
  embed: { bit: BigInt(4096), label: 'Embed Links' },
  history: { bit: BigInt(65536), label: 'Read Message History' },
  connect: { bit: BigInt(1048576), label: 'Connect (voice)' },
  speak: { bit: BigInt(2097152), label: 'Speak (voice)' },
};

type Role = { id: string; name: string; permissions: string; position: number; managed: boolean };
type Overwrite = { id: string; type: number; allow: string; deny: string };
type Channel = { id: string; name: string; type: number; guild_id?: string; permission_overwrites?: Overwrite[] };

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN?.trim() || process.env.DISCORD_TOKEN?.trim() || null;
}

type BotGet = {
  ok: boolean;
  status: number;
  data: unknown;
  /** Discord's Retry-After, in ms, when it throttled us. */
  retryAfterMs?: number;
  /** True when we never got an answer at all (timeout, DNS, refused). */
  transport: boolean;
};

async function botGet(path: string, bToken: string): Promise<BotGet> {
  let resp: Response;
  try {
    resp = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${bToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, status: 0, data: null, transport: true };
  }
  if (!resp.ok) {
    if (resp.status === 429) {
      const raw = Number(resp.headers.get('retry-after') ?? '1');
      const secs = Number.isFinite(raw) && raw >= 0 ? Math.min(60, Math.ceil(raw)) : 1;
      return { ok: false, status: 429, data: null, transport: false, retryAfterMs: secs * 1000 };
    }
    return { ok: false, status: resp.status, data: null, transport: false };
  }
  return { ok: true, status: resp.status, data: await resp.json().catch(() => null), transport: false };
}

/**
 * Name a Discord read failure precisely.
 *
 * This used to answer every transport problem with one sentence, shown under a
 * channel field as if the channel were broken. A throttle, an outage and a
 * dropped connection are three different facts with three different remedies,
 * and none of them is a statement about the selected channel.
 */
function discordFailure(res: BotGet): {
  status: number; code: string; message: string; retryable: true; retryAfterMs?: number;
} {
  if (res.status === 429) {
    return {
      status: 429, code: 'DISCORD_RATE_LIMITED', retryable: true, retryAfterMs: res.retryAfterMs ?? 1000,
      message: `Discord is rate limiting dashboard requests. Retrying in ${Math.round((res.retryAfterMs ?? 1000) / 1000)}s — nothing about ${'the selected object'} is wrong.`,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      status: 502, code: 'DISCORD_AUTH_ERROR', retryable: true,
      message: 'Discord rejected the dashboard\'s bot credentials (HTTP '
        + `${res.status}). The object has NOT been checked — this is a dashboard credential problem, not a channel problem.`,
    };
  }
  if (res.status >= 500) {
    return {
      status: 502, code: 'DISCORD_API_ERROR', retryable: true,
      message: `Discord answered with HTTP ${res.status}. The object has NOT been checked — try again in a moment.`,
    };
  }
  return {
    status: 502, code: 'DISCORD_UNREACHABLE', retryable: true,
    message: 'Discord did not respond in time. The object has NOT been checked — try again in a moment.',
  };
}

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, valid: false, message, checks: [], ...(code ? { code } : {}) }, { status });
}

/**
 * One credential-free line per check.
 *
 * Records what a failed save needs to be diagnosable: which request, which
 * guild, which resource kind, which outcome, which status, how long. The
 * selected OBJECT id is deliberately omitted — it is not needed to classify
 * the failure and is not something to copy into a log.
 */
function logValidate(requestId: string, guildId: string, kind: string, outcome: string, status = 0, ms?: number) {
  console.log(
    `[validate] ${requestId} guild=${guildId} kind=${kind} outcome=${outcome}`
    + ` status=${status}${ms === undefined ? '' : ` duration=${ms}ms`}`,
  );
}

/**
 * A failure that means "the check did not run", as opposed to "your value is
 * wrong".
 *
 * The distinction is the whole point of this endpoint. `valid: false` on its
 * own reads as a verdict, and a verdict about a channel that was never
 * examined is a lie — it is what produced "Raid Alerts — Validation failed
 * (HTTP 502) … Fix the selection above". Every such response now says
 * `verified: false` and carries a code the UI can classify.
 */
function unverifiable(message: string, status: number, code: string, retryable = true, retryAfterMs?: number, requestId = '') {
  return NextResponse.json(
    {
      success: false, valid: false, verified: false, objectName: null, checks: [],
      code, message, retryable, requestId,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    },
    {
      status,
      headers: retryAfterMs !== undefined
        ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
        : undefined,
    },
  );
}

export async function POST(req: NextRequest) {
  // Correlation id for the log line and the client, so a report of "it failed"
  // can be traced to one request without exposing anything sensitive.
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const started = Date.now();
  const userToken = await sessionToken();
  const bToken = botToken();
  if (!userToken) return bad('Sign in with Discord to continue', 401, 'AUTH_REQUIRED');
  if (!bToken) {
    // No site-side bot token: we cannot verify. That is a DEPLOYMENT state,
    // not a problem with the operator's selection.
    return unverifiable(
      'The dashboard cannot verify server resources right now (no bot token configured). '
      + 'This selection was NOT checked.',
      503, 'BOT_CREDENTIAL_MISSING', true, undefined, requestId,
    );
  }

  const body = (await req.json().catch(() => null)) as {
    guildId?: string; kind?: string; id?: string; require?: string[];
  } | null;
  const guildId = String(body?.guildId || '');
  const kind = String(body?.kind || '');
  const objectId = String(body?.id || '');
  const require = Array.isArray(body?.require) ? body.require.map(String).filter((r) => r in PERM_BITS) : [];
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(objectId)) {
    return bad('Valid guildId and object id are required', 400, 'INVALID_GUILD_ID');
  }
  logValidate(requestId, guildId, kind, 'START');
  if (!['channel', 'category', 'role', 'member'].includes(kind)) {
    return bad('kind must be channel, category, role or member', 400, 'INVALID_OP');
  }

  // Caller must manage this guild right now — the id is never trusted.
  // Distinct codes: dead token ≠ non-member ≠ unmanaged ≠ Discord outage.
  const manage = await requireGuildManage(userToken, guildId);
  if (!manage.ok) return bad(manage.error, manage.status, manage.code);

  // Bot presence + identity in this guild.
  const botMemberRes = await botGet(`/guilds/${guildId}/members/@me`, bToken);
  // Tri-state bot presence: ONLY a real Discord 404 means "not installed".
  // A 429/5xx/timeout/Cloudflare block must surface as unverifiable (with
  // retry), never as a false "not a member" verdict that sticks.
  if (!botMemberRes.ok) {
    if (botMemberRes.status === 404) {
      // BOT_NOT_IN_GUILD: the bot itself is not on this server. Nothing about
      // the selected channel is wrong yet — the bot must be invited first.
      return NextResponse.json({
        success: true, valid: false, objectName: null,
        code: 'BOT_NOT_IN_GUILD',
        checks: [{ key: 'installed', label: 'Bot installed on this server', ok: false }],
        message: 'The bot is not a member of this server (BOT_NOT_IN_GUILD). Invite it first — the channel itself has not been checked yet.',
      });
    }
    const failure = discordFailure(botMemberRes);
    logValidate(requestId, guildId, kind, failure.code, failure.status);
    return unverifiable(
      failure.message,
      failure.status, failure.code, failure.retryable, failure.retryAfterMs, requestId,
    );
  }
  const botMember = botMemberRes.data as { user: { id: string }; roles: string[] };
  const rolesRes = await botGet(`/guilds/${guildId}/roles`, bToken);
  if (!rolesRes.ok || !Array.isArray(rolesRes.data)) {
    // Without the role table the permission maths below silently degrades to
    // "the bot has no permissions", which is a false accusation. Refuse to
    // answer instead of answering wrongly.
    const failure = discordFailure(rolesRes);
    logValidate(requestId, guildId, kind, failure.code, failure.status);
    return unverifiable(failure.message, failure.status, failure.code, failure.retryable, failure.retryAfterMs, requestId);
  }
  const roles = rolesRes.data as Role[];
  const roleById = new Map(roles.map((r) => [r.id, r]));

  // Base permissions = OR of the bot's role grants; Administrator wins all.
  let base = BigInt(0);
  for (const rid of botMember.roles ?? []) {
    const r = roleById.get(rid);
    if (r) { try { base |= BigInt(r.permissions); } catch { /* ignore */ } }
  }
  // @everyone role (id == guild id) always applies.
  const everyone = roleById.get(guildId);
  if (everyone) { try { base |= BigInt(everyone.permissions); } catch { /* ignore */ } }
  const isAdmin = (base & ADMINISTRATOR) !== BigInt(0);
  const botTop = Math.max(0, ...(botMember.roles ?? []).map((rid) => roleById.get(rid)?.position ?? 0));

  const checks: Array<{ key: string; label: string; ok: boolean }> = [];
  let objectName: string | null = null;

  if (kind === 'channel' || kind === 'category') {
    const chRes = await botGet(`/channels/${objectId}`, bToken);
    if (!chRes.ok || !chRes.data || typeof chRes.data !== 'object') {
      // CHANNEL_NOT_FOUND: Discord does not know this id at all. It was
      // deleted, or it belongs to a server the bot cannot see. A 403 here is
      // ACCESS rather than absence and is reported separately below.
      if (chRes.status === 403) {
        return NextResponse.json({
          success: true, valid: false, objectName: null,
          code: 'CHANNEL_ACCESS_DENIED',
          checks: [{ key: 'access', label: 'Murabot can access this channel', ok: false }],
          message: 'Murabot cannot access that channel (CHANNEL_ACCESS_DENIED). Check the channel\'s permission overwrites, then select it again.',
        });
      }
      // Only a real 404 means absence. A throttle, a 5xx or a dropped
      // connection means we never learned whether the channel exists, and
      // reporting that as CHANNEL_NOT_FOUND would tell the operator their
      // channel was deleted when it was not.
      if (chRes.status !== 404) {
        const failure = discordFailure(chRes);
        logValidate(requestId, guildId, kind, failure.code, failure.status);
        return unverifiable(failure.message, failure.status, failure.code, failure.retryable, failure.retryAfterMs, requestId);
      }
      return NextResponse.json({
        success: true, valid: false, objectName: null,
        code: 'CHANNEL_NOT_FOUND',
        checks: [{ key: 'exists', label: 'Channel still exists', ok: false }],
        message: 'That channel no longer exists (CHANNEL_NOT_FOUND). It was probably deleted — select another channel.',
      });
    }
    const ch = chRes.data as Channel;
    if (ch.guild_id && ch.guild_id !== guildId) {
      return NextResponse.json({
        success: true, valid: false, objectName,
        code: 'CHANNEL_NOT_FOUND',
        checks: [{ key: 'exists', label: 'Channel belongs to this server', ok: false }],
        message: 'That channel belongs to a different server (CHANNEL_NOT_FOUND).',
      });
    }
    if (kind === 'category' && ch.type !== 4) {
      return NextResponse.json({
        success: true, valid: false, objectName: ch.name,
        checks: [{ key: 'type', label: 'Selection is a category', ok: false }],
        message: `"${ch.name}" is not a category. Pick a category.`,
      });
    }
    objectName = ch.name;
    checks.push({ key: 'exists', label: 'Channel found', ok: true });

    // Effective permissions: base roles, then @everyone / role / member
    // overwrites on this channel (deny clears, allow sets).
    let effective = base;
    const apply = (allow: string, deny: string) => {
      try { effective = (effective & ~BigInt(deny)) | BigInt(allow); } catch { /* ignore */ }
    };
    const ows = ch.permission_overwrites ?? [];
    for (const o of ows.filter((o) => o.type === 0 && o.id === guildId)) apply(o.allow, o.deny);
    let allow = BigInt(0);
    let deny = BigInt(0);
    for (const o of ows.filter((o) => o.type === 0 && (botMember.roles ?? []).includes(o.id))) {
      try { allow |= BigInt(o.allow); deny |= BigInt(o.deny); } catch { /* ignore */ }
    }
    try { effective = (effective & ~deny) | allow; } catch { /* ignore */ }
    for (const o of ows.filter((o) => o.type === 1 && o.id === botMember.user.id)) apply(o.allow, o.deny);

    if (isAdmin) {
      checks.push({ key: 'perms', label: 'Bot has Administrator — all permissions granted', ok: true });
    } else {
      for (const r of require.length ? require : ['view', 'send']) {
        const spec = PERM_BITS[r];
        const ok = (effective & spec.bit) !== BigInt(0);
        checks.push({ key: `perm:${r}`, label: `Bot can: ${spec.label}`, ok });
      }
    }
  } else if (kind === 'role') {
    const role = roleById.get(objectId);
    if (!role || role.id === guildId) {
      return NextResponse.json({
        success: true, valid: false, objectName,
        checks: [{ key: 'exists', label: 'Role still exists', ok: false }],
        message: 'That role no longer exists. Choose another one.',
      });
    }
    if (role.managed) {
      return NextResponse.json({
        success: true, valid: false, objectName: role.name,
        checks: [{ key: 'managed', label: 'Role is assignable (not integration-managed)', ok: false }],
        message: `"${role.name}" is managed by an integration and cannot be used here.`,
      });
    }
    objectName = role.name;
    checks.push({ key: 'exists', label: 'Role found', ok: true });
    if (isAdmin) {
      checks.push({ key: 'hierarchy', label: 'Bot has Administrator — hierarchy bypassed', ok: true });
    } else {
      const ok = botTop > role.position;
      checks.push({ key: 'hierarchy', label: "Bot's role is above this role", ok });
    }
  } else {
    // kind === 'member'
    const mRes = await botGet(`/guilds/${guildId}/members/${objectId}`, bToken);
    if (!mRes.ok) {
      if (mRes.status !== 404) {
        const failure = discordFailure(mRes);
        logValidate(requestId, guildId, kind, failure.code, failure.status);
        return unverifiable(failure.message, failure.status, failure.code, failure.retryable, failure.retryAfterMs, requestId);
      }
      return NextResponse.json({
        success: true, valid: false, objectName,
        code: 'MEMBER_NOT_IN_GUILD',
        checks: [{ key: 'exists', label: 'Member is still on this server', ok: false }],
        message: 'That member is no longer on this server.',
      });
    }
    const m = mRes.data as { user?: { username?: string; global_name?: string | null }; nick?: string | null };
    objectName = m.nick || m.user?.global_name || m.user?.username || 'Member';
    checks.push({ key: 'exists', label: 'Member found', ok: true });
  }

  const valid = checks.every((c) => c.ok);
  logValidate(requestId, guildId, kind, valid ? 'VERIFIED_OK' : 'VERIFIED_REJECTED', 200, Date.now() - started);
  // Permission failures are ACCESS, not absence. The code lets the UI say so
  // instead of implying the channel was deleted.
  const code = valid
    ? undefined
    : kind === 'channel' || kind === 'category'
      ? 'CHANNEL_ACCESS_DENIED'
      : kind === 'role' ? 'ROLE_ACCESS_DENIED' : undefined;
  return NextResponse.json({
    success: true,
    valid,
    // The check RAN. Clients may treat `valid: false` here as a verdict.
    verified: true,
    requestId,
    objectName,
    ...(code ? { code } : {}),
    checks,
    message: valid
      ? 'Ready to use.'
      : (kind === 'channel' || kind === 'category'
        ? 'Murabot lacks a required permission in that channel (CHANNEL_ACCESS_DENIED). Fix the channel permissions in Discord, then save again.'
        : 'Fix the failed checks in Discord, then save again.'),
  });
}
