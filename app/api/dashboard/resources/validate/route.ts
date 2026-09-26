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

async function botGet(path: string, bToken: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const resp = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${bToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { ok: false, status: resp.status, data: null };
    return { ok: true, status: resp.status, data: await resp.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, valid: false, message, checks: [], ...(code ? { code } : {}) }, { status });
}

export async function POST(req: NextRequest) {
  const userToken = await sessionToken();
  const bToken = botToken();
  if (!userToken) return bad('Sign in with Discord to continue', 401, 'AUTH_REQUIRED');
  if (!bToken) return bad('Dashboard resource access is not configured (DISCORD_BOT_TOKEN).', 503, 'BOT_NOT_CONFIGURED');

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
  if (!['channel', 'category', 'role', 'member'].includes(kind)) {
    return bad('kind must be channel, category, role or member', 400, 'INVALID_OP');
  }

  // Caller must manage this guild right now — the id is never trusted.
  // Distinct codes: dead token ≠ non-member ≠ unmanaged ≠ Discord outage.
  const manage = await requireGuildManage(userToken, guildId);
  if (!manage.ok) return bad(manage.error, manage.status, manage.code);

  // Bot presence + identity in this guild.
  const botMemberRes = await botGet(`/guilds/${guildId}/members/@me`, bToken);
  if (!botMemberRes.ok) {
    return NextResponse.json({
      success: true, valid: false, objectName: null,
      checks: [{ key: 'installed', label: 'Bot installed on this server', ok: false }],
      message: 'The bot is not a member of this server. Invite it first.',
    });
  }
  const botMember = botMemberRes.data as { user: { id: string }; roles: string[] };
  const rolesRes = await botGet(`/guilds/${guildId}/roles`, bToken);
  const roles = (rolesRes.ok && Array.isArray(rolesRes.data) ? rolesRes.data : []) as Role[];
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
      return NextResponse.json({
        success: true, valid: false, objectName,
        checks: [{ key: 'exists', label: 'Channel still exists', ok: false }],
        message: 'That channel no longer exists. Choose another one.',
      });
    }
    const ch = chRes.data as Channel;
    if (ch.guild_id && ch.guild_id !== guildId) {
      return NextResponse.json({
        success: true, valid: false, objectName,
        checks: [{ key: 'exists', label: 'Channel belongs to this server', ok: false }],
        message: 'That channel belongs to a different server.',
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
      return NextResponse.json({
        success: true, valid: false, objectName,
        checks: [{ key: 'exists', label: 'Member is still on this server', ok: false }],
        message: mRes.status === 404
          ? 'That member is no longer on this server.'
          : 'The bot cannot see that member. Check its permissions.',
      });
    }
    const m = mRes.data as { user?: { username?: string; global_name?: string | null }; nick?: string | null };
    objectName = m.nick || m.user?.global_name || m.user?.username || 'Member';
    checks.push({ key: 'exists', label: 'Member found', ok: true });
  }

  const valid = checks.every((c) => c.ok);
  return NextResponse.json({
    success: true,
    valid,
    objectName,
    checks,
    message: valid
      ? 'Ready to use.'
      : 'Fix the failed checks in Discord, then save again.',
  });
}
