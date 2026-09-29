'use client';

// Economy → Rewards: which commands award items, at what chance, from which
// pool. Rendered from the generated snapshot so it can never drift from the
// bot's `rewards.DEFAULT_DROP_CHANCES`.
//
// Drop probabilities, reward values, prices and cooldowns are ECONOMIC values.
// They are displayed read-only and are Bot Owner only to change; ordinary
// server admins can review this page but the API rejects economic writes from
// non-owner accounts.

import { useMemo, useState } from 'react';
import table from '@/app/lib/items-table.json';

const RARITIES = table.rarities as string[];
const DROP_CHANCES = table.dropChances as unknown as Record<
  string,
  Record<string, number>
>;
const REWARD_POOLS = table.rewardPools as unknown as Record<
  string,
  Record<string, number>
>;
const RARITY_EMOJI = table.rarityEmoji as unknown as Record<string, string>;

const SOURCE_LABELS: Record<string, string> = {
  daily: '/daily',
  weekly: '/weekly',
  monthly: '/monthly',
  work: '/work shift',
  activity: '/work activities',
  beg: '/work beg',
  crime: '/minigames crime',
  rob: '/minigames rob',
  quest: '/quests',
  fish: '/fish',
  farm: '/farm',
  dig: '/dig',
};

export default function RewardsPanel() {
  const [query, setQuery] = useState('');
  const sources = useMemo(
    () => Object.keys(DROP_CHANCES).sort((a, b) => (SOURCE_LABELS[a] ?? a).localeCompare(SOURCE_LABELS[b] ?? b)),
    []
  );
  const shown = sources.filter(
    (s) => !query.trim() || (SOURCE_LABELS[s] ?? s).toLowerCase().includes(query.trim().toLowerCase())
  );
  const totalDrops = useMemo(
    () =>
      sources.reduce(
        (sum, s) =>
          sum +
          Object.entries(DROP_CHANCES[s]).reduce(
            (a, [, v]) => a + v,
            0
          ),
        0
      ),
    [sources]
  );

  const selectStyle = {
    background: 'var(--cc-bg)',
    color: 'var(--cc-text)',
    border: '1px solid var(--cc-border, #2a2a3a)',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 12.5,
  } as const;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter commands…"
          style={{ ...selectStyle, minWidth: 180, flex: '1 1 180px' }}
        />
        <span style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>
          {sources.length} reward sources ·{' '}
          {Object.values(REWARD_POOLS).reduce(
            (sum, p) => sum + (p.common ?? 0) + (p.uncommon ?? 0) + (p.rare ?? 0),
            0
          )}{' '}
          eligible item slots
        </span>
      </div>

      <div className="cc-card" style={{ padding: '0', overflow: 'hidden', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cc-text-faint)' }}>
              <th style={{ padding: '10px 14px' }}>Command</th>
              <th style={{ padding: '10px 8px' }}>Item drops</th>
              {RARITIES.map((r) => (
                <th key={r} style={{ padding: '10px 8px' }}>
                  {RARITY_EMOJI[r]} {r}
                </th>
              ))}
              <th style={{ padding: '10px 8px' }}>Pool</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((src) => {
              const chances = DROP_CHANCES[src] ?? {};
              const pool = REWARD_POOLS[src] ?? {};
              const total = Object.values(chances).reduce((a, b) => a + b, 0);
              return (
                <tr key={src} style={{ borderTop: '1px solid var(--cc-border, #2a2a3a)' }}>
                  <td style={{ padding: '9px 14px', color: '#fff', whiteSpace: 'nowrap' }}>
                    <code>{SOURCE_LABELS[src] ?? src}</code>
                  </td>
                  <td style={{ padding: '9px 8px', color: 'var(--cc-text-dim)' }}>
                    {total > 0 ? `${(total * 100).toFixed(1)}%` : '—'}
                  </td>
                  {RARITIES.map((r) => (
                    <td key={r} style={{ padding: '9px 8px', color: 'var(--cc-text-dim)' }}>
                      {chances[r] ? `${(chances[r] * 100).toFixed(1)}%` : '—'}
                    </td>
                  ))}
                  <td style={{ padding: '9px 14px', color: 'var(--cc-text-faint)' }}>
                    {Object.entries(pool)
                      .filter(([, n]) => n > 0)
                      .map(([r, n]) => `${n} ${r}`)
                      .join(' · ') || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>
        Every drop is rolled server-side by <code>rewards.roll_item_reward</code>. The client can only
        trigger a command — it can never choose the item, rarity, quantity or chance. Each award
        writes an immutable <code>item_reward</code> transaction visible in{' '}
        <code>/currencylog</code> and the economy audit log.
      </p>
      <p style={{ marginTop: 8, fontSize: 12, color: 'var(--cc-text-faint)' }}>
        🔒 Drop probabilities, reward amounts, prices and cooldowns are economic values —{' '}
        <strong style={{ color: 'var(--cc-text-dim)' }}>Bot Owner only</strong>. Guild admins can
        read this table but not change it.
      </p>
    </div>
  );
}
