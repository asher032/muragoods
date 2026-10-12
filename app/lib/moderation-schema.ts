/**
 * The ONE description of Murabot's moderation and security configuration.
 *
 * Why this file exists rather than validation inline in the config route: the
 * bot and the dashboard both parse these fields, and the failure mode of two
 * parsers is not "a field is rejected" — it is a field that is *saved and then
 * silently ignored*, or a rule that the dashboard advertises with a threshold
 * Murabot quietly rewrites. Phase 2 hit exactly that with general settings, and
 * the fix there was one canonical list plus a test that pins the two sides
 * together. This is the moderation/security equivalent:
 *
 *   - `satisfies` the same key sets the bot's `automod.py` / `security.py` read
 *   - the same numeric bounds (`LIMITS` in both Python modules)
 *   - the same action names and the same permission each action needs
 *
 * `scripts/test-phase3-moderation.mjs` reads this file and the Python sources
 * and fails when any of those three drift apart.
 */

// ── Audit sources (mirror of database.AUDIT_SOURCES) ─────────────────────
export const AUDIT_SOURCES = ['discord', 'dashboard', 'automod', 'anti-raid', 'system', 'verification'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

// ── AutoMod (mirror of automod.py RULES / ACTIONS / LIMITS) ──────────────
export const AUTOMOD_RULES = ['spam', 'mentions', 'words', 'duplicates', 'zalgo', 'links'] as const;
export const AUTOMOD_ACTIONS = ['none', 'delete', 'warn', 'timeout', 'kick', 'ban'] as const;

/** Numeric bounds, identical to `automod.LIMITS` and `security.LIMITS`. */
export const MODERATION_LIMITS = {
  messageLimit: [2, 50],
  windowSeconds: [2, 600],
  mentionThreshold: [2, 50],
  duplicateThreshold: [2, 20],
  duplicateWindowSeconds: [5, 900],
  zalgoRatioPercent: [5, 90],
  zalgoMinLength: [4, 400],
  cooldownSeconds: [0, 3600],
  durationMinutes: [1, 40320],
  wordCount: [0, 200],
  allowedDomainCount: [0, 100],
} as const;

export const SECURITY_LIMITS = {
  joinSpikeThreshold: [3, 100],
  joinWindowSeconds: [5, 600],
  minAccountAgeHours: [0, 168],
  raidTimeoutMinutes: [1, 40320],
  raidModeMinutes: [1, 1440],
  deleteSpikeThreshold: [3, 100],
  deleteWindowSeconds: [5, 600],
} as const;

export const SECURITY_ACTIONS = ['none', 'timeout', 'kick', 'ban'] as const;

/**
 * Every key persisted under `securitySettings`, in the order the UI shows them.
 * The bot's `SecurityCog.DEFAULTS` must contain exactly these keys.
 */
export const SECURITY_KEYS = [
  'antiRaidEnabled',
  'joinSpikeThreshold',
  'joinWindowSeconds',
  'minAccountAgeHours',
  'raidAction',
  'raidTimeoutMinutes',
  'raidModeMinutes',
  'antiNukeEnabled',
  'deleteSpikeThreshold',
  'deleteWindowSeconds',
  'alertChannelId',
  'verificationEnabled',
  'verificationRoleId',
  'verificationChannelId',
  'restoreRolesOnRejoin',
  'restoreDangerousRoles',
  'antiChannelDeletionEnabled',
  'antiRoleDeletionEnabled',
  'antiMassBanEnabled',
  'antiMassKickEnabled',
  'antiBotEnabled',
  'antiWebhookEnabled',
  'suspiciousAccountDetectionEnabled',
  'memberActionSpikeThreshold',
  'botJoinAction',
] as const;

/** `moderation.*` keys the bot still reads directly (not inside automod). */
export const MODERATION_FLAT_KEYS = [
  'modRoleId',
  'logChannelId',
  'automodEnabled',
  'antiSpam',
  'antiLink',
  'antiInvite',
  'antiCaps',
  'capsThreshold',
  'mentionThreshold',
  'mentionSpam',
  'badWordsFilter',
  'capsFilter',
  'duplicateDetection',
  'restoreRolesOnRejoin',
  'restoreDangerousRoles',
] as const;

/** `moderation.automod.*` keys (all optional — absent means "use the default"). */
export const AUTOMOD_KEYS = [
  'enabled',
  'cooldownSeconds',
  'ignoredChannelIds',
  'ignoredRoleIds',
  'logChannelId',
  'notifyUser',
  'escalation',
  'rules',
] as const;

// ── Per-action authorization (mirror of modservice.USER_PERMISSIONS) ─────
/**
 * Discord permission bits, as BigInt. `MODERATE_MEMBERS` is `1 << 40`, which is
 * why this cannot be done with a 32-bit number.
 */
export const PERMISSION_BITS: Record<string, bigint> = {
  administrator: BigInt(1) << BigInt(3),
  kick_members: BigInt(1) << BigInt(1),
  ban_members: BigInt(1) << BigInt(2),
  manage_guild: BigInt(1) << BigInt(5),
  manage_channels: BigInt(1) << BigInt(4),
  manage_messages: BigInt(1) << BigInt(13),
  manage_roles: BigInt(1) << BigInt(28),
  manage_webhooks: BigInt(1) << BigInt(29),
  mention_everyone: BigInt(1) << BigInt(17),
  moderate_members: BigInt(1) << BigInt(40),
};

export const PERMISSION_LABELS: Record<string, string> = {
  ban_members: 'Ban Members',
  kick_members: 'Kick Members',
  manage_roles: 'Manage Roles',
  moderate_members: 'Timeout Members',
  manage_channels: 'Manage Channels',
  manage_messages: 'Manage Messages',
  manage_guild: 'Manage Server',
};

/**
 * Which Discord permission each moderation action needs — the same matrix as
 * `modservice.USER_PERMISSIONS`. The dashboard checks it so a moderator who may
 * open the page but not ban gets a refusal from the site; the BOT checks it
 * again against live Discord state, so the browser can never be the authority.
 */
export const ACTION_PERMISSIONS: Record<string, string> = {
  ban: 'ban_members',
  softban: 'ban_members',
  tempban: 'ban_members',
  unban: 'ban_members',
  kick: 'kick_members',
  timeout: 'moderate_members',
  removetimeout: 'moderate_members',
  mute: 'manage_roles',
  hardmute: 'manage_roles',
  unmute: 'manage_roles',
  warn: 'manage_roles',
  restore_roles: 'manage_roles',
  lockdown: 'manage_channels',
  unlock: 'manage_channels',
  purge: 'manage_guild',
};

export interface ActionPermissionVerdict {
  ok: boolean;
  permission: string;
  label: string;
}

/**
 * Does this OAuth identity hold the permission for `action`?
 *
 * `owner` is Discord's own guild-owner flag from the user's guild list, so a
 * server owner is never blocked by a missing bit. `permissions` is the bitfield
 * Discord returned for that guild — an untrusted-looking string is treated as
 * "no permission" rather than throwing, and an unknown action falls back to the
 * Manage Server requirement the route already enforces.
 */
export function checkActionPermission(
  owner: boolean,
  permissions: string | number | undefined,
  action: string,
): ActionPermissionVerdict {
  const attr = ACTION_PERMISSIONS[action] || 'manage_guild';
  const label = PERMISSION_LABELS[attr] || attr;
  if (owner) return { ok: true, permission: attr, label };
  let bits: bigint;
  try {
    bits = BigInt(permissions ?? 0);
  } catch {
    return { ok: false, permission: attr, label };
  }
  const needed = PERMISSION_BITS[attr];
  if (needed === undefined) return { ok: false, permission: attr, label };
  if ((bits & PERMISSION_BITS.administrator) !== BigInt(0)) {
    return { ok: true, permission: attr, label };
  }
  return { ok: (bits & needed) !== BigInt(0), permission: attr, label };
}

// ── Normalisation helpers ────────────────────────────────────────────────
function clamp(key: keyof typeof MODERATION_LIMITS | keyof typeof SECURITY_LIMITS,
               value: unknown, fallback: number): number {
  const range = (MODERATION_LIMITS as Record<string, readonly [number, number]>)[key as string]
    ?? (SECURITY_LIMITS as Record<string, readonly [number, number]>)[key as string];
  const [low, high] = range ?? [fallback, fallback];
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(low, Math.min(high, Math.floor(n)));
}

function strList(value: unknown, limit: number, maxLen = 80): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = String(item ?? '').trim().slice(0, maxLen);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function idList(value: unknown, limit = 50): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const id = String(item ?? '').trim();
    if (/^\d{5,25}$/.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

function action(value: unknown, fallback: string): string {
  const v = String(value ?? fallback).toLowerCase();
  return (AUTOMOD_ACTIONS as readonly string[]).includes(v) ? v : fallback;
}

/**
 * The AutoMod block to persist, derived from whatever the UI sent.
 *
 * Absent keys fall through to the flat dashboard toggles the UI has always
 * written (antiSpam / antiLink / antiInvite / antiCaps / mentionThreshold), so
 * an operator who only ever touched a toggle keeps exactly that behaviour. The
 * bot re-derives its own copy of this precedence in `automod.normalize_config`
 * and both are asserted to agree.
 */
export function normalizeAutomod(mod: Record<string, unknown>): Record<string, unknown> {
  const raw = (mod.automod && typeof mod.automod === 'object' ? mod.automod : {}) as Record<string, unknown>;
  const rules = (raw.rules && typeof raw.rules === 'object' ? raw.rules : {}) as Record<string, Record<string, unknown>>;
  const rule = (name: string) => (rules[name] && typeof rules[name] === 'object' ? rules[name] : {});
  const spam = rule('spam');
  const mentions = rule('mentions');
  const words = rule('words');
  const duplicates = rule('duplicates');
  const zalgo = rule('zalgo');
  const links = rule('links');

  const escalation = Array.isArray(mod.escalation)
    ? (mod.escalation as unknown[]).map((s) => String(s).slice(0, 20)).slice(0, 5)
    : [];

  return {
    enabled: raw.enabled === undefined ? Boolean(mod.automodEnabled) : Boolean(raw.enabled),
    cooldownSeconds: clamp('cooldownSeconds', raw.cooldownSeconds, 30),
    ignoredChannelIds: idList(raw.ignoredChannelIds),
    ignoredRoleIds: idList(raw.ignoredRoleIds),
    logChannelId: String(raw.logChannelId ?? mod.logChannelId ?? '').slice(0, 25),
    notifyUser: raw.notifyUser !== false,
    escalation: escalation.length ? escalation : ['warn', 'timeout', 'timeout', 'kick', 'ban'],
    rules: {
      spam: {
        enabled: spam.enabled === undefined ? mod.antiSpam !== false : Boolean(spam.enabled),
        messageLimit: clamp('messageLimit', spam.messageLimit, 6),
        windowSeconds: clamp('windowSeconds', spam.windowSeconds, 10),
        action: action(spam.action, 'delete'),
        durationMinutes: clamp('durationMinutes', spam.durationMinutes, 10),
      },
      mentions: {
        enabled: mentions.enabled === undefined ? mod.mentionSpam !== false : Boolean(mentions.enabled),
        threshold: clamp('mentionThreshold', mentions.threshold ?? mod.mentionThreshold, 8),
        action: action(mentions.action, 'delete'),
        durationMinutes: clamp('durationMinutes', mentions.durationMinutes, 10),
      },
      words: {
        enabled: words.enabled === undefined ? Boolean(mod.badWordsFilter) : Boolean(words.enabled),
        words: strList(words.words, MODERATION_LIMITS.wordCount[1]),
        phrases: strList(words.phrases, MODERATION_LIMITS.wordCount[1], 120),
        action: action(words.action, 'delete'),
        durationMinutes: clamp('durationMinutes', words.durationMinutes, 60),
      },
      duplicates: {
        enabled: duplicates.enabled === undefined ? Boolean(mod.duplicateDetection) : Boolean(duplicates.enabled),
        threshold: clamp('duplicateThreshold', duplicates.threshold, 3),
        windowSeconds: clamp('duplicateWindowSeconds', duplicates.windowSeconds, 60),
        action: action(duplicates.action, 'delete'),
        durationMinutes: clamp('durationMinutes', duplicates.durationMinutes, 10),
      },
      zalgo: {
        enabled: zalgo.enabled !== false,
        ratioPercent: clamp('zalgoRatioPercent', zalgo.ratioPercent, 30),
        minLength: clamp('zalgoMinLength', zalgo.minLength, 12),
        action: action(zalgo.action, 'delete'),
        durationMinutes: clamp('durationMinutes', zalgo.durationMinutes, 10),
      },
      links: {
        enabled: links.enabled === undefined ? Boolean(mod.antiLink) : Boolean(links.enabled),
        blockInvites: links.blockInvites === undefined ? Boolean(mod.antiInvite) : Boolean(links.blockInvites),
        allowedDomains: strList(links.allowedDomains, MODERATION_LIMITS.allowedDomainCount[1], 120),
        action: action(links.action, 'delete'),
        durationMinutes: clamp('durationMinutes', links.durationMinutes, 10),
      },
    },
  };
}

/** The exact `securitySettings` document the bot's SecurityCog reads. */
export function normalizeSecuritySettings(input: Record<string, unknown>): Record<string, unknown> {
  const s = input && typeof input === 'object' ? input : {};
  return {
    antiRaidEnabled: s.antiRaidEnabled !== false,
    joinSpikeThreshold: clamp('joinSpikeThreshold', s.joinSpikeThreshold, 8),
    joinWindowSeconds: clamp('joinWindowSeconds', s.joinWindowSeconds, 20),
    minAccountAgeHours: clamp('minAccountAgeHours', s.minAccountAgeHours, 24),
    raidAction: (SECURITY_ACTIONS as readonly string[]).includes(String(s.raidAction))
      ? String(s.raidAction) : 'timeout',
    raidTimeoutMinutes: clamp('raidTimeoutMinutes', s.raidTimeoutMinutes, 30),
    raidModeMinutes: clamp('raidModeMinutes', s.raidModeMinutes, 10),
    antiNukeEnabled: s.antiNukeEnabled !== false,
    deleteSpikeThreshold: clamp('deleteSpikeThreshold', s.deleteSpikeThreshold, 6),
    deleteWindowSeconds: clamp('deleteWindowSeconds', s.deleteWindowSeconds, 30),
    alertChannelId: String(s.alertChannelId ?? '').slice(0, 25),
    verificationEnabled: Boolean(s.verificationEnabled),
    verificationRoleId: String(s.verificationRoleId ?? '').slice(0, 25),
    verificationChannelId: String(s.verificationChannelId ?? '').slice(0, 25),
    // Restoring roles is on by default; restoring roles that carry power is an
    // explicit opt-in, because "give them back what they had" must not quietly
    // re-grant Administrator to an account someone else now controls.
    restoreRolesOnRejoin: s.restoreRolesOnRejoin !== false,
    restoreDangerousRoles: Boolean(s.restoreDangerousRoles),
    antiChannelDeletionEnabled: s.antiChannelDeletionEnabled !== false,
    antiRoleDeletionEnabled: s.antiRoleDeletionEnabled !== false,
    antiMassBanEnabled: s.antiMassBanEnabled !== false,
    antiMassKickEnabled: s.antiMassKickEnabled !== false,
    antiBotEnabled: s.antiBotEnabled !== false,
    antiWebhookEnabled: s.antiWebhookEnabled !== false,
    suspiciousAccountDetectionEnabled: s.suspiciousAccountDetectionEnabled !== false,
    memberActionSpikeThreshold: clamp('deleteSpikeThreshold', s.memberActionSpikeThreshold, 5),
    botJoinAction: ['alert', 'kick'].includes(String(s.botJoinAction)) ? String(s.botJoinAction) : 'alert',
  };
}
