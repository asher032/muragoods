'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';
import { statusMessage } from '../components/selectors';
import ModuleSettings from '../components/ModuleSettings';

interface EconomyOverview {
  users: number;
  circulation: { pocket: number; bank: number; total: number };
  dau: number;
  transactions: number;
  top: Array<{ userId: string; balance: number; bank: number }>;
  recent: Array<{ type: string; amount: number; at: string }>;
}

interface EconomyConfig {
  currencyName?: string;
  currencySymbol?: string;
  startBalance?: number;
  dailyAmount?: number;
  weeklyAmount?: number;
  monthlyAmount?: number;
  workMin?: number;
  workMax?: number;
  gambleMax?: number;
  workCooldownSec?: number;
  begCooldownSec?: number;
  crimeCooldownSec?: number;
  activityCooldownSec?: number;
  robCooldownSec?: number;
  lotteryTicketPrice?: number;
  lotteryMaxTickets?: number;
}

const SHOP = [
  { id: 'bread', name: 'Bread', price: 25, rarity: 'common' },
  { id: 'fishing_rod', name: 'Fishing Rod', price: 200, rarity: 'common' },
  { id: 'lucky_charm', name: 'Lucky Charm', price: 500, rarity: 'rare' },
  { id: 'mystery_box', name: 'Mystery Box', price: 500, rarity: 'rare' },
  { id: 'adventure_ticket', name: 'Adventure Ticket', price: 300, rarity: 'rare' },
  { id: 'farm_plot_deed', name: 'Farm Plot Deed', price: 400, rarity: 'common' },
  { id: 'speed_fertilizer', name: 'Speed Fertilizer', price: 150, rarity: 'common' },
  { id: 'golden_hook', name: 'Golden Hook', price: 2500, rarity: 'epic' },
];

const ACHIEVEMENTS = [
  'First Coin', 'Earner (5k net)', 'Tycoon (25k net)', 'Grinder (25 activities)',
  'High Roller (50 games)', 'Collector (10 items)', 'Angler (10 fish)',
  'Socialite (5 friends)', 'Loyal (7-day streak)', 'Reborn (prestige)', 'Omega',
];

export default function EconomyPage() {
  const { token, selected } = useGuild();
  const [overview, setOverview] = useState<EconomyOverview | null>(null);
  const [config, setConfig] = useState<EconomyConfig | null>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!token || !selected) return;
    const id = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    setCode('');
    const resp = await apiFetch<{ success: boolean; overview?: EconomyOverview; config?: EconomyConfig; error?: string; code?: string }>(
      `/api/dashboard/economy/overview?guildId=${selected.id}`, { token, signal: controller.signal });
    if (id !== requestId.current) return;
    if (resp.ok && resp.data.success && resp.data.overview) {
      setOverview(resp.data.overview);
      setConfig(resp.data.config ?? null);
    } else {
      setOverview(null);
      setError(resp.ok ? resp.data.error || 'Could not load economy' : resp.error);
      setCode(resp.ok ? resp.data.code || '' : (resp as { code?: string }).code || '');
    }
    setLoading(false);
  }, [token, selected]);

  useEffect(() => {
    setOverview(null);
    setConfig(null);
    setError('');
    setCode('');
    void load();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
    };
  }, [selected?.id, load]);

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to view the economy.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar.</p>;
  }

  const stat = (label: string, value: string | number) => (
    <div className="cc-card" style={{ padding: '12px 16px' }}>
      <div className="cc-section-label">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 2 }}>{value}</div>
    </div>
  );

  const mapped = error ? statusMessage(code, error) : null;
  const sym = config?.currencySymbol || '🪙';
  const cur = config?.currencyName || 'coins';

  return (
    <div style={{ maxWidth: 960 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>💰 Economy — {selected.name}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        Live totals from the same database the Discord commands use — never a parallel economy.
        Users, channels and roles are auto-discovered; admins never enter Discord IDs.
      </p>

      <div className="cc-section-label" style={{ marginBottom: 10 }}>Overview · statistics</div>
      {mapped && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 12 }}>
          <strong>⚠️ {mapped.title}</strong>
          <div style={{ marginTop: 4 }}>{mapped.hint}</div>
          <button className="cc-btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {loading && !overview && (
        <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading economy…</p>
      )}
      {!loading && !overview && !mapped && (
        <div className="cc-card" style={{ padding: 24, textAlign: 'center', marginBottom: 22 }}>
          <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>No economy data yet — rewards and activity will appear here.</p>
          <button className="cc-btn" style={{ marginTop: 10, fontSize: 12 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {overview && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
            {stat('Users', overview.users)}
            {stat(`In circulation (${cur})`, overview.circulation.total.toLocaleString())}
            {stat('Pocket / Bank', `${overview.circulation.pocket.toLocaleString()} / ${overview.circulation.bank.toLocaleString()}`)}
            {stat('Daily active', overview.dau)}
            {stat('Transactions', overview.transactions.toLocaleString())}
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 22 }}>
            <div className="cc-card" style={{ padding: '14px 18px' }}>
              <strong style={{ color: '#fff', fontSize: 14 }}>🏆 Top holders · leaderboards</strong>
              {overview.top.length === 0 ? (
                <p style={{ margin: '8px 0 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>No holders yet.</p>
              ) : (
                <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                  {overview.top.map((t, i) => (
                    <div key={t.userId} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                      <strong style={{ color: '#fff' }}>#{i + 1}</strong> <code>&lt;@{t.userId}&gt;</code>
                      {' '}— {(t.balance + t.bank).toLocaleString()} {sym}
                    </div>
                  ))}
                </div>
              )}
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--cc-text-faint)' }}>
                In Discord: /leaderboard stats|item — short commands, no prefix needed.
              </p>
            </div>
            <div className="cc-card" style={{ padding: '14px 18px' }}>
              <strong style={{ color: '#fff', fontSize: 14 }}>📜 Economy logs · audit</strong>
              {overview.recent.length === 0 ? (
                <p style={{ margin: '8px 0 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>No transactions yet.</p>
              ) : (
                <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                  {overview.recent.slice(0, 8).map((t, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                      <code>{t.type}</code> {t.amount > 0 ? '+' : ''}{t.amount}
                      <span style={{ color: 'var(--cc-text-faint)' }}> · {new Date(t.at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--cc-text-faint)' }}>
                Every mutation writes a unique transaction ID. In Discord: /currencylog.
              </p>
            </div>
          </div>
        </>
      )}

      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Rewards · cooldowns · anti-exploit</div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 22 }}>
        <div className="cc-card" style={{ padding: '14px 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
          <strong style={{ color: '#fff' }}>🎁 Daily / Weekly / Monthly</strong>
          <div style={{ marginTop: 6 }}>
            Daily <strong style={{ color: '#fff' }}>{config?.dailyAmount ?? 250}</strong> · Weekly{' '}
            <strong style={{ color: '#fff' }}>{config?.weeklyAmount ?? 1500}</strong> · Monthly{' '}
            <strong style={{ color: '#fff' }}>{config?.monthlyAmount ?? 6000}</strong> {sym}
          </div>
          <div style={{ marginTop: 4 }}>Starting balance: <strong style={{ color: '#fff' }}>{config?.startBalance ?? 100}</strong></div>
        </div>
        <div className="cc-card" style={{ padding: '14px 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
          <strong style={{ color: '#fff' }}>⏳ Cooldowns (seconds)</strong>
          <div style={{ marginTop: 6 }}>
            Work {config?.workCooldownSec ?? 3600} · Beg {config?.begCooldownSec ?? 300} · Crime {config?.crimeCooldownSec ?? 1800}
            <br />Activity {config?.activityCooldownSec ?? 600} · Rob {config?.robCooldownSec ?? 3600}
          </div>
        </div>
        <div className="cc-card" style={{ padding: '14px 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
          <strong style={{ color: '#fff' }}>🛡️ Anti-exploit</strong>
          <div style={{ marginTop: 6 }}>
            Atomic guarded balance updates · unique transaction IDs · idempotent claims ·
            server-side reward math · trade locking with timeout · max bet {config?.gambleMax ?? 10000}.
            Negative balances and duplicate payouts are refused by the write itself.
          </div>
        </div>
      </div>

      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Shop · items · lottery · events</div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 22 }}>
        <div className="cc-card" style={{ padding: '14px 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
          <strong style={{ color: '#fff' }}>🛒 Shop management</strong>
          <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
            {SHOP.map((s) => (
              <div key={s.id}><code>{s.id}</code> — {s.name} · <strong style={{ color: '#fff' }}>{s.price}</strong> {sym} · <em>{s.rarity}</em></div>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--cc-text-faint)' }}>Buy/sell in Discord: /shop view|buy|sell. Prices live in the bot catalog.</p>
        </div>
        <div className="cc-card" style={{ padding: '14px 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
          <strong style={{ color: '#fff' }}>🎟️ Lottery · 🎉 Events</strong>
          <div style={{ marginTop: 6 }}>
            Ticket <strong style={{ color: '#fff' }}>{config?.lotteryTicketPrice ?? 100}</strong> {sym} · max{' '}
            <strong style={{ color: '#fff' }}>{config?.lotteryMaxTickets ?? 10}</strong>/round · daily server-side draw
            (/lottery buy|auto|status).
            <br />Server events: donation pool + goal + donor rewards via /work event action:donate|pool|status.
            Only <strong style={{ color: '#fff' }}>/economy config</strong> needs the /economy prefix (admins).
          </div>
        </div>
        <div className="cc-card" style={{ padding: '14px 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
          <strong style={{ color: '#fff' }}>🏆 Achievements · badges · titles · pets · farm · fishing</strong>
          <div style={{ marginTop: 6 }}>{ACHIEVEMENTS.join(' · ')}</div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--cc-text-faint)' }}>
            Discord (short commands, no prefix): /balance, /daily, /weekly, /monthly, /deposit, /withdraw,
            /pay, /shop view|buy|sell, /inventory, /profile, /achievements, /quests, /calculate,
            /leaderboard stats|item, /pets, /farm, /fish, /trade, /lottery, /work shift|stars (+ odd jobs,
            session, vacation, events), /badges, /title, /notifications, /friends (+marry), /advancements,
            /minigames (incl. crime, rob, bankrob). Only /economy config is prefixed (admins).
          </p>
        </div>
      </div>

      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Configuration</div>
      <ModuleSettings moduleId="economy" />
    </div>
  );
}
