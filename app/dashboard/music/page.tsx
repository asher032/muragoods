'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useGuild } from '@/app/lib/guild-context';
import { useGuildConfig } from '@/app/lib/use-guild-config';
import { apiFetch } from '../lib/api';
import {
  DiscordChannelSelect, DiscordRoleSelect, useGuildResources,
} from '../components/selectors';

// ── Now Playing ──────────────────────────────────────────────────────────
// Every value here comes from the bot's real player via /api/dashboard/music
// (which proxies GET /music/state/{guild}). Nothing on this page is a mock:
// the progress bar is the player's own position, and each control performs
// the matching action on the Discord player.

interface Track {
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  requester: string | null;
}

interface MusicState {
  connected: boolean;
  state: 'playing' | 'paused' | 'idle';
  voiceChannel: string | null;
  voiceChannelId?: string | null;
  connectionState?: string;
  playerState?: string;
  reconnectAttempts?: number;
  permissions?: {
    view_channel: boolean | null;
    connect: boolean | null;
    speak: boolean | null;
    all_granted: boolean;
    missing: string[];
    channel_name?: string;
  } | null;
  ffmpeg?: {
    status: string;
    version?: string | null;
    error?: string | null;
    exists?: boolean;
    executable?: boolean;
  } | null;
  lastErrorCode?: string | null;
  lastError?: string | null;
  lastPlayback?: {
    stage?: string;
    ok?: boolean;
    error_code?: string | null;
    error_message?: string | null;
    requested_title?: string;
    resolved_title?: string;
    timestamp?: string;
  } | null;
  current: Track | null;
  position: number;
  volume: number;
  loop: boolean;
  queueLoop: boolean;
  autoplay: boolean;
  filters: string[];
  twentyFourSeven: boolean;
  queue: Track[];
  queueLength: number;
  history: Track[];
}

interface Diagnostics {
  gateway?: { alive?: boolean | null; heartbeat_age_seconds?: number | null };
  audio_service?: {
    status: string;
    detail?: string;
    youtube_challenged?: boolean;
    last_error_kind?: string | null;
    last_resolve_error?: string | null;
    ydlp_version?: string;
    cookies_configured?: boolean;
  };
  ffmpeg?: {
    status: string;
    version?: string | null;
    error?: string | null;
    exists?: boolean;
    executable?: boolean;
  };
  last_playback?: MusicState['lastPlayback'];
}

interface TestAudioResult {
  ok?: boolean;
  stages?: Record<string, string>;
  detail?: Record<string, unknown>;
}

type Feedback = 'like' | 'love' | 'dislike';

interface FeedbackResponse {
  success: boolean;
  mine: Feedback | null;
  counts: Record<Feedback, number>;
  error?: string;
}

function fmt(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Per-guild prefix talks to its own route (top-level `prefix` key, pushed
// to the bot with the value) — not the music section, so there is exactly
// one source of truth.
function PrefixField({ guildId, token }: { guildId: string; token: string }) {
  const [prefix, setPrefix] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setLoaded(false);
    setMsg('');
    void (async () => {
      const resp = await apiFetch<{ success: boolean; prefix?: string }>(
        `/api/dashboard/prefix?guildId=${encodeURIComponent(guildId)}`, { token });
      if (resp.ok && resp.data.success) setPrefix(resp.data.prefix || 'mg!');
      setLoaded(true);
    })();
  }, [guildId, token]);
  const save = async () => {
    const clean = prefix.trim();
    if (!clean || clean.length > 10) {
      setMsg('Prefix must be 1–10 characters.');
      return;
    }
    setSaving(true);
    setMsg('');
    const resp = await apiFetch<{ success: boolean; prefix?: string; botNotified?: boolean; error?: string }>(
      '/api/dashboard/prefix', { method: 'PATCH', token, body: { guildId, prefix: clean } });
    if (resp.ok && resp.data.success) {
      setPrefix(resp.data.prefix || clean);
      setMsg(resp.data.botNotified ? '✓ Saved and live on the bot.' : '✓ Saved (bot will pick it up shortly).');
    } else {
      setMsg(resp.ok ? resp.data.error || 'Save failed.' : resp.error);
    }
    setSaving(false);
  };
  if (!loaded) return <p style={{ fontSize: 12, color: 'var(--cc-text-faint)', margin: 0 }}>Loading…</p>;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input className="cc-input" style={{ flex: 1 }} maxLength={10}
             value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="mg!" />
      <button className="cc-btn" onClick={save} disabled={saving} style={{ fontSize: 12 }}>
        {saving ? '…' : 'Set'}
      </button>
      {msg && <span style={{ fontSize: 11.5, color: 'var(--cc-text-dim)', alignSelf: 'center' }}>{msg}</span>}
    </div>
  );
}

export default function MusicPage() {
  const { token, selected } = useGuild();
  const [state, setState] = useState<MusicState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [counts, setCounts] = useState<Record<Feedback, number>>({ like: 0, love: 0, dislike: 0 });
  const [ffmpeg, setFfmpeg] = useState<boolean | null>(null);
  const [artFailed, setArtFailed] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [diagError, setDiagError] = useState('');
  const [testResult, setTestResult] = useState<TestAudioResult | null>(null);
  const [testing, setTesting] = useState(false);
  // Search + settings state (real backend calls, never mocks)
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    title: string; uploader: string; duration: number; thumbnail: string; url: string;
  }>>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  // Monotonic search generation for the stale-response guard below.
  const searchSeq = useRef(0);
  const { config: guildConfig, update: updateGuildConfig, save: saveGuildConfig, saveState: guildSaveState } = useGuildConfig();
  const { resources, loading: resLoading } = useGuildResources(selected?.id ?? null);
  const musicCfg = (guildConfig?.music ?? {}) as Record<string, unknown>;

  // Position is measured, not guessed: remember the player's position and the
  // wall-clock instant it was read, then advance from that baseline locally.
  const baseline = useRef<{ position: number; at: number; playing: boolean }>({
    position: 0, at: Date.now(), playing: false,
  });
  const [, forceTick] = useState(0);

  const trackKey = state?.current
    ? (state.current.url || state.current.title || '')
    : '';

  const load = useCallback(async () => {
    if (!token || !selected) return;
    setLoading(true);
    const resp = await apiFetch<{ success: boolean; state: MusicState; error?: string }>(
      `/api/dashboard/music?guildId=${encodeURIComponent(selected.id)}`,
      { token },
    );
    if (resp.ok && resp.data.success) {
      const next = resp.data.state;
      setState(next);
      baseline.current = {
        position: next.position || 0,
        at: Date.now(),
        playing: next.state === 'playing',
      };
      setLoadError('');
      setError('');
    } else {
      setState(null);
      setLoadError(resp.ok
        ? (resp.data as unknown as { error?: string }).error || 'The bot returned no state'
        : resp.error);
    }
    setLoading(false);
  }, [token, selected]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [load]);

  // Smooth progress between polls.
  useEffect(() => {
    const t = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Is the decoder actually available? Read from the bot, not assumed.
  useEffect(() => {
    if (!token) return;
    (async () => {
      const resp = await apiFetch<{ bot?: { ffmpeg?: boolean | null } }>(
        '/api/dashboard/status', { token },
      );
      if (resp.ok) setFfmpeg(resp.data.bot?.ffmpeg ?? null);
    })();
  }, [token]);

  // ⚙️ Music Diagnostics — real aggregate from the bot (audio service,
  // FFmpeg, gateway, last playback failure). No secrets ever leave the bot.
  const loadDiag = useCallback(async () => {
    if (!token || !selected) return;
    const resp = await apiFetch<{ success: boolean; diagnostics: Diagnostics; error?: string }>(
      `/api/dashboard/music/diagnostics?guildId=${encodeURIComponent(selected.id)}`,
      { token },
    );
    if (resp.ok && resp.data.success) {
      setDiag(resp.data.diagnostics);
      setDiagError('');
    } else {
      setDiag(null);
      setDiagError(resp.ok
        ? (resp.data as unknown as { error?: string }).error || 'Diagnostics unavailable'
        : resp.error);
    }
  }, [token, selected]);

  useEffect(() => {
    loadDiag();
    const poll = setInterval(loadDiag, 30000);
    return () => clearInterval(poll);
  }, [loadDiag]);

  const runTestAudio = useCallback(async () => {
    if (!token || !selected) return;
    setTesting(true);
    setTestResult(null);
    const resp = await apiFetch<{ success: boolean; result: TestAudioResult; error?: string }>(
      '/api/dashboard/music/test-audio',
      { method: 'POST', token, body: { guildId: selected.id } },
    );
    if (resp.ok && resp.data.success) {
      setTestResult(resp.data.result);
      setError('');
    } else {
      setError(resp.ok
        ? (resp.data as unknown as { error?: string }).error || 'Audio test failed with no reason given'
        : resp.error);
    }
    setTesting(false);
    await loadDiag();
  }, [token, selected, loadDiag]);

  // The current track's feedback — real tallies, per user.
  useEffect(() => {
    if (!token || !selected || !trackKey) {
      setFeedback(null);
      setCounts({ like: 0, love: 0, dislike: 0 });
      return;
    }
    (async () => {
      const resp = await apiFetch<FeedbackResponse>(
        `/api/dashboard/music/feedback?guildId=${encodeURIComponent(selected.id)}&trackKey=${encodeURIComponent(trackKey)}`,
        { token },
      );
      if (resp.ok && resp.data.success) {
        setFeedback(resp.data.mine);
        setCounts(resp.data.counts);
      }
    })();
  }, [token, selected, trackKey]);

  useEffect(() => { setArtFailed(false); }, [trackKey]);

  const control = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!token || !selected) return;
    setActing(action);
    const resp = await apiFetch<{ success: boolean; error?: string }>(
      '/api/dashboard/music',
      { method: 'POST', token, body: { guildId: selected.id, action, ...extra } },
    );
    if (!resp.ok || !resp.data.success) {
      setError(resp.ok
        ? (resp.data as unknown as { error?: string }).error || `${action} failed with no reason given`
        : resp.error);
    } else {
      setError('');
    }
    setActing(null);
    await load();
  }, [token, selected, load]);

  const runSearch = useCallback(async () => {
    if (!token || !selected || searchQuery.trim().length < 2) return;
    // Stale guard: keystroke B must never be overwritten by a slower A.
    const mySeq = (searchSeq.current += 1);
    setSearching(true);
    setSearchError('');
    setSearchResults([]);
    const resp = await apiFetch<{ success: boolean; results: Array<{ title: string; uploader: string; duration: number; thumbnail: string; url: string }>; error?: string }>(
      '/api/dashboard/music/search',
      { method: 'POST', token, body: { guildId: selected.id, query: searchQuery.trim() } },
    );
    if (mySeq !== searchSeq.current) return; // superseded — drop silently
    if (resp.ok && resp.data.success) {
      setSearchResults(resp.data.results);
      if (resp.data.results.length === 0) setSearchError('No results — try different words.');
    } else {
      setSearchError(resp.ok
        ? (resp.data as unknown as { error?: string }).error || 'Search failed with no reason given'
        : resp.error);
    }
    setSearching(false);
  }, [token, selected, searchQuery]);

  const queueUrl = useCallback(async (url: string, front: boolean) => {
    if (!token || !selected) return;
    setActing(front ? 'playnext' : 'queueadd');
    const resp = await apiFetch<{ success: boolean; result?: { title?: string; note?: string }; error?: string }>(
      '/api/dashboard/music/queue',
      { method: 'POST', token, body: { guildId: selected.id, url, front } },
    );
    if (resp.ok && resp.data.success) {
      setError('');
      if (resp.data.result?.note) setNotice(resp.data.result.note);
    } else {
      setError(resp.ok
        ? (resp.data as unknown as { error?: string }).error || 'Queue add failed'
        : resp.error);
    }
    setActing(null);
    await load();
  }, [token, selected, load]);

  const sendFeedback = useCallback(async (kind: Feedback) => {    if (!token || !selected || !state?.current) return;
    const next = feedback === kind ? null : kind;   // clicking again withdraws
    setActing(`feedback:${kind}`);
    const resp = await apiFetch<FeedbackResponse>(
      '/api/dashboard/music/feedback',
      {
        method: 'POST',
        token,
        body: {
          guildId: selected.id,
          url: state.current.url,
          title: state.current.title,
          uploader: state.current.uploader,
          thumbnail: state.current.thumbnail,
          feedback: next,
        },
      },
    );
    if (resp.ok && resp.data.success) {
      setFeedback(resp.data.mine);
      setCounts(resp.data.counts);
      setError('');
    } else {
      setError(resp.ok
        ? (resp.data as unknown as { error?: string }).error || 'Feedback was not saved'
        : resp.error);
    }
    setActing(null);
  }, [token, selected, state, feedback]);

  const playing = state?.state === 'playing';
  const paused = state?.state === 'paused';
  const connected = state?.connected ?? false;
  const duration = state?.current?.duration || 0;
  const displayed = useMemo(() => {
    if (scrub !== null) return scrub;
    const b = baseline.current;
    const drift = b.playing ? (Date.now() - b.at) / 1000 : 0;
    return Math.min(b.position + drift, duration || Infinity);
    // forceTick drives recomputation each second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrub, duration, state]);

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to control music.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar.</p>;
  }

  const loopLabel = state?.loop ? 'Track' : state?.queueLoop ? 'Queue' : 'Off';

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
          <h1 style={{ margin: '4px 0 0', fontSize: 25, fontWeight: 800, color: '#fff' }}>🎵 Music — {selected.name}</h1>
        </div>
        <span className={`cc-status-pill ${connected ? 'cc-status-online' : 'cc-status-offline'}`}>
          <span className="cc-dot" />
          {connected ? `Connected • ${state?.voiceChannel || 'voice'}` : 'Not connected to voice'}
        </span>
      </div>

      {/* Explicit, specific states — never a bare "something went wrong". */}
      {loadError && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 14 }}>
          <strong>Could not read player state.</strong> {loadError}
        </div>
      )}
      {error && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 14 }}>
          <strong>That action failed.</strong> {error}
        </div>
      )}
      {notice && (
        <div className="cc-alert cc-alert-ok" role="status" style={{ marginBottom: 14 }}>
          {notice}
        </div>
      )}
      {ffmpeg === false && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 14 }}>
          <strong>🟠 FFmpeg unavailable on the bot host.</strong> Playback cannot start until the
          decoder is installed where the bot runs.
        </div>
      )}

      {/* ── ⚙️ Music Diagnostics ── */}
      <section className="cc-card" style={{ padding: '16px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="cc-section-label">⚙️ Music Diagnostics</div>
            <div style={{ fontSize: 12.5, color: 'var(--cc-text-dim)', marginTop: 2 }}>
              What failed, why it failed, and what needs to be fixed — measured on the bot host.
            </div>
          </div>
          <button className="cc-btn cc-btn-primary" onClick={runTestAudio} disabled={testing}>
            {testing ? 'Testing…' : '▶ Test Audio'}
          </button>
        </div>

        {diagError && (
          <div className="cc-alert cc-alert-error" style={{ marginTop: 12 }}>
            <strong>Diagnostics unavailable.</strong> {diagError}
          </div>
        )}

        {diag && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
            <div>
              <div className="cc-section-label">Audio Service</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 4 }}>
                {diag.audio_service?.status === 'working' ? '🟢 Working'
                  : diag.audio_service?.status === 'degraded' ? '🟡 Degraded'
                  : diag.audio_service?.status === 'unavailable' ? '🔴 Unavailable'
                  : '⚪ Unknown'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cc-text-dim)', marginTop: 4 }}>
                Checks whether the configured audio provider can resolve and provide playable audio.
              </div>
              {diag.audio_service?.detail && (
                <div style={{ fontSize: 12, color: 'var(--cc-text-faint)', marginTop: 4 }}>{diag.audio_service.detail}</div>
              )}
              {diag.audio_service?.youtube_challenged && (
                <div style={{ fontSize: 12, color: '#f0b429', marginTop: 4 }}>
                  ⚠️ YouTube challenged this host — set <code>YT_COOKIES</code> or <code>YOUTUBE_PROXY</code>.
                </div>
              )}
            </div>
            <div>
              <div className="cc-section-label">FFmpeg</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 4 }}>
                {diag.ffmpeg?.status === 'ready' ? '🟢 Ready'
                  : diag.ffmpeg?.status === 'missing' ? '🔴 Missing'
                  : diag.ffmpeg?.status === 'failed' ? '🔴 Failed'
                  : '⚪ Unknown'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cc-text-dim)', marginTop: 4 }}>
                Checks whether FFmpeg is installed, accessible, and capable of processing the selected audio stream.
              </div>
              {diag.ffmpeg?.version && (
                <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)', marginTop: 4, fontFamily: 'monospace' }}>
                  {diag.ffmpeg.version.slice(0, 80)}
                </div>
              )}
              {diag.ffmpeg?.error && diag.ffmpeg.status !== 'ready' && (
                <div style={{ fontSize: 12, color: '#ff6b6b', marginTop: 4 }}>{diag.ffmpeg.error}</div>
              )}
            </div>
            <div>
              <div className="cc-section-label">Discord Voice</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 4 }}>
                {diag.gateway?.alive === true && connected ? '🟢 Connected'
                  : state?.connectionState === 'reconnecting' || state?.connectionState === 'connecting' ? '🟡 Connecting'
                  : '🔴 Disconnected'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cc-text-dim)', marginTop: 4 }}>
                Checks whether the bot can establish and maintain a Discord voice connection.
              </div>
              {state?.reconnectAttempts ? (
                <div style={{ fontSize: 12, color: 'var(--cc-text-faint)', marginTop: 4 }}>
                  Reconnects: {state.reconnectAttempts}
                </div>
              ) : null}
            </div>
            <div>
              <div className="cc-section-label">Player</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 4 }}>
                {state?.playerState === 'playing' ? '🟢 Playing'
                  : state?.playerState === 'paused' ? '🟢 Paused'
                  : state?.playerState === 'buffering' ? '🟡 Buffering'
                  : state?.playerState === 'reconnecting' ? '🟡 Reconnecting'
                  : state?.playerState === 'error' ? '🔴 Error'
                  : '🟢 Idle'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cc-text-dim)', marginTop: 4 }}>
                Shows the current music player&apos;s operational state.
              </div>
            </div>
          </div>
        )}

        {/* Bot permissions — automatic check of the current voice channel */}
        {state?.permissions && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="cc-section-label">🔐 Bot Permissions{state.voiceChannel ? ` — ${state.voiceChannel}` : ''}</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
              {(['view_channel', 'connect', 'speak'] as const).map((k) => (
                <span key={k}>
                  {state.permissions?.[k] ? '🟢' : '🔴'}{' '}
                  {k === 'view_channel' ? 'View Channel' : k === 'connect' ? 'Connect' : 'Speak'}:{' '}
                  {state.permissions?.[k] ? 'Granted' : 'Missing'}
                </span>
              ))}
            </div>
            {state.permissions && !state.permissions.all_granted && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: '#f0b429' }}>
                ⚠️ The bot cannot play audio because {(state.permissions.missing || []).join(', ') || 'a permission'} is missing.
              </div>
            )}
          </div>
        )}

        {/* Last playback failure — what failed and why */}
        {(state?.lastPlayback && !state.lastPlayback.ok) || (diag?.last_playback && !diag.last_playback.ok) ? (
          <div className="cc-alert cc-alert-error" style={{ marginTop: 12, fontSize: 13 }}>
            <strong>Last playback failure:</strong>{' '}
            <code>{(state?.lastPlayback || diag?.last_playback)?.stage}</code>
            {' → '}
            <code>{(state?.lastPlayback || diag?.last_playback)?.error_code}</code>
            {(state?.lastPlayback || diag?.last_playback)?.error_message && (
              <div style={{ marginTop: 4 }}>{(state?.lastPlayback || diag?.last_playback)?.error_message}</div>
            )}
          </div>
        ) : null}

        {/* Test Audio staged results */}
        {testResult?.stages && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'monospace', fontSize: 12.5 }}>
            {[
              ['discord_gateway', 'Discord Gateway'],
              ['voice_permissions', 'Voice Permissions'],
              ['ffmpeg', 'FFmpeg'],
              ['audio_source', 'Audio Source'],
              ['playback', 'Playback'],
            ].map(([key, label]) => {
              const v = testResult.stages?.[key] || 'NOT TESTED';
              const icon = v === 'PASS' ? '🟢' : v === 'FAIL' ? '🔴' : '⚪';
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span>{(label as string).padEnd(18)}</span>
                  <span>{icon} {v}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {loading && !state && <p style={{ color: 'var(--cc-text-faint)' }}>Reading player state…</p>}

      {/* ── Search (real metadata results; audio resolves only on add) ── */}
      <section className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <div className="cc-section-label" style={{ marginBottom: 8 }}>🔎 Search music</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="cc-input" style={{ flex: 1, minWidth: 200 }}
            placeholder="Song title, artist, or words…"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
          />
          <button className="cc-btn cc-btn-primary" onClick={runSearch} disabled={searching || searchQuery.trim().length < 2}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {searchError && <div style={{ marginTop: 8, fontSize: 12.5, color: '#ff8a8a' }}>{searchError}</div>}
        {searchResults.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {searchResults.map((r) => (
              <div key={r.url} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {r.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumbnail} alt="" width={64} height={36} style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 64, height: 36, borderRadius: 6, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>🎵</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  <div style={{ color: 'var(--cc-text-faint)', fontSize: 11.5 }}>{r.uploader}{r.duration ? ` · ${fmt(r.duration)}` : ''}</div>
                </div>
                <button className="cc-btn" style={{ fontSize: 11.5 }} disabled={acting !== null}
                        onClick={() => queueUrl(r.url, false)}>➕ Queue</button>
                <button className="cc-btn" style={{ fontSize: 11.5 }} disabled={acting !== null}
                        onClick={() => queueUrl(r.url, true)}>⏭ Next</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {!loading && state && !connected && (
        <div className="cc-card" style={{ padding: 34, textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 14 }}>
            🔴 Not connected — the bot joins voice when someone runs <code>/play</code> in Discord.
            Once it is in a channel, this page becomes a live remote.
          </p>
        </div>
      )}

      {state && connected && (
        <>
          {/* ── Now playing card ── */}
          <section
            className="cc-card"
            style={{
              position: 'relative',
              padding: '18px 20px 20px 23px',
              marginBottom: 14,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'linear-gradient(180deg, rgba(32,32,37,0.95), rgba(24,24,28,0.95))',
              overflow: 'hidden',
            }}
          >
            <span aria-hidden style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
              background: 'var(--cc-accent)',
            }} />

            <p style={{ margin: '0 0 12px', color: 'var(--cc-accent)', fontWeight: 600, fontSize: 13, letterSpacing: 0.4 }}>
              Now playing
            </p>

            {state.current ? (
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                    {state.current.title}
                  </div>
                  {state.current.uploader && (
                    <div style={{ color: 'var(--cc-text-dim)', fontSize: 13.5, marginTop: 2 }}>{state.current.uploader}</div>
                  )}
                  <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
                    {state.current.requester && <span>👤 Added by {state.current.requester}</span>}
                    {state.voiceChannel && <span>🔊 {state.voiceChannel}</span>}
                  </div>

                  <button
                    className="cc-btn"
                    onClick={() => sendFeedback('like')}
                    disabled={acting !== null}
                    aria-pressed={feedback === 'like'}
                    style={{
                      marginTop: 12, padding: '5px 12px', fontSize: 12.5,
                      borderColor: feedback === 'like' ? 'var(--cc-accent)' : undefined,
                      color: feedback === 'like' ? '#fff' : undefined,
                    }}
                  >
                    {feedback === 'like' ? '❤️ Liked' : '🤍 Like'}
                    {counts.like > 0 && <span style={{ color: 'var(--cc-text-faint)', marginLeft: 6 }}>{counts.like}</span>}
                  </button>
                </div>

                {/* Album art: real, with a graceful fallback */}
                <div style={{
                  width: 108, height: 108, flex: '0 0 auto', borderRadius: 12, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {state.current.thumbnail && !artFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={state.current.thumbnail}
                      alt=""
                      width={108}
                      height={108}
                      onError={() => setArtFailed(true)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <span style={{ fontSize: 30, opacity: 0.5 }} aria-label="No artwork">🎵</span>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13.5 }}>
                Nothing playing — the queue is idle.
              </p>
            )}

            {/* Queue / volume / loop, straight from the player */}
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--cc-text-dim)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>Queue Size: <strong style={{ color: '#fff' }}>{state.queueLength}</strong></span>
              <span aria-hidden>·</span>
              <span>Volume: <strong style={{ color: '#fff' }}>{state.volume}%</strong></span>
              <span aria-hidden>·</span>
              <span>Loop: <strong style={{ color: '#fff' }}>{loopLabel}</strong></span>
              <span aria-hidden>·</span>
              <span>AutoPlay: <strong style={{ color: '#fff' }}>{state.autoplay ? 'On' : 'Off'}</strong></span>
            </div>

            {/* ── Progress bar (real position; seek on release) ── */}
            {state.current && duration > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--cc-text-faint)', marginBottom: 6 }}>
                  <span>{fmt(displayed)}</span>
                  <span>{fmt(duration)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.floor(duration))}
                  value={Math.floor(scrub ?? displayed)}
                  onChange={(e) => setScrub(Number(e.target.value))}
                  onMouseUp={() => {
                    if (scrub !== null) control('seek', { position: scrub });
                    setScrub(null);
                  }}
                  onTouchEnd={() => {
                    if (scrub !== null) control('seek', { position: scrub });
                    setScrub(null);
                  }}
                  onKeyUp={() => {
                    if (scrub !== null) control('seek', { position: scrub });
                    setScrub(null);
                  }}
                  aria-label="Seek"
                  style={{ width: '100%', accentColor: 'var(--cc-accent)', cursor: 'pointer', height: 22 }}
                />
              </div>
            )}

            {/* ── Transport controls — each performs the real Discord action ── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="cc-btn" onClick={() => control('previous')} disabled={acting !== null}>
                {acting === 'previous' ? '…' : '⏮ Previous'}
              </button>
              {playing ? (
                <button className="cc-btn cc-btn-primary" onClick={() => control('pause')} disabled={acting !== null}>
                  {acting === 'pause' ? 'Pausing…' : '⏸ Pause'}
                </button>
              ) : (
                <button className="cc-btn cc-btn-primary" onClick={() => control('resume')} disabled={!paused || acting !== null}>
                  {acting === 'resume' ? 'Resuming…' : '▶ Resume'}
                </button>
              )}
              <button className="cc-btn" onClick={() => control('skip')} disabled={acting !== null}>
                {acting === 'skip' ? 'Skipping…' : '⏭ Skip'}
              </button>
              <button className="cc-btn" onClick={() => control('stop')} disabled={acting !== null}>
                {acting === 'stop' ? 'Stopping…' : '⏹ Stop'}
              </button>
              <button
                className="cc-btn"
                onClick={() => control('autoplay', { enabled: !state.autoplay })}
                disabled={acting !== null}
                aria-pressed={state.autoplay}
                style={{ borderColor: state.autoplay ? 'var(--cc-accent)' : undefined }}
              >
                🔄 AutoPlay {state.autoplay ? 'ON' : 'OFF'}
              </button>
              <Link className="cc-btn" href="/dashboard" style={{ textDecoration: 'none' }}>
                ▦ Dashboard
              </Link>
            </div>
          </section>

          {/* ── Reaction buttons: real, changeable preferences ── */}
          <section className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'var(--cc-text-dim)', fontSize: 13 }}>Your take on this track:</span>
              <button
                className="cc-btn"
                onClick={() => sendFeedback('love')}
                disabled={acting !== null || !state.current}
                aria-pressed={feedback === 'love'}
                style={{ borderColor: feedback === 'love' ? 'var(--cc-accent)' : undefined }}
              >
                👍 Love this {counts.love > 0 && <span style={{ color: 'var(--cc-text-faint)' }}>· {counts.love}</span>}
              </button>
              <button
                className="cc-btn"
                onClick={() => sendFeedback('dislike')}
                disabled={acting !== null || !state.current}
                aria-pressed={feedback === 'dislike'}
                style={{ borderColor: feedback === 'dislike' ? 'rgba(248,113,113,0.6)' : undefined }}
              >
                👎 Not for me {counts.dislike > 0 && <span style={{ color: 'var(--cc-text-faint)' }}>· {counts.dislike}</span>}
              </button>
              {feedback && (
                <span style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>
                  Saved for this track — click again to withdraw.
                </span>
              )}
            </div>
          </section>

          {/* ── Secondary: volume, loop, shuffle, disconnect ── */}
          <section className="cc-card" style={{ padding: '12px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--cc-text-dim)', fontSize: 13 }}>🔊 Volume</span>
              <input
                type="range" min={1} max={150} defaultValue={state.volume} key={`vol-${state.volume}`}
                onMouseUp={(e) => control('volume', { level: Number((e.target as HTMLInputElement).value) })}
                onTouchEnd={(e) => control('volume', { level: Number((e.target as HTMLInputElement).value) })}
                style={{ flex: '1 1 180px', maxWidth: 280, accentColor: 'var(--cc-accent)' }}
                aria-label="Volume"
              />
              <button className="cc-btn" onClick={() => control('loop')} disabled={acting !== null}>🔁 Track loop: {state.loop ? 'on' : 'off'}</button>
              <button className="cc-btn" onClick={() => control('queueLoop')} disabled={acting !== null}>🔂 Queue loop: {state.queueLoop ? 'on' : 'off'}</button>
              <button className="cc-btn" onClick={() => control('shuffle')} disabled={state.queueLength < 2 || acting !== null}>🔀 Shuffle</button>
              <button className="cc-btn" style={{ borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => control('disconnect')} disabled={acting !== null}>⏏ Disconnect</button>
              <button
                className="cc-btn"
                onClick={() => control('twentyFourSeven', { enabled: !state.twentyFourSeven })}
                disabled={acting !== null}
                aria-pressed={state.twentyFourSeven}
                style={{ borderColor: state.twentyFourSeven ? 'var(--cc-accent)' : undefined }}
              >
                🌙 24/7 {state.twentyFourSeven ? 'ON' : 'OFF'}
              </button>
            </div>
          </section>

          {/* ── Audio filters (real FFmpeg -af presets, allowlisted server-side) ── */}
          <section className="cc-card" style={{ padding: '12px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'var(--cc-text-dim)', fontSize: 13 }}>🎚 Filters:</span>
              {['bassboost', 'nightcore', 'vaporwave', '8d', 'karaoke', 'tremolo'].map((f) => {
                const active = (state.filters || []).includes(f);
                return (
                  <button
                    key={f}
                    className="cc-btn"
                    onClick={() => control('filter', { filter: active ? 'normal' : f })}
                    disabled={acting !== null}
                    aria-pressed={active}
                    style={{ borderColor: active ? 'var(--cc-accent)' : undefined, fontSize: 12.5 }}
                  >
                    {f}
                  </button>
                );
              })}
              {(state.filters || []).length > 0 && (
                <button className="cc-btn" onClick={() => control('resetFilters')} disabled={acting !== null} style={{ fontSize: 12.5 }}>
                  Reset
                </button>
              )}
            </div>
            {(state.filters || []).length > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                Active: {(state.filters || []).join(', ')} — applies from the next track.
              </p>
            )}
          </section>

          {/* ── Queue (server-side order; drag or buttons persist via move) ── */}
          <section className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
            <strong style={{ color: '#fff', fontSize: 14 }}>📜 Queue ({state.queueLength})</strong>
            {state.queue.length === 0 ? (
              <p style={{ margin: '8px 0 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>
                Empty — members add tracks with <code>/play</code>.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {state.queue.map((t, i) => (
                  <div
                    key={`${t.url}-${i}`}
                    draggable
                    onDragStart={() => setDragFrom(i + 1)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragFrom !== null && dragFrom !== i + 1) control('move', { from: dragFrom, to: i + 1 });
                      setDragFrom(null);
                    }}
                    onDragEnd={() => setDragFrom(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: 6, borderRadius: 8, background: dragFrom === i + 1 ? 'var(--cc-accent-soft)' : 'transparent', cursor: 'grab' }}
                    title="Drag to reorder"
                  >
                    <span style={{ color: 'var(--cc-text-faint)', cursor: 'grab' }} aria-hidden>☰</span>
                    <span style={{ color: 'var(--cc-text-faint)', width: 22 }}>{i + 1}.</span>
                    <span style={{ flex: 1, color: '#fff', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <span style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>{t.duration ? fmt(t.duration) : ''}</span>
                    <button className="cc-btn" style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => control('move', { from: i + 1, to: 1 })} disabled={acting !== null || i === 0}
                            aria-label={`Play ${t.title} next`} title="Play next">⏭</button>
                    <button className="cc-btn" style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => control('move', { from: i + 1, to: i })} disabled={acting !== null || i === 0}
                            aria-label={`Move ${t.title} up`}>↑</button>
                    <button className="cc-btn" style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => control('move', { from: i + 1, to: i + 2 })} disabled={acting !== null || i + 1 >= state.queue.length}
                            aria-label={`Move ${t.title} down`}>↓</button>
                    <button className="cc-btn" style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => control('remove', { position: i + 1 })} disabled={acting !== null}
                            aria-label={`Remove ${t.title} from the queue`}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {state.history.length > 0 && (
            <section className="cc-card" style={{ padding: '14px 18px' }}>
              <strong style={{ color: '#fff', fontSize: 14 }}>🕘 Recently played</strong>
              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                {state.history.slice(0, 10).map((t, i) => (
                  <div key={`${t.url}-${i}`} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                    {i + 1}. {t.title} <span style={{ color: 'var(--cc-text-faint)' }}>— {t.uploader}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Settings (persisted per server, pushed to the bot on save) ── */}
      <section className="cc-card" style={{ padding: '14px 18px', marginTop: 14 }}>
        <div className="cc-section-label" style={{ marginBottom: 10 }}>⚙️ Music settings</div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Music text channel</label>
            <DiscordChannelSelect
              channels={resources?.channels ?? []}
              value={String(musicCfg.musicChannelId || '')}
              onChange={(id) => updateGuildConfig('music', 'musicChannelId', id)}
              kinds="text" loading={resLoading}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Music voice channel</label>
            <DiscordChannelSelect
              channels={resources?.channels ?? []}
              value={String(musicCfg.voiceChannelId || '')}
              onChange={(id) => updateGuildConfig('music', 'voiceChannelId', id)}
              kinds="voice" loading={resLoading}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>DJ role</label>
            <DiscordRoleSelect
              roles={resources?.roles ?? []}
              value={String(musicCfg.djRoleId || '')}
              onChange={(id) => updateGuildConfig('music', 'djRoleId', id)}
              loading={resLoading}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Who can use music commands</label>
            <select className="cc-input" style={{ width: '100%' }}
                    value={String(musicCfg.controlMode || 'everyone')}
                    onChange={(e) => updateGuildConfig('music', 'controlMode', e.target.value)}>
              <option value="everyone">Everyone</option>
              <option value="dj">DJ role</option>
              <option value="moderators">Moderators</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
              Default volume ({Number(musicCfg.defaultVolume || 50)}%)
            </label>
            <input className="cc-input" type="number" min={1} max={150} style={{ width: '100%' }}
                   value={Number(musicCfg.defaultVolume || 50)}
                   onChange={(e) => updateGuildConfig('music', 'defaultVolume', Math.max(1, Math.min(150, Number(e.target.value) || 50)))} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
              Maximum volume ({Number(musicCfg.maxVolume || 150)}%)
            </label>
            <input className="cc-input" type="number" min={10} max={150} style={{ width: '100%' }}
                   value={Number(musicCfg.maxVolume || 150)}
                   onChange={(e) => updateGuildConfig('music', 'maxVolume', Math.max(10, Math.min(150, Number(e.target.value) || 150)))} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Default loop mode</label>
            <select className="cc-input" style={{ width: '100%' }}
                    value={String(musicCfg.defaultLoop || 'off')}
                    onChange={(e) => updateGuildConfig('music', 'defaultLoop', e.target.value)}>
              <option value="off">Off</option>
              <option value="track">Track</option>
              <option value="queue">Queue</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
              Command prefix <span style={{ color: 'var(--cc-text-faint)' }}>(saves instantly)</span>
            </label>
            <PrefixField guildId={selected.id} token={token} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
          {([
            ['twentyFourSeven', '🌙 24/7'],
            ['autoPlay', '🔄 Auto-play'],
            ['autoLeave', '⏏ Auto-leave'],
          ] as const).map(([key, label]) => (
            <label key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#fff' }}>
              <input type="checkbox" checked={Boolean(musicCfg[key])}
                     onChange={(e) => updateGuildConfig('music', key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="cc-btn cc-btn-primary" onClick={() => void saveGuildConfig()}
                  disabled={guildSaveState === 'saving'} style={{ fontSize: 12.5 }}>
            {guildSaveState === 'saving' ? 'Saving…' : guildSaveState === 'saved' ? '✓ Saved — pushed to the bot' : 'Save settings'}
          </button>
        </div>
      </section>
    </div>
  );
}
