'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { ECONOMY_ERROR_CODES, type EconomyFieldError } from '@/app/lib/economy-schema';

// ── 📜 Economy Log Channel selector ─────────────────────────────────────
//
// Populated from Murabot's own gateway cache. The operator never types a
// channel id, and never sees a channel Murabot cannot use presented as a
// normal option.
//
// The bot's state is shown explicitly, because "the list is empty" has two very
// different causes and the operator has to be able to tell them apart:
//
//   Murabot is offline / its gateway is down   → nothing can be verified yet
//   Murabot is not in THIS server              → invite it
//   Murabot is here but lacks a permission    → fix the channel overwrites
//   Murabot is here and the list is empty      → the server has no text channels
//
// Each of those is a different message with a different fix. A single
// "Discord did not answer the bot check" told the operator none of that.

interface ChannelOption {
  id: string;
  name: string;
  type: number;
  categoryName: string | null;
  usable: boolean;
  missing: { requirement: string; permission: string; label: string } | null;
  checks: Array<{ requirement: string; label: string; ok: boolean }>;
}

interface BotPresence {
  online: boolean;
  installed: boolean;
  guildAccessible: boolean;
  botUserId: string | null;
  botUsername: string | null;
  gatewayState: string | null;
  heartbeatAgeSeconds: number | null;
  latencyMs: number | null;
}

const CHANNEL_TYPE_LABEL: Record<number, string> = {
  0: 'Text', 5: 'Announcement', 10: 'Thread', 11: 'Public Thread', 12: 'Private Thread',
};

/** What each failure means and what the operator should do about it. */
const FAILURE_HINT: Record<string, string> = {
  BOT_OFFLINE: 'Murabot is not connected to Discord right now. Nothing about your settings is wrong — this resolves itself when the bot reconnects.',
  BOT_GATEWAY_NOT_READY: 'Murabot is still connecting to Discord. Wait a moment and retry.',
  BOT_NOT_IN_GUILD: 'Murabot is not installed in this server. Invite it, then retry — no setting can be verified until it is here.',
  AUTHENTICATION_ERROR: 'The dashboard and Murabot are not talking to each other correctly. This is a deployment problem, not a settings problem.',
  BRIDGE_NOT_CONFIGURED: 'The dashboard is not connected to Murabot. This is a deployment problem, not a settings problem.',
  DISCORD_RATE_LIMITED: 'Discord is temporarily rate limiting requests. Retrying shortly.',
  DISCORD_API_ERROR: 'Discord did not return the channel list. This is temporary.',
  INTERNAL_ERROR: 'Murabot reported an error while reading this server. Nothing was changed.',
  AUTH_REQUIRED: 'Your Discord sign-in expired. Sign in again to continue.',
  INSUFFICIENT_GUILD_PERMISSION: 'You need Manage Server permission on this server to change its settings.',
};

export default function EconomyLogChannelSelect({
  guildId,
  value,
  onChange,
  onValidity,
}: {
  guildId: string;
  value: string;
  onChange: (id: string) => void;
  /** Reports a structured error for the current selection, if any. */
  onValidity?: (error: EconomyFieldError | null) => void;
}) {
  const [options, setOptions] = useState<ChannelOption[]>([]);
  const [bot, setBot] = useState<BotPresence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string; retryable?: boolean } | null>(null);
  const [checked, setChecked] = useState<{ id: string; valid: boolean; message?: string; missingPermission?: string } | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (fresh = false) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const resp = await apiFetch<{
      success: boolean;
      channels?: ChannelOption[];
      bot?: BotPresence;
      current?: { id: string; valid: boolean; message?: string; missingPermission?: string } | null;
      error?: string; code?: string; retryable?: boolean;
    }>(`/api/dashboard/economy/channels?guildId=${guildId}&requires=view,send,embed${fresh ? '&fresh=1' : ''}`);
    if (id !== requestId.current) return;
    const body = resp.ok ? resp.data : null;
    if (body?.success) {
      setOptions(body.channels ?? []);
      setBot(body.bot ?? null);
      setChecked(body.current ?? null);
      setError(null);
    } else {
      // The previous list is KEPT so a temporary outage does not empty a
      // working dropdown; the banner above it says what is actually wrong.
      setError({
        code: body?.code,
        message: body?.error || (resp.ok ? 'Could not load channels.' : resp.error),
        retryable: body?.retryable ?? (!resp.ok && resp.status >= 500),
      });
    }
    setLoading(false);
  }, [guildId]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  // Report the CURRENT selection's verdict upward so the save path can refuse
  // it and the form can render the reason under the control.
  useEffect(() => {
    if (!onValidity) return;
    if (!value) { onValidity(null); return; }
    if (checked && checked.id === value) {
      onValidity(
        checked.valid
          ? null
          : {
              field: 'logChannelId',
              label: 'Economy Log Channel',
              code: ECONOMY_ERROR_CODES.MISSING_BOT_PERMISSION,
              message: checked.message ?? 'Murabot cannot use this channel.',
              current: `"${options.find((o) => o.id === value)?.name ?? value}"`,
              expected: 'A text channel Murabot can read, send and embed in',
              missingPermission: checked.missingPermission,
            },
      );
      return;
    }
    // A selection the bot no longer offers: the channel was deleted, or the
    // bot lost View Channel on it. That is a definitive answer, not an unknown.
    if (!loading && !error && options.length > 0 && !options.some((o) => o.id === value)) {
      onValidity({
        field: 'logChannelId',
        label: 'Economy Log Channel',
        code: ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND,
        message: 'This channel no longer exists on this server. It may have been deleted — please select another channel.',
        current: value,
        expected: 'A channel from this server’s list',
      });
    }
  }, [value, checked, options, loading, error, onValidity]);

  const selectedUnusable = checked && !checked.valid && checked.id === value;
  const selectedMissing = value && !loading && !error && options.length > 0 && !options.some((o) => o.id === value);
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <div>
      <label htmlFor="eco-logChannelId" style={{ display: 'block', fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 4 }}>
        📜 Economy Log Channel
      </label>
      <select
        id="eco-logChannelId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading || Boolean(error)}
        aria-invalid={selectedUnusable || selectedMissing ? true : undefined}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--cc-bg)', color: '#fff',
          border: `1px solid ${selectedUnusable || selectedMissing ? '#f87171' : 'var(--cc-border, #2a2a3a)'}`,
          borderRadius: 6, padding: '6px 8px', fontSize: 13,
        }}
      >
        <option value="">{loading ? 'Loading channels…' : '— not set —'}</option>
        {/* A stored channel that has since been deleted is still shown, and
            clearly marked, rather than vanishing from the operator's view. */}
        {selectedMissing && (
          <option value={value} disabled>
            ⚠️ Previously selected channel — no longer exists
          </option>
        )}
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.usable ? '✓' : '✕'} {c.name}
            {c.categoryName ? ` · ${c.categoryName}` : ''}
            {c.usable ? '' : ` — missing ${c.missing?.label ?? 'a required permission'}`}
          </option>
        ))}
      </select>

      {error && (
        <div style={{ marginTop: 6, fontSize: 11.5 }} role="alert">
          <div style={{ color: error.retryable ? '#fbbf24' : '#f87171' }}>
            {error.code === 'BOT_NOT_IN_GUILD' ? '❌' : '⚠️'} {error.message}
          </div>
          {error.code && (
            <div style={{ color: 'var(--cc-text-faint)', marginTop: 2 }}>
              Reason: <code>{error.code}</code>
            </div>
          )}
          <div style={{ color: 'var(--cc-text-faint)', marginTop: 2 }}>
            {FAILURE_HINT[error.code ?? ''] ?? 'This is not a problem with your settings.'}
          </div>
          <button className="cc-btn" style={{ marginTop: 6, fontSize: 11 }} onClick={() => void load(true)}>
            Retry
          </button>
        </div>
      )}

      {!error && selectedUnusable && (
        <div style={{ marginTop: 6, fontSize: 11.5 }} role="alert">
          <div style={{ color: '#f87171' }}>❌ {checked?.message}</div>
          <div style={{ color: 'var(--cc-text-faint)', marginTop: 2 }}>
            In Discord: right-click the channel → Edit Channel → Permissions, then allow Murabot to{' '}
            {checked?.missingPermission ?? 'use it'}. Save again afterwards.
          </div>
        </div>
      )}

      {!error && !selectedUnusable && !selectedMissing && !loading && value && selected?.usable && (
        <div style={{ marginTop: 4, fontSize: 10.5, color: '#4ade80' }}>
          ✓ Murabot can read, send and embed in this channel.
        </div>
      )}

      {!error && !loading && options.length === 0 && bot?.installed && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--cc-text-faint)' }}>
          Murabot is in this server, but no text channels are available. Create one in Discord, then retry.
        </div>
      )}

      {/* Presence, stated plainly. The gateway — not a configured token — is
          what decides whether Murabot is online. */}
      {!error && bot && (
        <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--cc-text-faint)' }}>
          {bot.online
            ? `Murabot is online${bot.gatewayState ? ` (gateway ${bot.gatewayState})` : ''}`
            : 'Murabot is offline'}
          {bot.installed ? ' and is in this server' : ' and is not in this server'}
          {typeof bot.latencyMs === 'number' ? ` · ${bot.latencyMs}ms` : ''}
        </div>
      )}
    </div>
  );
}
