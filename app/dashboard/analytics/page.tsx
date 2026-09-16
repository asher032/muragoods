'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useGuild } from '@/app/lib/guild-context';

interface AnalyticsData {
  command_usage: Array<{ command: string; count: number; success_rate: number }>;
  errors: Array<{ type: string; count: number; last_occurrence: string | null }>;
  moderation_actions: { total: number; by_type: Record<string, number> };
  tickets: { created: number; closed: number; avg_resolution_ms: number };
  suggestions: { submitted: number; approved: number; denied: number };
  giveaways: { active: number; completed: number };
  xp: { total_granted: number; top_users: Array<{ user_id: string; username: string; xp: number }> };
  economy: { transactions: number; daily_claims: number };
  music: { sessions: number; tracks_played: number; top_artists: Array<{ artist: string; plays: number }> };
  uptime_data: Array<{ date: string; uptime_seconds: number; status: string }>;
}

type RangeKey = 'today' | '7days' | '30days' | 'alltime';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7days', label: '7 Days' },
  { key: '30days', label: '30 Days' },
  { key: 'alltime', label: 'All Time' },
];

interface TestResult {
  status: 'passed' | 'warning' | 'failed';
  reason: string;
  loading?: boolean;
}

function BarChart({ data, title, maxValue }: { data: Array<{ label: string; value: number }>; title: string; maxValue?: number }) {
  const max = maxValue || Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0) {
    return (
      <div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' }}>
        No data for this period.
      </div>
    );
  }
  return (
    <div>
      <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14, fontWeight: 600 }}>{title}</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 24 }}>
              <span style={{ width: 90, fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.label}
              </span>
              <div style={{ flex: 1, height: 18, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 4,
                  background: `linear-gradient(90deg, #5865F2, #7b8cf5)`,
                  minWidth: pct > 0 ? 2 : 0,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <span style={{ width: 50, fontSize: 11, color: '#fff', fontWeight: 600, flexShrink: 0 }}>{d.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div style={{
      padding: '18px 20px', background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{label}</span>
      <span style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function MiniBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 80, fontSize: 12, color: 'rgba(255,255,255,0.55)', textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: '#e50914', transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ width: 40, fontSize: 12, color: '#fff', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const { token, selected } = useGuild();
  const [range, setRange] = useState<RangeKey>('7days');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Feature tester state
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState(false);

  const fetchAnalytics = useCallback(async (r: RangeKey) => {
    if (!token || !selected) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`/api/dashboard/analytics?guildId=${selected.id}&range=${r}`, {
        headers: { 'x-discord-token': token },
      });
      const data = await resp.json();
      if (data.success) {
        setAnalytics(data.data);
      } else {
        setError(data.error || 'Failed to load analytics');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [token, selected]);

  useEffect(() => {
    if (token && selected) fetchAnalytics(range);
  }, [token, selected, range, fetchAnalytics]);

  const runTest = async (module: string) => {
    if (!token || !selected) return;
    setTestResults((prev) => ({ ...prev, [module]: { status: 'failed', reason: '', loading: true } }));
    try {
      const resp = await fetch('/api/dashboard/feature-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-discord-token': token },
        body: JSON.stringify({ guildId: selected.id, module }),
      });
      const data = await resp.json();
      if (data.success) {
        setTestResults((prev) => ({
          ...prev,
          [module]: { status: 'passed', reason: 'All checks passed' },
        }));
      } else if (data.missing && data.missing.length > 0) {
        setTestResults((prev) => ({
          ...prev,
          [module]: { status: 'warning', reason: `Missing: ${data.missing.join(', ')}` },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [module]: { status: 'failed', reason: data.error || 'Test failed' },
        }));
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [module]: { status: 'failed', reason: String(err) },
      }));
    }
  };

  const runAllTests = async () => {
    if (!token || !selected) return;
    setTesting(true);
    const modules = ['tickets', 'moderation', 'music', 'suggestions', 'giveaways'];
    for (const m of modules) {
      await runTest(m);
    }
    setTesting(false);
  };

  // Summary stats for top cards
  const totalCommands = analytics?.command_usage.reduce((a, c) => a + c.count, 0) || 0;
  const totalErrors = analytics?.errors.reduce((a, c) => a + c.count, 0) || 0;
  const totalModActions = analytics?.moderation_actions.total || 0;

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to view analytics.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar to view analytics.</p>;
  }

  return (
    <div>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff' }}>📊 Bot Analytics</h1>
        <Link href="/dashboard" className="cc-link" style={{ color: 'var(--cc-accent)', fontSize: 13 }}>← Back to Command Center</Link>
      </div>

            {/* Date Range Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRange(opt.key)}
                  style={{
                    padding: '8px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: range === opt.key ? '#5865F2' : 'rgba(255,255,255,0.06)',
                    color: range === opt.key ? '#fff' : 'rgba(255,255,255,0.6)',
                    border: `1px solid ${range === opt.key ? '#5865F2' : 'rgba(255,255,255,0.12)'}`,
                    transition: 'all .2s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {error && (
              <div style={{ padding: 16, background: 'rgba(229,9,20,0.1)', border: '1px solid rgba(229,9,20,0.3)', borderRadius: 12, color: '#ff6b6b', fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.5)' }}>
                Loading analytics…
              </div>
            )}

            {!loading && analytics && (
              <>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                  <StatCard icon="📟" label="Total Commands" value={totalCommands.toLocaleString()} />
                  <StatCard icon="❌" label="Errors" value={totalErrors.toLocaleString()} />
                  <StatCard icon="🛡️" label="Mod Actions" value={totalModActions.toLocaleString()} />
                  <StatCard icon="🎫" label="Tickets Open" value={analytics.tickets.created} />
                  <StatCard icon="💡" label="Suggestions" value={analytics.suggestions.submitted} />
                  <StatCard icon="🎁" label="Giveaways" value={analytics.giveaways.active} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
                  {/* Command Usage */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
                    <BarChart
                      title="📟 Command Usage"
                      data={analytics.command_usage.map((c) => ({ label: c.command, value: c.count }))}
                    />
                    {analytics.command_usage.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        {analytics.command_usage.slice(0, 8).map((c, i) => (
                          <MiniBar key={i} label={c.command} value={c.count} max={analytics.command_usage[0].count} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Errors */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
                    <BarChart
                      title="❌ Errors"
                      data={analytics.errors.map((e) => ({ label: e.type, value: e.count }))}
                    />
                    {analytics.errors.length === 0 && (
                      <div style={{ padding: 16, color: '#2ECC40', fontSize: 13, textAlign: 'center' }}>✓ No errors in this period</div>
                    )}
                  </div>

                  {/* XP */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
                    <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>📈 XP (Top Users)</h4>
                    <div style={{ marginBottom: 10, color: '#fff', fontSize: 20, fontWeight: 800 }}>{analytics.xp.total_granted.toLocaleString()} total</div>
                    {analytics.xp.top_users.length > 0 ? (
                      analytics.xp.top_users.map((u, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ width: 22, fontSize: 12, color: '#e50914', fontWeight: 700 }}>{i + 1}</span>
                          <span style={{ flex: 1, fontSize: 13, color: '#f5f5f7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</span>
                          <span style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{u.xp.toLocaleString()} XP</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' }}>No XP data</div>
                    )}
                  </div>

                  {/* Music */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
                    <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>🎵 Music Stats</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Sessions</div>
                        <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{analytics.music.sessions}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Tracks Played</div>
                        <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{analytics.music.tracks_played}</div>
                      </div>
                    </div>
                    {analytics.music.top_artists.length > 0 ? (
                      <BarChart
                        title="Top Artists"
                        data={analytics.music.top_artists.map((a) => ({ label: a.artist, value: a.plays }))}
                      />
                    ) : (
                      <div style={{ padding: 12, color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' }}>No music data</div>
                    )}
                  </div>

                  {/* Tickets Detail */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
                    <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>🎫 Tickets</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Created</div>
                        <div style={{ color: '#5865F2', fontSize: 22, fontWeight: 800 }}>{analytics.tickets.created}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Closed</div>
                        <div style={{ color: '#e50914', fontSize: 22, fontWeight: 800 }}>{analytics.tickets.closed}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Avg Resolve</div>
                        <div style={{ color: '#2ECC40', fontSize: 22, fontWeight: 800 }}>{analytics.tickets.avg_resolution_ms > 0 ? Math.round(analytics.tickets.avg_resolution_ms / 1000) + 's' : 'N/A'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Suggestions / Giveaways / Economy */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
                    <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>💡 Suggestions</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Submitted</div>
                        <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>{analytics.suggestions.submitted}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Approved</div>
                        <div style={{ color: '#2ECC40', fontSize: 20, fontWeight: 800 }}>{analytics.suggestions.approved}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Denied</div>
                        <div style={{ color: '#e50914', fontSize: 20, fontWeight: 800 }}>{analytics.suggestions.denied}</div>
                      </div>
                    </div>
                    <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>🎁 Giveaways</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Active</div>
                        <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>{analytics.giveaways.active}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Completed</div>
                        <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>{analytics.giveaways.completed}</div>
                      </div>
                    </div>
                    <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: 14 }}>💰 Economy</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Transactions</div>
                        <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>{analytics.economy.transactions}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Daily Claims</div>
                        <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>{analytics.economy.daily_claims}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Moderation Actions */}
                {analytics.moderation_actions.total > 0 && (
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 14px', color: '#fff', fontSize: 14 }}>🛡️ Moderation Actions ({analytics.moderation_actions.total} total)</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
                      {Object.entries(analytics.moderation_actions.by_type).map(([type, count]) => (
                        <div key={type} style={{
                          padding: 14, textAlign: 'center', background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
                        }}>
                          <div style={{ color: '#fff', fontSize: 24, fontWeight: 800, textTransform: 'capitalize' }}>{count}</div>
                          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'capitalize' }}>{type}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Uptime Data */}
                {analytics.uptime_data.length > 0 && (
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 14px', color: '#fff', fontSize: 14 }}>⏱️ Uptime Data</h4>
                    {analytics.uptime_data.map((u, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ width: 70, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{u.date}</span>
                        <span style={{ flex: 1, color: '#fff', fontSize: 13 }}>{u.uptime_seconds.toLocaleString()}s</span>
                        <span style={{
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: u.status === 'online' ? 'rgba(46,204,64,0.15)' : u.status === 'degraded' ? 'rgba(255,214,10,0.15)' : 'rgba(229,9,20,0.15)',
                          color: u.status === 'online' ? '#2ECC40' : u.status === 'degraded' ? '#f6c453' : '#ff6b6b',
                        }}>
                          {u.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Feature Tester */}
            <div style={{ padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>🔧 Feature Tester</h3>
                <button
                  onClick={runAllTests}
                  disabled={testing}
                  style={{
                    padding: '8px 16px', background: '#5865F2', border: 'none', borderRadius: 8,
                    color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: testing ? 0.5 : 1,
                  }}
                >
                  {testing ? 'Testing…' : 'Test All Modules'}
                </button>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 }}>
                Test each module to verify it&apos;s properly configured for this server.
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {/* Tickets */}
                <TestRow
                  icon="🎫" name="Tickets" label="Test Ticket Creation"
                  description="Check if category configured, bot has permissions"
                  result={testResults.tickets}
                  onTest={() => runTest('tickets')}
                />
                {/* Moderation */}
                <TestRow
                  icon="🛡️" name="Moderation" label="Test Moderation"
                  description="Check bot has Kick/Ban/Manage Messages"
                  result={testResults.moderation}
                  onTest={() => runTest('moderation')}
                />
                {/* Music */}
                <TestRow
                  icon="🎵" name="Music" label="Test Voice Connection"
                  description="Check bot can connect to voice"
                  result={testResults.music}
                  onTest={() => runTest('music')}
                />
                {/* Suggestions */}
                <TestRow
                  icon="💡" name="Suggestions" label="Test Suggestion Channel"
                  description="Check suggestion channel is configured"
                  result={testResults.suggestions}
                  onTest={() => runTest('suggestions')}
                />
                {/* Giveaways */}
                <TestRow
                  icon="🎁" name="Giveaways" label="Test Giveaway Message"
                  description="Check giveaway channel and permissions"
                  result={testResults.giveaways}
                  onTest={() => runTest('giveaways')}
                />
              </div>
            </div>
    </div>
  );
}

function TestRow({ icon, name, label, description, result, onTest }: {
  icon: string; name: string; label: string; description: string; result?: TestResult; onTest: () => void;
}) {
  const statusStyle = result?.status === 'passed'
    ? { bg: 'rgba(46,204,64,0.1)', border: 'rgba(46,204,64,0.3)', color: '#2ECC40' }
    : result?.status === 'warning'
      ? { bg: 'rgba(255,214,10,0.1)', border: 'rgba(255,214,10,0.3)', color: '#f6c453' }
      : result?.status === 'failed'
        ? { bg: 'rgba(229,9,20,0.1)', border: 'rgba(229,9,20,0.3)', color: '#ff6b6b' }
        : { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' };

  const badge = result?.status === 'passed' ? '✓ Passed'
    : result?.status === 'warning' ? '⚠ Warning'
    : result?.status === 'failed' ? '✕ Failed'
    : 'Not tested';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
      background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, borderRadius: 12,
    }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ color: '#fff', fontSize: 14 }}>{name}</strong>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>— {label}: {description}</span>
        </div>
        {result?.reason && (
          <p style={{ margin: '4px 0 0', color: statusStyle.color, fontSize: 12 }}>{result.reason}</p>
        )}
      </div>
      <span style={{
        padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)', color: statusStyle.color,
        fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {badge}
      </span>
      <button
        onClick={onTest}
        disabled={result?.loading}
        style={{
          padding: '8px 16px', background: '#5865F2', border: 'none', borderRadius: 8,
          color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: result?.loading ? 0.5 : 1,
        }}
      >
        {result?.loading ? '…' : 'TEST'}
      </button>
    </div>
  );
}
