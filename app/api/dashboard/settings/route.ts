import { NextRequest, NextResponse } from 'next/server';
import { requireSession, sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { verifyBotInGuild } from '@/app/lib/discord-bot';
import { validateChannelSetting } from '@/app/lib/discord-channels';
import { apiFail, logApi } from '@/app/lib/dashboard-response';
import { auditConfigChange, diffConfigUpdate } from '@/app/lib/dashboard-audit';
import {
  DEFAULT_PREFIX,
  readGuildGeneralFields,
  readGuildPrefix,
  saveGuildGeneralFields,
  saveGuildPrefix,
  validatePrefix,
  verifyGuildGeneralWithBot,
  type PropagationState,
} from '@/app/lib/murabot-config';
import {
  GENERAL_ERROR_CODES,
  GENERAL_FIELD_LABELS,
  GENERAL_SETTINGS_FIELDS,
  MESSAGE_MAX_LENGTH,
  MESSAGE_PLACEHOLDERS,
  SUPPORTED_LANGUAGES,
  changedGeneralFields,
  normalizeGeneralSettings,
  validateGeneralDraft,
  type GeneralFieldError,
  type GeneralSettings,
} from '@/app/lib/general-settings';

export const dynamic = 'force-dynamic';

// ── General bot settings ─────────────────────────────────────────────────
//
// GET  /api/dashboard/settings?guildId=…   read the server's real settings
// PATCH /api/dashboard/settings            validate, persist, and apply
//
// The rules this route holds to, in the order they are applied:
//
//   1. AUTHORIZATION IS SERVER-SIDE. Every request re-resolves the caller's
//      live Discord permission for THIS guild. The cookie, the query string and
//      the body are all untrusted input; none of them carries a guild id the
//      route believes.
//   2. DISCORD-MANAGED INFORMATION IS NEVER WRITTEN. Name, icon and id come
//      from Discord on every read and are returned for display only — they are
//      not editable here because Murabot does not own them.
//   3. EVERY SETTING IS VALIDATED BEFORE ANYTHING IS WRITTEN. A bad channel
//      saves nothing at all: no half-applied form, and the operator is told
//      which field failed and why.
//   4. SAVED IS NOT THE SAME AS APPLIED. The response distinguishes a value
//      Murabot read back ('applied') from one that is stored and waiting
//      ('pending'), and never dresses the second up as the first.

const SNOWFLAKE = /^\d{5,25}$/;

function bad(
  code: string,
  error: string,
  status: number,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({ success: false, code, error, ...extra }, { status });
}

/** Map a failed manage check onto the route's response — never a collapsed 403. */
function denyFrom(check: { code: string; status: number; error: string; retryable: boolean; retryAfterMs?: number }) {
  return bad(check.code, check.error, check.status, {
    retryable: check.retryable,
    ...(check.retryAfterMs !== undefined ? { retryAfterMs: check.retryAfterMs } : {}),
  });
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const token = await sessionToken();
    const guildId = req.nextUrl.searchParams.get('guildId') || '';
    if (!token) return bad('AUTH_REQUIRED', 'Sign in with Discord to continue', 401);
    if (!SNOWFLAKE.test(guildId)) return bad('INVALID_GUILD_ID', 'Valid guildId required', 400);

    const check = await requireGuildManage(token, guildId);
    if (!check.ok) {
      logApi('/api/dashboard/settings', 'GET', check.status, Date.now() - started, check.code);
      return denyFrom(check);
    }

    // The stored document is read ONCE and split into the two halves the UI
    // must keep apart: Murabot's editable settings, and Discord's own facts.
    const [prefix, stored, presence, readBack] = await Promise.all([
      readGuildPrefix(guildId),
      readGuildGeneralFields(guildId),
      verifyBotInGuild(guildId),
      verifyGuildGeneralWithBot(guildId),
    ]);
    const settings = normalizeGeneralSettings({ ...(stored ?? {}), prefix }, DEFAULT_PREFIX);

    logApi('/api/dashboard/settings', 'GET', 200, Date.now() - started);
    return NextResponse.json({
      success: true,
      settings,
      // Discord-managed, read-only. From Discord on every read — never stored.
      discord: {
        id: check.guild.id,
        name: check.guild.name,
        icon: check.guild.icon,
        owner: check.guild.owner,
      },
      bot: {
        // Tri-state: only a real Discord 404 means "not installed".
        installed: presence === 'installed' ? true : presence === 'absent' ? false : null,
        online: readBack.confirmed,
        // What Murabot can actually read back, when it answered. null = it did
        // not, which the UI reports as unknown rather than as a mismatch.
        readBack: readBack.confirmed ? readBack.general ?? {} : null,
        readBackReason: readBack.confirmed ? null : readBack.reason ?? 'BOT_UNREACHABLE',
      },
      languages: SUPPORTED_LANGUAGES,
      placeholders: MESSAGE_PLACEHOLDERS,
      defaultPrefix: DEFAULT_PREFIX,
      limits: { message: MESSAGE_MAX_LENGTH },
    });
  } catch {
    logApi('/api/dashboard/settings', 'GET', 502, Date.now() - started, 'DATABASE_ERROR');
    return apiFail('DATABASE_ERROR', 'Settings could not be loaded — retry in a moment.', 502, { retryable: true });
  }
}

// Same contract as GET: an unexpected throw (the session read hits a database
// outage) must still answer JSON, so the dashboard reports a real, retryable
// failure instead of an unparseable HTML error page.
export async function PATCH(req: NextRequest) {
  try {
    return await saveSettings(req);
  } catch {
    return apiFail('INTERNAL_ERROR',
      'The settings could not be saved — the request failed before it reached Discord. Nothing was changed.',
      502, { retryable: true });
  }
}

async function saveSettings(req: NextRequest) {
  const started = Date.now();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad('INVALID_JSON', 'Invalid JSON body', 400);

  const guildId = String(body.guildId || '');
  if (!SNOWFLAKE.test(guildId)) return bad('INVALID_GUILD_ID', 'Valid guildId required', 400);

  // Permission AND identity in one call: the identity comes from the
  // server-side session document, never from the request body.
  const auth = await requireSession(guildId);
  if (!auth.ok) {
    logApi('/api/dashboard/settings', 'PATCH', auth.status, Date.now() - started, auth.code);
    return bad(auth.code ?? 'INSUFFICIENT_GUILD_PERMISSION', auth.error, auth.status, {
      ...(auth.retryAfterMs !== undefined ? { retryAfterMs: auth.retryAfterMs } : {}),
    });
  }

  // Every declared field must be present. A partial write would let an OMITTED
  // key be read as "empty" and clear a setting nobody asked to clear — the
  // dashboard always submits the whole form, so a missing field means the
  // caller is not the dashboard, and the only safe answer is to refuse.
  const incoming = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
    ? (body.settings as Record<string, unknown>)
    : null;
  if (!incoming) {
    return bad('INVALID_SETTINGS', 'A settings object is required.', 400);
  }
  const missing = GENERAL_SETTINGS_FIELDS.filter((key) => !(key in incoming));
  if (missing.length > 0) {
    return bad(
      'INCOMPLETE_SETTINGS',
      `A settings write must include every field (send an empty string to clear one). Missing: ${missing.join(', ')}.`,
      400,
    );
  }

  const draft = validateGeneralDraft(body.settings);
  if (!draft.ok) {
    logApi('/api/dashboard/settings', 'PATCH', 422, Date.now() - started, 'INVALID_SETTINGS');
    return NextResponse.json({
      success: false,
      saved: false,
      code: 'INVALID_SETTINGS',
      errors: draft.errors,
      message: 'Nothing was saved. ' + draft.errors.map((e) => e.message).join(' '),
    }, { status: 422 });
  }

  // The prefix keeps its own canonical validator so both panels reject the same
  // strings with the same wording.
  const rawPrefix = body.settings && typeof body.settings === 'object'
    ? (body.settings as Record<string, unknown>).prefix
    : undefined;
  let nextPrefix: string | null = null;
  if (rawPrefix !== undefined) {
    const valid = validatePrefix(rawPrefix);
    if (!valid.ok) {
      logApi('/api/dashboard/settings', 'PATCH', 400, Date.now() - started, 'INVALID_PREFIX');
      return NextResponse.json({
        success: false,
        saved: false,
        code: 'INVALID_PREFIX',
        errors: [{
          field: 'prefix',
          label: GENERAL_FIELD_LABELS.prefix,
          code: 'INVALID_PREFIX',
          message: valid.error,
        }],
        error: valid.error,
      }, { status: 400 });
    }
    nextPrefix = valid.value;
  }

  // ── Channel settings are verified against Discord BEFORE the write ──────
  // Through Murabot, which holds the connection and the resolved permission
  // overwrites. A channel id that cannot be verified stops the whole save:
  // storing a channel the bot cannot post in is a setting that silently does
  // nothing, which is the failure this dashboard exists to prevent.
  const errors: GeneralFieldError[] = [];
  const channelSpecs: Array<{
    field: 'welcomeChannelId' | 'leaveChannelId';
    label: string;
  }> = [
    { field: 'welcomeChannelId', label: GENERAL_FIELD_LABELS.welcomeChannelId },
    { field: 'leaveChannelId', label: GENERAL_FIELD_LABELS.leaveChannelId },
  ];
  const named = channelSpecs.filter(({ field }) => draft.value[field]);

  if (named.length > 0) {
    const presence = await verifyBotInGuild(guildId);
    if (presence === 'absent') {
      logApi('/api/dashboard/settings', 'PATCH', 404, Date.now() - started, 'BOT_NOT_IN_GUILD');
      return bad(
        GENERAL_ERROR_CODES.BOT_NOT_IN_GUILD,
        'Murabot is not installed on this server, so a welcome or leave channel cannot be checked. '
        + 'Invite the bot first — nothing was saved.',
        404,
      );
    }
    for (const spec of named) {
      const verdict = await validateChannelSetting(
        guildId, spec.field, spec.label, draft.value[spec.field], ['view', 'send', 'embed'],
      );
      if (!verdict) continue;
      errors.push({
        field: spec.field,
        label: spec.label,
        code: verdict.code,
        message: verdict.message ?? 'This channel could not be verified.',
        ...(verdict.retryable !== undefined ? { retryable: verdict.retryable } : {}),
        ...(verdict.missingPermission ? { missingPermission: verdict.missingPermission } : {}),
      });
    }
  }
  if (errors.length > 0) {
    logApi('/api/dashboard/settings', 'PATCH', 422, Date.now() - started, 'CHANNEL_VERIFICATION_FAILED');
    return NextResponse.json({
      success: false,
      saved: false,
      code: 'CHANNEL_VERIFICATION_FAILED',
      errors,
      retryable: errors.some((e) => e.retryable),
      message: 'Nothing was saved. ' + errors.map((e) => `${e.label}: ${e.message}`).join(' '),
    }, { status: 422 });
  }

  // ── Diff, then write only what changed ─────────────────────────────────
  const [storedBefore, prefixBefore] = await Promise.all([
    readGuildGeneralFields(guildId),
    readGuildPrefix(guildId),
  ]);
  const before: GeneralSettings = normalizeGeneralSettings(
    { ...(storedBefore ?? {}), prefix: prefixBefore }, DEFAULT_PREFIX,
  );
  const changed = changedGeneralFields(before, draft.value);
  const prefixChanged = nextPrefix !== null && nextPrefix !== before.prefix;

  if (changed.length === 0 && !prefixChanged) {
    logApi('/api/dashboard/settings', 'PATCH', 200, Date.now() - started, 'NO_CHANGES');
    return NextResponse.json({
      success: true,
      saved: false,
      settings: before,
      propagation: 'applied' satisfies PropagationState,
      appliedInDiscord: true,
      message: 'Nothing to save — these settings already match what Murabot holds.',
    });
  }

  let propagation: PropagationState = 'applied';
  let message = 'Settings saved and applied in Discord.';

  if (prefixChanged && nextPrefix !== null) {
    const result = await saveGuildPrefix(guildId, nextPrefix);
    if (!result.ok) {
      logApi('/api/dashboard/settings', 'PATCH', 503, Date.now() - started, 'SAVE_FAILED');
      return bad('SAVE_FAILED',
        result.message ?? 'Nothing was saved — your previous settings are unchanged.', 503,
        { retryable: true });
    }
    if (result.propagation === 'pending') {
      propagation = 'pending';
      message = result.message ?? 'Saved, but Murabot has not confirmed yet.';
    }
  }

  if (changed.length > 0) {
    const fields = Object.fromEntries(changed.map((key) => [key, draft.value[key]]));
    const result = await saveGuildGeneralFields(guildId, fields);
    if (!result.ok) {
      logApi('/api/dashboard/settings', 'PATCH', 503, Date.now() - started, 'SAVE_FAILED');
      return bad('SAVE_FAILED',
        result.message ?? 'Nothing was saved — your previous settings are unchanged.', 503,
        { retryable: true });
    }
    if (result.propagation === 'pending') {
      propagation = 'pending';
      message = result.message ?? 'Saved, but Murabot has not confirmed yet.';
    }
  }

  // ── Audit: who changed what, with before/after values ──────────────────
  try {
    const actor = auth.username ? `${auth.username} (${auth.discordId})` : `discord:${auth.discordId}`;
    const after = Object.fromEntries(changed.map((key) => [key, draft.value[key]]));
    if (prefixChanged && nextPrefix !== null) after.prefix = nextPrefix;
    const changes = diffConfigUpdate(
      { ...(storedBefore ?? {}), ...(prefixChanged ? { prefix: before.prefix } : {}) },
      after,
    );
    const summary = changes.length
      ? `Updated ${changes.length} general setting${changes.length === 1 ? '' : 's'}: `
        + changes.slice(0, 3).map((c) => c.field).join(', ')
      : 'Saved general settings (no changes)';
    await auditConfigChange(guildId, actor, summary, changes);
  } catch {
    // The audit trail is best-effort; the settings write already succeeded.
  }

  const settings: GeneralSettings = {
    ...before,
    ...Object.fromEntries(changed.map((key) => [key, draft.value[key]])),
    ...(prefixChanged && nextPrefix !== null ? { prefix: nextPrefix } : {}),
  };

  logApi('/api/dashboard/settings', 'PATCH', 200, Date.now() - started, propagation.toUpperCase());
  return NextResponse.json({
    success: true,
    saved: true,
    settings,
    propagation,
    appliedInDiscord: propagation === 'applied',
    message,
  });
}
