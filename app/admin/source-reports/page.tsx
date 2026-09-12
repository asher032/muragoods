'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type ProviderStat = {
  id: string;
  broken: number;
  ads: number;
  total: number;
  titles: number;
  score: number;
  lastReportAt: string | null;
  disabled: boolean;
};

type RawReport = {
  mediaType: string;
  tmdbId: number;
  season: number | null;
  episode: number | null;
  provider: string;
  issue: string;
  email: string | null;
  createdAt: string;
};

type TrendWeek = { label: string; weekKey: string; broken: number; ads: number };

const PROVIDER_NAMES: Record<string, string> = {
  vidlink: 'VidLink',
  videasy: 'Videasy',
  vidking: 'Vidking',
  vidfast: 'Vidfast',
  '111movies': '111Movies',
  '2embed': '2Embed',
  multiembed: 'MultiEmbed',
};

function TrendChart({ weeks }: { weeks: TrendWeek[] }) {
  const max = Math.max(1, ...weeks.map(w => w.broken + w.ads));
  if (weeks.every(w => w.broken + w.ads === 0)) {
    return <p style={{ color: '#555', fontSize: 12, margin: '8px 0 4px' }}>No reports in the last 8 weeks — a quiet chart is a healthy chart.</p>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130, padding: '0 4px' }}>
      {weeks.map(w => {
        const total = w.broken + w.ads;
        const h = (n: number) => `${(n / max) * 100}%`;
        return (
          <div key={w.weekKey} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%' }}>
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
              title={`${w.label}: ${w.broken} broken · ${w.ads} ads`}>
              <div style={{
                width: '70%', maxWidth: 42, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                height: `${(total / max) * 100}%`, minHeight: total > 0 ? 3 : 0, borderRadius: '4px 4px 0 0',
                overflow: 'hidden', transition: 'height 0.3s',
              }}>
                <div style={{ height: h(w.broken), background: '#ef4444' }} />
                <div style={{ height: h(w.ads), background: '#eab308' }} />
              </div>
            </div>
            <span style={{ fontSize: 10, color: total > 0 ? '#888' : '#444', whiteSpace: 'nowrap' }}>{w.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminSourceReportsPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderStat[]>([]);
  const [recent, setRecent] = useState<RawReport[]>([]);
  const [trend, setTrend] = useState<TrendWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const user = JSON.parse(userStr);
    const adminEmails = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];
    if (!adminEmails.includes(user.email)) { router.push('/admin'); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/source-reports');
      const data = await res.json();
      setProviders(data.providers || []);
      setRecent(data.recent || []);
      setTrend(data.trend || []);
    } catch {
      /* leave empty */
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleProvider = async (provider: string, disabled: boolean) => {
    setToggling(provider);
    // optimistic
    setProviders(prev => prev.map(p => (p.id === provider ? { ...p, disabled } : p)));
    try {
      await fetch('/api/admin/source-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, disabled }),
      });
    } catch {
      setProviders(prev => prev.map(p => (p.id === provider ? { ...p, disabled: !disabled } : p)));
    } finally {
      setToggling(null);
    }
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const scoreColor = (s: number) => (s >= 0.8 ? '#22c55e' : s >= 0.5 ? '#eab308' : '#ef4444');

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: 18, color: '#E5E5E5', margin: '0 0 6px' }}>
            ⚑ SOURCE REPORTS
          </h1>
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
            Community flags from the MuraStream player (last 30 days). Disable a provider to drop it globally.
          </p>
        </div>
        <Link href="/admin" style={{ color: '#B85CFF', fontSize: 13, textDecoration: 'none' }}>← Dashboard</Link>
      </div>

      {loading ? (
        <p style={{ color: '#666', fontFamily: 'var(--font-arcade)', fontSize: 12 }}>Loading…</p>
      ) : (
        <>
          {/* Weekly trend chart */}
          <div style={{ background: '#111', borderRadius: 12, border: '1px solid #1A1A1A', padding: '18px 20px', marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: 12, color: '#888', margin: 0, letterSpacing: '0.1em' }}>
                REPORT TREND — LAST 8 WEEKS
              </h2>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#666' }}>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#ef4444', borderRadius: 2, marginRight: 5 }} />Broken</span>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#eab308', borderRadius: 2, marginRight: 5 }} />Ads</span>
              </div>
            </div>
            <TrendChart weeks={trend} />
          </div>

          {/* Provider table */}
          <div style={{ background: '#111', borderRadius: 12, border: '1px solid #1A1A1A', overflow: 'hidden', marginBottom: 28 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
                  {['Provider', 'Trust', 'Broken', 'Ads', 'Titles', 'Last Report', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 14px', fontFamily: 'var(--font-arcade)', fontSize: 9, color: '#666', letterSpacing: '0.1em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {providers.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #141414' }}>
                    <td style={{ padding: '12px 14px', color: '#E5E5E5', fontWeight: 600 }}>{PROVIDER_NAMES[p.id] || p.id}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ color: scoreColor(p.score), fontWeight: 700 }}>{Math.round(p.score * 100)}%</span>
                    </td>
                    <td style={{ padding: '12px 14px', color: p.broken > 0 ? '#ef4444' : '#555' }}>{p.broken}</td>
                    <td style={{ padding: '12px 14px', color: p.ads > 0 ? '#eab308' : '#555' }}>{p.ads}</td>
                    <td style={{ padding: '12px 14px', color: '#888' }}>{p.titles}</td>
                    <td style={{ padding: '12px 14px', color: '#666', fontSize: 12 }}>{fmtDate(p.lastReportAt)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: p.disabled ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                        color: p.disabled ? '#ef4444' : '#22c55e',
                      }}>{p.disabled ? 'DISABLED' : 'ACTIVE'}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        onClick={() => toggleProvider(p.id, !p.disabled)}
                        disabled={toggling === p.id}
                        style={{
                          padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                          border: p.disabled ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(239,68,68,0.4)',
                          background: p.disabled ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                          color: p.disabled ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {toggling === p.id ? '…' : p.disabled ? 'Re-enable' : 'Disable globally'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent raw reports */}
          <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: 12, color: '#888', margin: '0 0 12px', letterSpacing: '0.1em' }}>
            RECENT REPORTS
          </h2>
          {recent.length === 0 ? (
            <p style={{ color: '#555', fontSize: 13 }}>No reports yet — the ⚑ button in the player feeds this table.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recent.map((r, i) => (
                <div key={i} style={{
                  background: '#111', border: '1px solid #1A1A1A', borderRadius: 10,
                  padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: r.issue === 'broken' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
                    color: r.issue === 'broken' ? '#ef4444' : '#eab308',
                  }}>{r.issue === 'broken' ? 'BROKEN' : 'ADS'}</span>
                  <span style={{ color: '#E5E5E5', fontSize: 13, fontWeight: 600, minWidth: 90 }}>{PROVIDER_NAMES[r.provider] || r.provider}</span>
                  <span style={{ color: '#888', fontSize: 12 }}>
                    {r.mediaType === 'tv' ? `TV ${r.tmdbId} · S${r.season ?? '?'}E${r.episode ?? '?'}` : `Movie ${r.tmdbId}`}
                  </span>
                  {r.email && <span style={{ color: '#555', fontSize: 11 }}>{r.email}</span>}
                  <span style={{ color: '#555', fontSize: 11, marginLeft: 'auto' }}>{fmtDate(r.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
