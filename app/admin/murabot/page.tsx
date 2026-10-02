'use client';

import { useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import {
  Banner, Empty, Field, Loading, Panel, RefreshButton, StateBadge, Stat, useAdminResource,
} from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/murabot — administrative control of Murabot.
//
// The owner does not have to open Discord and type "mg!prefix !" to change the
// prefix, and does not have to sign in to the public dashboard to do it. This
// page writes the ONE canonical guild configuration and then asks Murabot,
// over the bridge, whether it actually holds the new value.
//
// The three outcomes are rendered as three different things, because they are:
//   applied  → success   "live in Discord now"
//   pending  → warning   "stored; Murabot has not confirmed yet"
//   failed   → error     "nothing was changed"
// ─────────────────────────────────────────────────────────────────────────

interface BotPayload {
  configurationSource: {
    owner: string; store: string; readBy: string;
    editedBy: string[]; verifiedBy: string;
  };
  bridge: { configured: boolean; base: string; reachable: boolean | null };
  bot: null | {
    online: boolean; state: string | null; latencyMs: number | null;
    uptimeSeconds: number | null; heartbeatAgeSeconds: number | null;
    reconnectCount: number | null; guildCount: number; botUserId: string | null;
    error: { code: string; message: string } | null;
  };
  commands: { state: string; data: unknown };
  readOnly: boolean;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'applied'; message: string; prefix: string }
  | { kind: 'pending'; message: string; prefix: string }
  | { kind: 'failed'; message: string };

export default function AdminMurabotPage() {
  const { data, error, loading, reload } = useAdminResource<BotPayload>('/api/admin/murabot');

  const [guildId, setGuildId] = useState('');
  const [prefix, setPrefix] = useState('mg!');
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [guildConfig, setGuildConfig] = useState<{
    guildId: string; prefix: string;
    bot: { confirmed: boolean; prefix: string | null; reason: string | null };
  } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const bot = data?.bot;
  const readOnly = data?.readOnly ?? false;

  async function inspectGuild() {
    setLookupError(null);
    setGuildConfig(null);
    if (!/^\d{5,25}$/.test(guildId.trim())) {
      setLookupError('Enter the numeric Discord server ID.');
      return;
    }
    const res = await fetch(`/api/admin/murabot?guildId=${encodeURIComponent(guildId.trim())}`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setLookupError(body?.error || 'Could not read that server.');
      return;
    }
    setGuildConfig(body);
    setPrefix(body.prefix);
  }

  async function savePrefix() {
    setSave({ kind: 'busy' });
    try {
      const res = await fetch('/api/admin/murabot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: guildId.trim(), prefix }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setSave({ kind: 'failed', message: body?.error || 'The prefix was not saved. Nothing was changed.' });
        return;
      }
      // The tone comes from the SERVER's propagation state, not from the fact
      // that the request returned 200. "stored" and "live" are different claims.
      if (body.propagation === 'applied') {
        setSave({ kind: 'applied', message: body.message, prefix: body.prefix });
      } else {
        setSave({ kind: 'pending', message: body.message, prefix: body.prefix });
      }
      void inspectGuild();
    } catch {
      setSave({ kind: 'failed', message: 'The server could not be reached. Your existing prefix was not changed.' });
    }
  }

  return (
    <>
      <AdminHeader
        title="Murabot control"
        subtitle="Bridge state, gateway state and canonical guild configuration — managed from the Muragoods Admin Panel, without the Discord dashboard and without typing commands in Discord."
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {error ? <Banner tone="error">Could not read Murabot state: {error}</Banner> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          {/* ── One source of truth, stated where it is configured ─────── */}
          <Panel title="Where Murabot configuration lives">
            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', margin: 0, fontSize: 13 }}>
              <dt style={{ color: 'var(--mg-text-faint)' }}>Owner</dt>
              <dd style={{ margin: 0 }}>{data.configurationSource.owner}</dd>
              <dt style={{ color: 'var(--mg-text-faint)' }}>Stored</dt>
              <dd style={{ margin: 0 }}>{data.configurationSource.store}</dd>
              <dt style={{ color: 'var(--mg-text-faint)' }}>Read by</dt>
              <dd style={{ margin: 0 }}>{data.configurationSource.readBy}</dd>
              <dt style={{ color: 'var(--mg-text-faint)' }}>Edited by</dt>
              <dd style={{ margin: 0 }}>{data.configurationSource.editedBy.join(' · ')}</dd>
              <dt style={{ color: 'var(--mg-text-faint)' }}>Verified by</dt>
              <dd style={{ margin: 0 }}>{data.configurationSource.verifiedBy}</dd>
            </dl>
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--mg-text-muted)' }}>
              There is no separate dashboard copy, admin copy or bot copy of the prefix.
              Both surfaces call the same writer.
            </p>
          </Panel>

          {/* ── Runtime ────────────────────────────────────────────────── */}
          <Panel title="Runtime">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
              <Stat
                label="Connection"
                value={!data.bridge.configured ? 'No bridge' : bot?.error ? 'Unreachable' : bot?.online ? 'Online' : 'Degraded'}
                tone={!data.bridge.configured || bot?.error ? 'var(--mg-error)' : bot?.online ? 'var(--mg-success)' : 'var(--mg-warning)'}
              />
              <Stat label="Gateway" value={bot?.state || (data.bridge.configured ? 'unknown' : 'not configured')} />
              <Stat label="Latency" value={bot?.latencyMs != null ? `${bot.latencyMs}ms` : '—'} />
              <Stat label="Guilds" value={bot?.guildCount ?? '—'} />
              <Stat label="Uptime" value={bot?.uptimeSeconds != null ? `${Math.round(bot.uptimeSeconds / 60)}m` : '—'} />
              <Stat label="Heartbeat" value={bot?.heartbeatAgeSeconds != null ? `${bot.heartbeatAgeSeconds}s ago` : '—'} />
              <Stat label="Reconnects" value={bot?.reconnectCount ?? '—'} />
              <Stat label="Commands API" value={<StateBadge state={data.commands.state} />} />
            </div>

            {!data.bridge.configured ? (
              <Banner tone="warning">
                <code>DISCORD_BRIDGE_SECRET</code> is not set on this deployment, so the Admin Panel
                cannot read or drive Murabot. Values saved here are stored canonically but will not
                reach the bot until a bridge is configured.
              </Banner>
            ) : bot?.error ? (
              <Banner tone="error">Murabot did not answer: {bot.error.code} — {bot.error.message}</Banner>
            ) : (
              <Banner tone="success">
                Bridge reachable at <code>{data.bridge.base}</code>
                {bot?.botUserId ? <> · bot <code>{bot.botUserId}</code></> : null}.
              </Banner>
            )}
          </Panel>

          {/* ── Guild configuration ────────────────────────────────────── */}
          <Panel
            title="Command prefix"
            hint="Saved directly to the canonical guild configuration, then pushed to Murabot. The page reports whether Murabot confirmed it — never a bare “Saved!”."
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 14 }}>
              <div style={{ minWidth: 220 }}>
                <Field
                  label="Discord server ID"
                  value={guildId}
                  onChange={setGuildId}
                  placeholder="123456789012345678"
                  hint="The server whose configuration you want to read or change."
                />
              </div>
              <button type="button" className="mg-btn mg-btn-secondary" onClick={inspectGuild} style={{ marginBottom: 22 }}>
                Load server configuration
              </button>
            </div>

            {lookupError ? <div style={{ marginBottom: 14 }}><Banner tone="error">{lookupError}</Banner></div> : null}

            {guildConfig ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
                  <div style={{ minWidth: 200 }}>
                    <Field
                      label="Prefix"
                      value={prefix}
                      onChange={setPrefix}
                      disabled={readOnly}
                      hint="Up to 10 characters. Letters, numbers and !@#$%^&*()-=. _"
                    />
                  </div>
                  <button
                    type="button"
                    className="mg-btn mg-btn-primary"
                    onClick={savePrefix}
                    disabled={readOnly || save.kind === 'busy'}
                    style={{ marginBottom: 22 }}
                  >
                    {save.kind === 'busy' ? 'Saving…' : 'Save prefix'}
                  </button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <Banner tone={guildConfig.bot.confirmed ? 'success' : 'warning'}>
                    Canonical value for this server: <strong>{guildConfig.prefix}</strong>.{' '}
                    {guildConfig.bot.confirmed
                      ? `Murabot reports the same value (${guildConfig.bot.prefix}). Live in Discord.`
                      : `Murabot has not confirmed it yet${guildConfig.bot.reason ? ` (${guildConfig.bot.reason})` : ''}.`
                      + ' It will pick the value up on its own reload.'}
                  </Banner>
                </div>
              </>
            ) : null}

            {save.kind === 'busy' ? <Loading /> : null}
            {save.kind === 'applied' ? (
              <div style={{ marginBottom: 12 }}>
                <Banner tone="success">Prefix <strong>{save.prefix}</strong> saved and applied in Discord.</Banner>
              </div>
            ) : null}
            {save.kind === 'pending' ? (
              <div style={{ marginBottom: 12 }}>
                <Banner tone="warning">{save.message}</Banner>
              </div>
            ) : null}
            {save.kind === 'failed' ? (
              <div style={{ marginBottom: 12 }}>
                <Banner tone="error">{save.message}</Banner>
              </div>
            ) : null}

            {readOnly ? (
              <Empty>
                You have read-only access here. Muragoods staff with the technical scope may inspect
                configuration; only the Muragoods owner can change it.
              </Empty>
            ) : null}
          </Panel>
        </>
      ) : null}
    </>
  );
}