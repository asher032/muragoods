'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';

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
  current: Track | null;
  position: number;
  volume: number;
  loop: boolean;
  queueLoop: boolean;
  autoplay: boolean;
  queue: Track[];
  queueLength: number;
  history: Track[];
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function MusicPage() {
  const { token, selected } = useGuild();
  const [state, setState] = useState<MusicState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!token || !selected) return;
    setLoading(true);
    const resp = await apiFetch<{ success: boolean; state: MusicState; error?: string }>(
      `/api/dashboard/music?guildId=${encodeURIComponent(selected.id)}`,
      { token },
    );
    if (resp.ok && resp.data.success) {
      setState(resp.data.state);
      setError('');
    } else {
      setState(null);
      setError(resp.ok ? (resp.data as unknown as { error?: string }).error || 'Unknown error' : resp.error);
    }
    setLoading(false);
  }, [token, selected]);

  // Poll real state every 5s; local ticker advances the progress bar between polls.
  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const control = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!token || !selected) return;
    setActing(action);
    const resp = await apiFetch<{ success: boolean; result?: unknown; error?: string }>(
      '/api/dashboard/music',
      { method: 'POST', token, body: { guildId: selected.id, action, ...extra } },
    );
    if (!resp.ok || !resp.data.success) {
      setError(resp.ok ? (resp.data as unknown as { error?: string }).error || 'Action failed' : resp.error);
    } else {
      setError('');
    }
    setActing(null);
    await load();
  };

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to control music.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar.</p>;
  }

  const playing = state?.state === 'playing';
  const paused = state?.state === 'paused';
  const connected = state?.connected ?? false;
  const pos = state?.current ? Math.min((state.position || 0) + (playing ? tick % 6 : 0), state.current.duration || 0) : 0;
  const dur = state?.current?.duration || 0;
  const filled = dur ? Math.round((pos / dur) * 22) : 0;
  const bar = dur ? '▰'.repeat(filled) + '▱'.repeat(22 - filled) : '';

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
          <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, color: '#fff' }}>🎵 Music Controller — {selected.name}</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--cc-text-dim)' }}>
            Live controls for the real Discord player. State polls every 5s.
          </p>
        </div>
        {/* Connection + playback state — straight from the bot, never fabricated */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className={`cc-status-pill ${connected ? 'cc-status-online' : 'cc-status-offline'}`}>
            <span className="cc-dot" />
            {connected ? `🟢 Connected • ${state?.voiceChannel || 'voice'}` : '🔴 Not connected'}
          </span>
          {connected && (
            <span className="cc-chip">{playing ? '▶ Playing' : paused ? '⏸ Paused' : '⏹ Idle'}</span>
          )}
        </div>
      </div>

      {error && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

      {loading && !state && <p style={{ color: 'var(--cc-text-faint)' }}>Reading player state…</p>}

      {!loading && !connected && (
        <div className="cc-card" style={{ padding: 36, textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 14 }}>
            🔴 Not connected — the bot joins voice when someone runs <code>/play</code> in Discord.
            Once it&apos;s in a channel, this page becomes a live remote.
          </p>
        </div>
      )}

      {state && connected && (
        <>
          {/* Now playing card */}
          <div className="cc-card" style={{ padding: '16px 20px', marginBottom: 14 }}>
            {state.current ? (
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                {state.current.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={state.current.thumbnail} alt="" width={64} height={64}
                       style={{ borderRadius: 10, objectFit: 'cover' }} />
                )}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{state.current.title}</div>
                  <div style={{ color: 'var(--cc-text-dim)', fontSize: 13 }}>{state.current.uploader}</div>
                  {dur > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--cc-text-dim)', fontFamily: 'monospace' }}>
                      {fmt(pos)} {bar} {fmt(dur)}
                    </div>
                  )}
                  <div style={{ color: 'var(--cc-text-faint)', fontSize: 11.5, marginTop: 3 }}>
                    {state.current.requester ? `requested by ${state.current.requester}` : ''}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13.5 }}>Nothing playing — queue is idle.</p>
            )}
          </div>

          {/* Real transport controls */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button className="cc-btn" onClick={() => control('pause')} disabled={!playing || acting !== null}>⏸ Pause</button>
            <button className="cc-btn" onClick={() => control('resume')} disabled={!paused || acting !== null}>▶ Resume</button>
            <button className="cc-btn cc-btn-primary" onClick={() => control('skip')} disabled={acting !== null}>⏭ Skip</button>
            <button className="cc-btn" onClick={() => control('stop')} disabled={acting !== null}>⏹ Stop</button>
            <button className="cc-btn" onClick={() => control('loop')} disabled={acting !== null}>
              🔁 Track loop: {state.loop ? 'on' : 'off'}
            </button>
            <button className="cc-btn" onClick={() => control('queueLoop')} disabled={acting !== null}>
              🔂 Queue loop: {state.queueLoop ? 'on' : 'off'}
            </button>
            <button className="cc-btn" onClick={() => control('shuffle')} disabled={state.queueLength < 2 || acting !== null}>🔀 Shuffle</button>
            <button className="cc-btn" style={{ borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => control('disconnect')} disabled={acting !== null}>
              ⏏ Disconnect
            </button>
          </div>

          {/* Volume */}
          <div className="cc-card" style={{ padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--cc-text-dim)', fontSize: 13 }}>🔊 Volume</span>
            <input
              type="range" min={1} max={150} defaultValue={state.volume}
              onMouseUp={(e) => control('volume', { level: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={(e) => control('volume', { level: Number((e.target as HTMLInputElement).value) })}
              style={{ flex: 1, maxWidth: 260, accentColor: 'var(--cc-accent)' }}
            />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{state.volume}%</span>
          </div>

          {/* Queue */}
          <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ color: '#fff', fontSize: 14 }}>📜 Queue ({state.queueLength})</strong>
            </div>
            {state.queue.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>Empty — members add tracks with /play.</p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {state.queue.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ color: 'var(--cc-text-faint)', width: 20 }}>{i + 1}.</span>
                    <span style={{ flex: 1, color: '#fff', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <span style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>{t.duration ? fmt(t.duration) : ''}</span>
                    <button className="cc-btn" style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => control('remove', { position: i + 1 })} disabled={acting !== null}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History */}
          {state.history.length > 0 && (
            <div className="cc-card" style={{ padding: '14px 18px' }}>
              <strong style={{ color: '#fff', fontSize: 14 }}>🕘 Recently played</strong>
              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                {state.history.map((t, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                    {i + 1}. {t.title} <span style={{ color: 'var(--cc-text-faint)' }}>— {t.uploader}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
