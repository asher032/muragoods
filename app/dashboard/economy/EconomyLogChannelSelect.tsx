'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { ECONOMY_ERROR_CODES, type EconomyFieldError } from '@/app/lib/economy-schema';

// ── 📜 Economy Log Channel selector ─────────────────────────────────────
//
// Populated straight from the Discord API. The operator never types a channel
// id, and never sees a channel the bot cannot use presented as a normal
// option — unusable channels are listed, greyed and labelled, because a
// channel that used to work and no longer does must be visible as broken
// rather than silently disappearing.
//
// The list is fetched once per server (the endpoint caches and de-duplicates
// its own Discord reads), and re-fetched only when the operator asks.

interface ChannelOption {
  id: string;
  name: string;
  type: number;
  categoryName: string | null;
  usable: boolean;
  reason: string | null;
}

const CHANNEL_TYPE_LABEL: Record<number, string> = {
  0: 'Text', 5: 'Announcement', 10: 'Thread', 11: 'Public Thread', 12: 'Private Thread',
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string; retryable?: boolean } | null>(null);
  const [checked, setChecked] = useState<{ id: string; valid: boolean; message?: string; missingPermission?: string } | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const resp = await apiFetch<{
      success: boolean; channels?: ChannelOption[];
      current?: { id: string; valid: boolean; message?: string; missingPermission?: string } | null;
      error?: string; code?: string; retryable?: boolean;
    }>(`/api/dashboard/economy/channels?guildId=${guildId}&requires=view,send,embed`);
    if (id !== requestId.current) return;
    const body = resp.ok ? resp.data : null;
    if (body?.success) {
      setOptions(body.channels ?? []);
      setChecked(body.current ?? null);
      setError(null);
    } else {
      setOptions([]);
      const retryable = !resp.ok && resp.status >= 500;
      setError({
        code: body?.code,
        message: body?.error || (resp.ok ? 'Could not load channels.' : resp.error),
        retryable,
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
              code: (ECONOMY_ERROR_CODES.MISSING_BOT_PERMISSION),
              message: checked.message ?? 'Murabot cannot use this channel.',
              current: `"${options.find((o) => o.id === value)?.name ?? value}"`,
              expected: 'A text channel Murabot can read, send and embed in',
              missingPermission: checked.missingPermission,
            },
      );
      return;
    }
    // Selection not present in the live list: the channel is gone. That is a
    // definitive answer from Discord, not an unknown.
    if (!loading && options.length > 0 && !options.some((o) => o.id === value)) {
      onValidity({
        field: 'logChannelId',
        label: 'Economy Log Channel',
        code: ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND,
        message: 'This channel no longer exists on this server. It may have been deleted — please select another channel.',
        current: value,
        expected: 'A channel from this server’s list',
      });
    }
  }, [value, checked, options, loading, onValidity]);

  const selectedUnusable = checked && !checked.valid && checked.id === value;
  const selectedMissing = value && !loading && options.length > 0 && !options.some((o) => o.id === value);

  return (
    <div>
      <label htmlFor="eco-logChannelId" style={{ display: 'block', fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 4 }}>
        📜 Economy Log Channel
      </label>
      <select
        id="eco-logChannelId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
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
            {c.usable ? '' : ' — Murabot cannot use this'}
          </option>
        ))}
      </select>

      {error && (
        <div style={{ marginTop: 6, fontSize: 11.5 }} role="alert">
          <div style={{ color: error.retryable ? '#fbbf24' : '#f87171' }}>❌ {error.message}</div>
          <div style={{ color: 'var(--cc-text-faint)', marginTop: 2 }}>
            {error.retryable
              ? 'This is a temporary problem, not a problem with your settings. Nothing was saved — try again in a moment.'
              : 'Ask a server admin to check your Manage Server permission.'}
          </div>
          {error.retryable && (
            <button className="cc-btn" style={{ marginTop: 6, fontSize: 11 }} onClick={() => void load()}>
              Retry
            </button>
          )}
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

      {!error && !selectedUnusable && !selectedMissing && !loading && options.length > 0 && value && (
        <div style={{ marginTop: 4, fontSize: 10.5, color: '#4ade80' }}>
          ✓ Murabot can read, send and embed in this channel.
        </div>
      )}

      {!error && !loading && options.length === 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--cc-text-faint)' }}>
          No text channels are available. Create one in Discord, then refresh.
        </div>
      )}
    </div>
  );
}
