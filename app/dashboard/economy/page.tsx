'use client';

// ── 💰 ECONOMY — the Muragoods control centre ────────────────────────────
//
// Page order is deliberate and is the whole point of this layout:
//
//   FEATURES first — Overview, Shop, Inventory, Items, Market, Work, Rewards,
//   Lottery, Achievements, Fishing, Farm, Pets, Minigames, Configuration.
//   These are the things an authorized user can actually act on.
//
//   INFORMATION second — Statistics, Leaderboards, Logs, Transactions,
//   Economy Health, Anti-Exploit, System Status.
//   These explain what happened. They read the same numbers; they change
//   nothing.
//
// Every figure below is produced by the Murabot backend against the same
// MongoDB collections the Discord slash commands use. This page performs no
// economy arithmetic of its own and keeps no competing copy of a balance.

import { useMemo, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { statusMessage } from '../components/selectors';
import ModuleSettings from '../components/ModuleSettings';
import ItemsPanel from '../components/ItemsPanel';
import RewardsPanel from '../components/RewardsPanel';
import { useEconomyData, type ShopItem, type TxnRow } from './useEconomyData';
import ShopPanel from './ShopPanel';
import LeaderboardPanel from './LeaderboardPanel';
import TransactionsPanel from './TransactionsPanel';
import EconomyHealthPanel from './EconomyHealthPanel';
import AntiExploitPanel from './AntiExploitPanel';
import { EconomyConfigPanel } from './EconomyConfigPanel';
import { EconomyFeatureCards, EconomyInformationNav, SECTIONS, type SectionId } from './sections';

export default function EconomyPage() {
  const { token, selected } = useGuild();
  const { data, loading, error, code, reload, actorId, isOwner } = useEconomyData();
  // The shop is a feature, so it opens at the top rather than below the fold.
  const [active, setActive] = useState<SectionId>('overview');

  const sym = data.config?.currencySymbol || '🪙';
  const mapped = error ? statusMessage(code, error) : null;

  const shop = data.shop;
  const shopByRarity = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of shop?.items ?? []) {
      counts[item.rarity] = (counts[item.rarity] ?? 0) + 1;
    }
    return counts;
  }, [shop]);

  if (!token) {
    return (
      <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>
        Sign in with Discord to view the economy.
      </p>
    );
  }
  if (!selected) {
    return (
      <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>
        Select a server in the top bar.
      </p>
    );
  }

  const ov = data.overview;

  return (
    <div style={{ maxWidth: 1080 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
        MURAGOODS
      </p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>
        💰 Economy — {selected.name}
      </h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        Live totals from the same database the Discord commands use — never a parallel economy.
        Features first, information below.
      </p>

      {mapped && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 14 }}>
          <strong>⚠️ {mapped.title}</strong>
          <div style={{ marginTop: 4 }}>{mapped.hint}</div>
          <button className="cc-btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}
      {loading && !ov && (
        <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading economy…</p>
      )}

      {/* ── FEATURE CARDS ────────────────────────────────────────────── */}
      <div className="cc-section-label" style={{ marginBottom: 10 }}>
        Features — manage what members can use
      </div>
      <EconomyFeatureCards
        active={active}
        onSelect={setActive}
        shopItemCount={shop?.items.length ?? 0}
      />

      {/* Information lives below the features, reachable from its own row so
          the diagnostic screens never crowd the management controls. */}
      <div className="cc-section-label" style={{ margin: '22px 0 8px' }}>
        Information — explain what is happening
      </div>
      <EconomyInformationNav active={active} onSelect={setActive} />

      <div style={{ marginTop: 18 }}>
        {active === 'overview' && (
          <Section title="1 · Overview" subtitle="Where the economy stands right now">
            {!ov ? (
              <EmptyCard
                title="No economy data yet"
                body="Balances appear as soon as members use the economy in Discord."
                onRetry={() => void reload()}
              />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <Stat label="In circulation" value={`${ov.circulation.total.toLocaleString()} ${sym}`}
                    hint={`SUM(pocket) + SUM(bank) across ${ov.users.toLocaleString()} wallet(s)`} />
                  <Stat label="Pocket" value={`${ov.circulation.pocket.toLocaleString()} ${sym}`}
                    hint="Sum of every wallet's spendable balance" />
                  <Stat label="Bank" value={`${ov.circulation.bank.toLocaleString()} ${sym}`}
                    hint="Sum of every wallet's savings" />
                  <Stat label="Average balance" value={`${Math.round(ov.circulation.average).toLocaleString()} ${sym}`}
                    hint="Database mean of pocket + bank" />
                  <Stat label="Median balance" value={`${ov.circulation.median.toLocaleString()} ${sym}`}
                    hint="$percentile 50, not an estimate" />
                  <Stat label="Highest balance" value={`${ov.circulation.highest.toLocaleString()} ${sym}`}
                    hint="Largest single wallet" />
                  <Stat label="Wallets" value={ov.users.toLocaleString()} hint="Distinct canonical users" />
                  <Stat label="Daily active" value={String(ov.dau)} hint="Users transacting in 24h" />
                  <Stat label="Transactions" value={ov.transactions.toLocaleString()} hint="All-time ledger rows" />
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--cc-text-faint)' }}>
                  Circulation is <code>SUM(balance) + SUM(bank)</code> over the canonical economy
                  collection — the same query Discord reads. It is never recomputed on this page.
                </p>
              </div>
            )}
          </Section>
        )}

        {active === 'shop' && (
          <Section title="2 · Shop" subtitle="Inventory, prices, stock and rotation">
            {shop ? (
              <ShopPanel
                items={shop.items}
                sections={shop.sections}
                countsByRarity={shopByRarity}
                currencySymbol={sym}
                guildId={selected.id}
              />
            ) : (
              <EmptyCard title="Shop data unavailable" body="Murabot did not return the catalog."
                onRetry={() => void reload()} />
            )}
            <p style={footNote}>
              Discord: <code>/shop</code> opens a dropdown of 🪙 Coin · 🎣 Fishing · ✨ Special · 🎨 Skin
              shops, then <code>/shop buy|sell item:&lt;name&gt;</code>. Every rarity is purchasable when
              <code> shop_enabled</code> — rarity never gates access.
            </p>
          </Section>
        )}

        {active === 'inventory' && (
          <Section title="3 · Inventory" subtitle="Inspect inventory-related systems">
            <InfoGrid
              items={[
                ['Where items live', 'One inventory document per (guild, user); guarded $inc writes only.'],
                ['Duplicates', 'A non-stackable item already held cannot be bought again.'],
                ['Reservation', 'Copies on an open market listing cannot be sold.'],
                ['Discord', '/inventory view|use · /collection · /items'],
              ]}
            />
            <p style={footNote}>
              Inventory totals per member are in Discord: <code>/inventory view rarity:… category:…</code>.
            </p>
          </Section>
        )}

        {active === 'items' && (
          <Section title="4 · Items" subtitle="The canonical Murabot item catalog">
            <ItemsPanel />
            <p style={footNote}>
              Counts are generated from <code>discord-bot/bot/items.py</code> at build time and the
              parity check fails the build if they drift. Filters query the real catalog — nothing is
              hardcoded here.
            </p>
          </Section>
        )}

        {active === 'market' && (
          <Section title="5 · Market" subtitle="Player-to-player listings">
            <InfoGrid
              items={[
                ['Settlement', 'A listing is claimed atomically, so two buyers cannot both win.'],
                ['Volume', 'Market volume is aggregated from market_buy / market_sell in Economy Health.'],
                ['Escrow', 'Coins are held before items move; expiry sweeps return both.'],
                ['Discord', '/market view|post_for_items|accept|remove'],
              ]}
            />
          </Section>
        )}

        {active === 'work' && (
          <Section title="6 · Jobs / Work" subtitle="Job and work configuration — read-only">
            <InfoGrid
              items={[
                ['Work payout', `${data.config?.workMin ?? 250} – ${data.config?.workMax ?? 800} ${sym} per shift`],
                ['Work cooldown', `${fmtDuration(data.config?.workCooldownSec)}`],
                ['Begin work', `${data.config?.begMin ?? 20} – ${data.config?.begMax ?? 200} ${sym}, ${fmtDuration(data.config?.begCooldownSec)}`],
                ['Job failure rate', `${((data.config?.jobFailRate ?? 0.3) * 100).toFixed(0)}%`],
                ['Per-job cooldowns', Object.keys(data.config?.jobCooldownOverrides ?? {}).length
                  ? Object.keys(data.config?.jobCooldownOverrides ?? {}).join(', ')
                  : 'Using each job’s configured cooldown'],
                ['Disabled jobs', (data.config?.disabledJobs ?? []).length
                  ? (data.config?.disabledJobs ?? []).join(', ')
                  : 'None'],
              ]}
            />
            <p style={footNote}>
              The work system is unchanged by this dashboard. Job salaries, cooldowns, progression and
              requirements live in <code>discord-bot/bot/jobs.py</code> and are balanced around the
              existing work income — the shop is priced against that income, not the reverse.
            </p>
          </Section>
        )}

        {active === 'rewards' && (
          <Section title="7 · Rewards" subtitle="Reward sources, generated from the reward service">
            <InfoGrid
              items={[
                ['Daily', `${data.config?.dailyAmount?.toLocaleString() ?? '250'} ${sym} · ${fmtDuration(86_400)}`],
                ['Weekly', `${data.config?.weeklyAmount?.toLocaleString() ?? '1500'} ${sym} · 7 days`],
                ['Monthly', `${data.config?.monthlyAmount?.toLocaleString() ?? '6000'} ${sym} · 30 days`],
                ['Starting balance', `${data.config?.startBalance?.toLocaleString() ?? '100'} ${sym}`],
                ['All reward sources', 'Every source uses the same server-side reward service.'],
              ]}
            />
            <div className="cc-section-label" style={{ margin: '16px 0 8px' }}>
              Command → item drop table
            </div>
            <RewardsPanel />
            <p style={footNote}>
              Drop chances come from <code>rewards.DEFAULT_DROP_CHANCES</code>, exported at build time.
              No percentage is hardcoded in the dashboard, and the page is read-only for economic values
              unless you are the bot owner.
            </p>
          </Section>
        )}

        {active === 'lottery' && (
          <Section title="8 · Lottery" subtitle="Ticket settings">
            <InfoGrid
              items={[
                ['Ticket price', `${data.config?.lotteryTicketPrice?.toLocaleString() ?? 100} ${sym}`],
                ['Max tickets per round', String(data.config?.lotteryMaxTickets ?? 10)],
                ['Draw', 'Server-side, once per day, from the canonical pool.'],
                ['Idempotency', 'A winning user is recorded once per round; repeats are refused.'],
                ['Discord', '/lottery buy|auto|status'],
              ]}
            />
          </Section>
        )}

        {active === 'achievements' && (
          <Section title="9 · Achievements" subtitle="Milestones and their rewards">
            <InfoGrid
              items={[
                ['Progress', 'Computed live from net worth, streaks, catches, digs and trades.'],
                ['Rewards', 'Issued by the same reward service as every other payout.'],
                ['Mutual exclusion', 'Claimed achievements cannot be claimed twice.'],
                ['Discord', '/achievements · /quests'],
              ]}
            />
          </Section>
        )}

        {active === 'fishing' && (
          <Section title="10 · Fishing" subtitle="Fishing economy">
            <InfoGrid
              items={[
                ['Catches', 'Server-side roll; the catch table is part of the item catalog.'],
                ['Gear', 'Rods and hooks resolve from the canonical catalog, never from input.'],
                ['Sell values', 'Each catch sells for its own catalog sell price.'],
                ['Discord', '/fish · rods and hooks from /shop'],
              ]}
            />
          </Section>
        )}

        {active === 'farm' && (
          <Section title="11 · Farm" subtitle="Farming economy">
            <InfoGrid
              items={[
                ['Plots', 'Per-user plot state with a guarded expansion deed.'],
                ['Harvest', 'Yield rolls server-side from the crop table.'],
                ['Spoilage', 'Crops mature on a server clock, not a client timer.'],
                ['Discord', '/farm'],
              ]}
            />
          </Section>
        )}

        {active === 'pets' && (
          <Section title="12 · Pets" subtitle="Pet economy">
            <InfoGrid
              items={[
                ['Adoption', 'Species resolve from the catalog; names are per-user.'],
                ['Care', 'Cooldown-guarded; a second tick inside the window is refused.'],
                ['Discord', '/pets'],
              ]}
            />
          </Section>
        )}

        {active === 'minigames' && (
          <Section title="13 · Minigames" subtitle="Economy-related games">
            <InfoGrid
              items={[
                ['Crime', `${fmtDuration(data.config?.crimeCooldownSec)} cooldown`],
                ['Rob', `${fmtDuration(data.config?.robCooldownSec)} cooldown · minimum target ${data.config?.robMinTarget?.toLocaleString() ?? 100} ${sym}`],
                ['Max bet', `${data.config?.gambleMax?.toLocaleString() ?? 10000} ${sym}`],
                ['Gambling cooldown', fmtDuration(data.config?.gambleCooldownSec)],
                ['Outcomes', 'Resolved server-side; the client never supplies an outcome.'],
              ]}
            />
            <p style={footNote}>
              Gambling volume is aggregated in <b>Economy Health</b> below.
            </p>
          </Section>
        )}

        {active === 'config' && (
          <Section title="14 · Economy Configuration" subtitle="Allowed settings for your server">
            <EconomyConfigPanel
              config={data.config}
              guildId={selected.id}
              actorId={actorId}
              isOwner={isOwner === true}
              onSaved={reload}
            />
            <div className="cc-section-label" style={{ margin: '18px 0 8px' }}>
              Module settings
            </div>
            <ModuleSettings moduleId="economy" />
          </Section>
        )}

        {/* ── INFORMATION ─────────────────────────────────────────────── */}
        {active === 'statistics' && (
          <Section title="15 · Statistics" subtitle="How the economy is being used">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Stat label="Wallets" value={String(ov?.users ?? 0)} hint="Distinct canonical users" />
              <Stat label="Daily active" value={String(ov?.dau ?? 0)} hint="Transacted in 24h" />
              <Stat label="Ledger rows" value={(ov?.transactions ?? 0).toLocaleString()} hint="All-time transactions" />
              <Stat label="Recent events" value={String(ov?.recent.length ?? 0)} hint="Last 10 ledger entries" />
            </div>
            <p style={footNote}>These describe usage. They change nothing.</p>
          </Section>
        )}

        {active === 'leaderboards' && (
          <Section title="16 · Leaderboards" subtitle="One row per canonical user">
            <LeaderboardPanel rows={data.leaderboard} symbol={sym} />
            <p style={footNote}>
              Each row is keyed by <code>canonicalUserId</code> — the wallet&rsquo;s user id, not a username.
              Two members may share a display name and any name may change, so names are resolved live
              and shown separately; they are never used to group or sort.
            </p>
          </Section>
        )}

        {active === 'logs' && (
          <Section title="17 · Economy Logs" subtitle="Recent audited mutations">
            <LogList rows={ov?.recent ?? []} symbol={sym} />
            <p style={footNote}>
              Every mutation writes a unique transaction ID. The full filterable log is
              <b> Transactions</b> below; Discord shows it with <code>/currencylog</code>.
            </p>
          </Section>
        )}

        {active === 'transactions' && (
          <Section title="18 · Transactions" subtitle="Filter the audit ledger">
            <TransactionsPanel guildId={selected.id} symbol={sym} />
          </Section>
        )}

        {active === 'antiExploit' && (
          <Section title="19 · Anti-Exploit" subtitle="Protections and anomaly findings">
            <AntiExploitPanel audit={data.audit} />
          </Section>
        )}

        {active === 'health' && (
          <Section title="20 · Economy Health" subtitle="Circulation, flow and volume">
            <EconomyHealthPanel health={data.health} symbol={sym} />
            <p style={footNote}>
              Every figure is a database aggregation over the canonical ledger and wallet collections.
              Nothing here is estimated or invented.
            </p>
          </Section>
        )}

        {active === 'status' && (
          <Section title="21 · System Status" subtitle="Where these numbers come from">
            <InfoGrid
              items={[
                ['Data source', 'Murabot economy service → Murabot MongoDB'],
                ['Discord', 'Slash commands read and write the same collections'],
                ['Dashboard', 'Reads through one cached, deduplicated gateway'],
                ['Rate limiting', 'One request per (endpoint, guild) — cached and single-flight'],
                ['Refetch', 'On server switch or manual reload only. No polling loop.'],
              ]}
            />
            <p style={footNote}>
              Architecture: Discord → Murabot Economy Service → Murabot MongoDB ← Murabot Dashboard.
              There is no second economy and no dashboard-side balance calculation.
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}

// ── presentational pieces ──────────────────────────────────────────────

function Section({ title, subtitle, children }: {
  title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="cc-section-label" style={{ marginBottom: 4 }}>{title}</div>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>{subtitle}</p>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="cc-card" style={{ padding: '12px 16px' }}>
      <div className="cc-section-label">{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', marginTop: 2 }}>{value}</div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--cc-text-faint)', marginTop: 3 }}>{hint}</div>
      )}
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      {items.map(([label, value]) => (
        <div key={label} className="cc-card" style={{ padding: '12px 16px' }}>
          <div className="cc-section-label">{label}</div>
          <div style={{ fontSize: 13, color: 'var(--cc-text-dim)', marginTop: 4 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyCard({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <div className="cc-card" style={{ padding: 24, textAlign: 'center' }}>
      <p style={{ margin: 0, color: '#fff', fontWeight: 700 }}>{title}</p>
      <p style={{ margin: '6px 0 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>{body}</p>
      <button className="cc-btn" style={{ marginTop: 10, fontSize: 12 }} onClick={onRetry}>Retry</button>
    </div>
  );
}

function LogList({ rows, symbol }: { rows: Array<{ txId: string; action: string; amount: number; at: string; itemId: string | null; userId: string | null }>; symbol: string }) {
  if (rows.length === 0) {
    return <EmptyCard title="No transactions yet" body="Mutations appear here as members use the economy." onRetry={() => {}} />;
  }
  return (
    <div className="cc-card" style={{ padding: 14 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((t) => (
          <div key={t.txId} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12.5 }}>
            <code style={{ color: 'var(--cc-accent)' }}>{t.action}</code>
            <strong style={{ color: t.amount >= 0 ? '#4ade80' : '#f87171' }}>
              {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString()} {symbol}
            </strong>
            {t.itemId && <span style={{ color: 'var(--cc-text-faint)' }}>{t.itemId}</span>}
            <span style={{ color: 'var(--cc-text-faint)', marginLeft: 'auto' }}>
              {new Date(t.at).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const footNote: React.CSSProperties = {
  margin: '14px 0 0', fontSize: 12, color: 'var(--cc-text-faint)',
};

function fmtDuration(seconds?: number): string {
  if (!seconds || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export { fmtDuration, Section, Stat, InfoGrid, EmptyCard };
export type { ShopItem, TxnRow };
export { SECTIONS };
