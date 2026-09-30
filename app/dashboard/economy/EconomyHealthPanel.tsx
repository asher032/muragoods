'use client';

import type { Health } from './useEconomyData';

// ── ❤️ Economy Health ───────────────────────────────────────────────────
// Real database aggregations, nothing invented. Each figure names where it
// comes from so a surprising number can be traced rather than guessed at.
//
// If the backend did not answer, this says so — it never substitutes zeros for
// unknown values, because a healthy-looking zero is worse than an honest gap.

function Row({ label, value, source, tone }: {
  label: string; value: string; source: string; tone?: 'pos' | 'neg';
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--cc-border, #1e1e2a)' }}>
      <div style={{ flex: '0 0 190px', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>{label}</div>
      <div style={{
        flex: '0 0 150px', textAlign: 'right', fontSize: 13.5, fontWeight: 700,
        color: tone === 'pos' ? '#4ade80' : tone === 'neg' ? '#f87171' : '#fff',
      }}>
        {value}
      </div>
      <div style={{ flex: 1, fontSize: 11, color: 'var(--cc-text-faint)', textAlign: 'right' }}>{source}</div>
    </div>
  );
}

export default function EconomyHealthPanel({ health, symbol }: { health: Health | null; symbol: string }) {
  if (!health) {
    return (
      <div className="cc-card" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>
          Economy health is unavailable — Murabot did not return the aggregates.
        </p>
      </div>
    );
  }

  const net = health.netChangeToday;

  return (
    <div>
      <div className="cc-card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--cc-text-faint)', marginBottom: 4 }}>
          In circulation · last {health.windowHours}h window
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>
          {health.circulation.toLocaleString()} <span style={{ fontSize: 16 }}>{symbol}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--cc-text-faint)', marginTop: 2 }}>
          SUM(pocket) + SUM(bank) over {health.wallets.toLocaleString()} wallet(s) · pocket{' '}
          {health.pocket.toLocaleString()} · bank {health.bank.toLocaleString()}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="cc-section-label" style={{ marginBottom: 4 }}>Currency flow (24h)</div>
        <Row label="Currency created" value={`+${health.createdToday.toLocaleString()}`}
          source="ledger rows, positive types" tone="pos" />
        <Row label="Currency removed" value={`−${health.removedToday.toLocaleString()}`}
          source="ledger rows, spend types" tone="neg" />
        <Row label="Net currency change" value={`${net > 0 ? '+' : ''}${net.toLocaleString()}`}
          source="created − removed" tone={net >= 0 ? 'pos' : 'neg'} />
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="cc-section-label" style={{ marginBottom: 4 }}>Balance distribution</div>
        <Row label="Average balance" value={`${Math.round(health.avgBalance).toLocaleString()} ${symbol}`}
          source="$avg of pocket + bank" />
        <Row label="Median balance" value={`${health.medianBalance.toLocaleString()} ${symbol}`}
          source="$percentile p=0.5" />
        <Row label="Highest balance" value={`${health.highestBalance.toLocaleString()} ${symbol}`}
          source="$max of pocket + bank" />
        <Row label="Top-holder concentration" value={`${health.topSharePct.toFixed(2)}%`}
          source="largest wallet ÷ circulation" />
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="cc-section-label" style={{ marginBottom: 4 }}>Volume (24h)</div>
        <Row label="Shop spending" value={health.shopSpending.toLocaleString()} source="Σ |shop_buy|" />
        <Row label="Market volume" value={health.marketVolume.toLocaleString()} source="Σ |market_buy| + |market_sell|" />
        <Row label="Reward payouts" value={health.rewardPayouts.toLocaleString()} source="Σ positive reward types" />
        <Row label="Gambling volume" value={health.gamblingVolume.toLocaleString()} source="Σ |gamble/crime/rob/lottery|" />
        <Row label="Work income" value={health.workIncome.toLocaleString()} source="Σ |job| + |work| + |activity|" />
      </div>

      {health.topSharePct > 50 && (
        <div className="cc-alert cc-alert-error" style={{ marginTop: 12 }} role="alert">
          <strong>⚠️ Over half the currency sits with one wallet</strong>
          <div style={{ marginTop: 4 }}>
            {health.topSharePct.toFixed(1)}% of circulation belongs to the largest holder. That is a
            concentration read, not a fault — but it is worth a look if it is new.
          </div>
        </div>
      )}
    </div>
  );
}
