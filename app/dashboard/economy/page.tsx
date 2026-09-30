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
// Every figure is read from the canonical Murabot collections (`economy`,
// `economy_tx`, `economy_shop_stock`, `guild_config`) in the same cluster the
// Discord commands read and write. This page performs no economy arithmetic of
// its own, keeps no competing copy of a balance, and — the rule this rewrite
// exists to enforce — never renders a failure as an empty result.

import { useMemo, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { statusMessage } from '../components/selectors';
import ModuleSettings from '../components/ModuleSettings';
import ItemsPanel from '../components/ItemsPanel';
import RewardsPanel from '../components/RewardsPanel';
import {
  sectionOutcome,
  useEconomyData,
  type BotPresenceSnapshot,
  type OwnerDiagnostics,
  type RecentRow,
  type SectionOutcome,
  type ShopItem,
  type TxnRow,
} from './useEconomyData';
import ShopPanel from './ShopPanel';
import LeaderboardPanel from './LeaderboardPanel';
import TransactionsPanel from './TransactionsPanel';
import EconomyHealthPanel from './EconomyHealthPanel';
import AntiExploitPanel from './AntiExploitPanel';
import { EconomyConfigPanel } from './EconomyConfigPanel';
import { EconomyFeatureCards, EconomyInformationNav, SECTIONS, type SectionId } from './sections';

export default function EconomyPage() {
  const { token, selected } = useGuild();
  const { data, loading, error, code, reload, isOwner } = useEconomyData();
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
  const outcome = (name: string): SectionOutcome => sectionOutcome(data, name, loading);

  return (
    <div style={{ maxWidth: 1080 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
        MURAGOODS
      </p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>
        💰 Economy — {selected.name}
      </h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        Read live from the same Murabot database the Discord commands use — never a parallel
        economy. Features first, information below.
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
            <Gate outcome={outcome('overview')} onRetry={() => void reload()} loadingText="Loading economy…">
              {ov ? (
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
              ) : null}
            </Gate>
          </Section>
        )}

        {active === 'shop' && (
          <Section title="2 · Shop" subtitle="Inventory, prices, stock and rotation">
            <Gate
              outcome={outcome('shop')}
              onRetry={() => void reload()}
              loadingText="Loading the catalog…"
              emptyTitle="No shop items"
              emptyBody="Every catalog item is disabled for sale. Enable an item in the bot catalog to list it."
            >
              {shop ? (
                <ShopPanel
                  items={shop.items}
                  sections={shop.sections}
                  countsByRarity={shopByRarity}
                  currencySymbol={sym}
                  guildId={selected.id}
                />
              ) : null}
            </Gate>
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
            <Gate outcome={outcome('config')} onRetry={() => void reload()} loadingText="Loading configuration…">
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
            </Gate>
            <p style={footNote}>
              The work system is unchanged by this dashboard. Job salaries, cooldowns, progression and
              requirements live in <code>discord-bot/bot/jobs.py</code> and are balanced around the
              existing work income — the shop is priced against that income, not the reverse.
            </p>
          </Section>
        )}

        {active === 'rewards' && (
          <Section title="7 · Rewards" subtitle="Reward sources, generated from the reward service">
            <Gate outcome={outcome('config')} onRetry={() => void reload()} loadingText="Loading configuration…">
              <InfoGrid
                items={[
                  ['Daily', `${data.config?.dailyAmount?.toLocaleString() ?? '250'} ${sym} · ${fmtDuration(86_400)}`],
                  ['Weekly', `${data.config?.weeklyAmount?.toLocaleString() ?? '1500'} ${sym} · 7 days`],
                  ['Monthly', `${data.config?.monthlyAmount?.toLocaleString() ?? '6000'} ${sym} · 30 days`],
                  ['Starting balance', `${data.config?.startBalance?.toLocaleString() ?? '100'} ${sym}`],
                  ['All reward sources', 'Every source uses the same server-side reward service.'],
                ]}
              />
            </Gate>
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
            <Gate outcome={outcome('config')} onRetry={() => void reload()} loadingText="Loading configuration…">
              <InfoGrid
                items={[
                  ['Ticket price', `${data.config?.lotteryTicketPrice?.toLocaleString() ?? 100} ${sym}`],
                  ['Max tickets per round', String(data.config?.lotteryMaxTickets ?? 10)],
                  ['Draw', 'Server-side, once per day, from the canonical pool.'],
                  ['Idempotency', 'A winning user is recorded once per round; repeats are refused.'],
                  ['Discord', '/lottery buy|auto|status'],
                ]}
              />
            </Gate>
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
            <Gate outcome={outcome('config')} onRetry={() => void reload()} loadingText="Loading configuration…">
              <InfoGrid
                items={[
                  ['Crime', `${fmtDuration(data.config?.crimeCooldownSec)} cooldown`],
                  ['Rob', `${fmtDuration(data.config?.robCooldownSec)} cooldown · minimum target ${data.config?.robMinTarget?.toLocaleString() ?? 100} ${sym}`],
                  ['Max bet', `${data.config?.gambleMax?.toLocaleString() ?? 10000} ${sym}`],
                  ['Gambling cooldown', fmtDuration(data.config?.gambleCooldownSec)],
                  ['Outcomes', 'Resolved server-side; the client never supplies an outcome.'],
                ]}
              />
            </Gate>
            <p style={footNote}>Gambling volume is aggregated in <b>Economy Health</b> below.</p>
          </Section>
        )}

        {active === 'config' && (
          <Section title="14 · Economy Configuration" subtitle="Allowed settings for your server">
            {/* A server that has never saved a section is not broken: Murabot's
                defaults are in force, and saying so is different from saying
                "no configuration exists" when the read actually failed. */}
            {data.configState === 'not_initialized' && (
              <div className="cc-card" style={{ padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                This server has no saved economy section yet — Murabot&rsquo;s built-in defaults are
                in force. The values below are those defaults; saving writes them to the bot&rsquo;s
                configuration.
              </div>
            )}
            {!data.ownerConfigured && (
              <div className="cc-alert cc-alert-error" style={{ marginBottom: 12 }} role="alert">
                <strong>⚠️ Murabot owner not configured</strong>
                <div style={{ marginTop: 4 }}>
                  This deployment has no <code>MURABOT_OWNER_DISCORD_ID</code>, so nobody can change
                  owner-only economic values. It must be set to the owner&rsquo;s Discord user ID —
                  not their username — by whoever runs the site.
                </div>
              </div>
            )}
            {data.ownerConfigured && !isOwner && (
              <div className="cc-card" style={{ padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                You are signed in as a Discord account that is not the Murabot owner, so the
                values below are read-only. Being this server&rsquo;s owner or an admin does not
                unlock them — the Murabot owner can, and does not need to administer this server.
              </div>
            )}
            <EconomyConfigPanel
              config={data.config}
              guildId={selected.id}
              isOwner={isOwner === true}
              onSaved={() => void reload()}
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
            <Gate outcome={outcome('overview')} onRetry={() => void reload()} loadingText="Loading statistics…">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <Stat label="Wallets" value={String(ov?.users ?? 0)} hint="Distinct canonical users" />
                <Stat label="Daily active" value={String(ov?.dau ?? 0)} hint="Transacted in 24h" />
                <Stat label="Ledger rows" value={(ov?.transactions ?? 0).toLocaleString()} hint="All-time transactions" />
                <Stat label="Recent events" value={String(ov?.recent.length ?? 0)} hint="Last 10 ledger entries" />
              </div>
              <p style={footNote}>These describe usage. They change nothing.</p>
            </Gate>
          </Section>
        )}

        {active === 'leaderboards' && (
          <Section title="16 · Leaderboards" subtitle="One row per canonical user">
            <Gate
              outcome={outcome('leaderboard')}
              onRetry={() => void reload()}
              loadingText="Loading the leaderboard…"
              emptyTitle="No wallets yet"
              emptyBody="Balances appear as members use the economy in Discord."
            >
              <LeaderboardPanel rows={data.leaderboard} symbol={sym} />
            </Gate>
            <p style={footNote}>
              Each row is keyed by <code>canonicalUserId</code> — the wallet&rsquo;s user id, not a
              username. Two members may share a display name and any name may change, so names are
              resolved live from this server and shown separately; they are never used to group, merge
              or sort. A member who cannot be resolved is shown as <b>Unknown User</b> with their id
              intact, never as someone else&rsquo;s name.
            </p>
          </Section>
        )}

        {active === 'logs' && (
          <Section title="17 · Economy Logs" subtitle="Recent audited mutations">
            <Gate
              outcome={outcome('logs')}
              onRetry={() => void reload()}
              loadingText="Loading the ledger…"
              emptyTitle="No transactions yet"
              emptyBody="This server's ledger is genuinely empty — mutations appear here as members use the economy."
            >
              <LogList rows={data.logs} symbol={sym} />
            </Gate>
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
            <Gate outcome={outcome('audit')} onRetry={() => void reload()} loadingText="Running the scan…">
              <AntiExploitPanel audit={data.audit} />
            </Gate>
          </Section>
        )}

        {active === 'health' && (
          <Section title="20 · Economy Health" subtitle="Circulation, flow and volume">
            <Gate outcome={outcome('health')} onRetry={() => void reload()} loadingText="Aggregating…">
              <EconomyHealthPanel health={data.health} symbol={sym} />
            </Gate>
            <p style={footNote}>
              Every figure is a database aggregation over the canonical ledger and wallet collections.
              Nothing here is estimated or invented.
            </p>
          </Section>
        )}

        {active === 'status' && (
          <Section title="21 · System Status" subtitle="Where these numbers come from">
            <DiagnosticsPanel
              diagnostics={data.diagnostics}
              sections={data.sections}
              guildId={selected.id}
              databaseAvailable={data.databaseAvailable}
              bot={data.bot}
              isOwner={isOwner === true}
              ownerConfigured={data.ownerConfigured}
              owner={data.owner}
            />
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

/**
 * The four states a section can be in, rendered so they can never be confused:
 *
 *   loading → a message, not a zero
 *   data    → the real thing
 *   empty   → the backend confirmed there is nothing
 *   error   → what failed, its category, and a Retry that re-reads
 */
function Gate({ outcome, onRetry, loadingText, emptyTitle, emptyBody, children }: {
  outcome: SectionOutcome;
  onRetry: () => void;
  loadingText: string;
  emptyTitle?: string;
  emptyBody?: string;
  children: React.ReactNode;
}) {
  if (outcome.kind === 'loading') {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 13, margin: 0 }}>{loadingText}</p>;
  }
  if (outcome.kind === 'error') {
    return (
      <div className="cc-card" style={{ padding: 20, textAlign: 'center' }} role="alert">
        <p style={{ margin: 0, color: '#f87171', fontWeight: 700 }}>Could not load this data</p>
        <p style={{ margin: '6px 0 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>
          {outcome.error.message}
        </p>
        <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
          Reason: <code>{outcome.error.code}</code>
          {outcome.error.retryable ? '' : ' — this will not change on its own.'}
        </div>
        <button className="cc-btn" style={{ marginTop: 10, fontSize: 12 }} onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (outcome.kind === 'empty') {
    return (
      <div className="cc-card" style={{ padding: 20, textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>
          {emptyTitle ?? 'Nothing here yet'}
        </p>
        {emptyBody && (
          <p style={{ margin: '5px 0 0', color: 'var(--cc-text-faint)', fontSize: 12.5 }}>{emptyBody}</p>
        )}
        <button className="cc-btn" style={{ marginTop: 10, fontSize: 12 }} onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  return <>{children}</>;
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

function InfoGrid({ items }: { items: Array<[string, React.ReactNode]> }) {
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

/**
 * Where the numbers came from, for this exact request.
 *
 * Everything here is credential-free by construction: a database NAME, a
 * variable NAME, a state, a duration and a row count. No URI, no token, no
 * cookie, no session value.
 */
function DiagnosticsPanel({ diagnostics, sections, guildId, databaseAvailable, bot, isOwner, ownerConfigured, owner }: {
  diagnostics: EconomyDiagnostics | null;
  sections: Record<string, { state: string; ms: number; records: number | null }>;
  guildId: string;
  databaseAvailable: boolean;
  bot: BotPresenceSnapshot | null;
  isOwner: boolean;
  ownerConfigured: boolean;
  owner: OwnerDiagnostics | null;
}) {
  const db = diagnostics?.database;
  const botState = !bot
    ? 'not checked'
    : bot.error
      ? `${bot.error.code}`
      : !bot.online
        ? 'OFFLINE'
        : !bot.installed
          ? 'ONLINE · not in this server'
          : `ONLINE${bot.gatewayState ? ` (${bot.gatewayState})` : ''}`;
  return (
    <>
      <InfoGrid
        items={[
          ['Data source', 'Murabot MongoDB → economy, economy_tx, economy_shop_stock, guild_config'],
          ['Selected server', <code key="g">{guildId}</code>],
          ['Database', db ? `${db.name} (${db.state})` : 'not probed'],
          ['Configured from', db?.uriSource ? <code key="v">{db.uriSource}</code> : '—'],
          ['Database reachable', databaseAvailable ? 'Yes' : 'No — every section below is unavailable'],
          ['Murabot', botState],
          ['Murabot identity', bot?.botUsername
            ? `${bot.botUsername}${bot.botUserId ? ` (…${bot.botUserId.slice(-4)})` : ''}`
            : 'unknown'],
          ['Owner-only values', !ownerConfigured
            ? 'Unavailable — the deployment has no Murabot owner id configured'
            : isOwner
              ? 'Unlocked for this account'
              : 'Locked — economic values can only be changed by the Murabot owner'],
          // Masked by the server: enough to confirm the ids match or that the
          // wrong Discord account is signed in, without publishing the owner's
          // full user id to every browser that opens this page.
          ['Authenticated Discord ID', <code key="a">{owner?.authenticatedDiscordUserId ?? '—'}</code>],
          ['Configured Owner ID', <code key="c">{owner?.configuredOwnerId ?? 'not configured'}</code>],
          ['Owner Match', owner ? (owner.isOwner ? 'TRUE' : 'FALSE') : '—'],
          ['Request', <code key="r">{diagnostics?.requestId ?? '—'}</code>],
          ['Server cache', diagnostics?.cache ?? '—'],
          ['Reads per page load', 'One — this page requests the whole snapshot in a single call'],
        ]}
      />
      {bot?.error && (
        <div className="cc-alert cc-alert-error" style={{ margin: '12px 0 0' }} role="alert">
          <strong>⚠️ Murabot check: {bot.error.code}</strong>
          <div style={{ marginTop: 4 }}>{bot.error.message}</div>
        </div>
      )}
      <div className="cc-section-label" style={{ margin: '16px 0 8px' }}>
        Sections in this request
      </div>
      <div className="cc-card" style={{ padding: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Section</th>
              <th style={{ ...th, textAlign: 'left' }}>State</th>
              <th style={{ ...th, textAlign: 'right' }}>Records</th>
              <th style={{ ...th, textAlign: 'right' }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(sections).map(([name, s]) => (
              <tr key={name} style={{ borderTop: '1px solid var(--cc-border, #1e1e2a)' }}>
                <td style={td}>{name}</td>
                <td style={{ ...td, color: s.state === 'error' ? '#f87171' : s.state === 'empty' ? 'var(--cc-text-faint)' : '#4ade80' }}>
                  {s.state}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{s.records == null ? '—' : s.records.toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'right' }}>{s.ms}ms</td>
              </tr>
            ))}
            {Object.keys(sections).length === 0 && (
              <tr>
                <td style={{ ...td, color: 'var(--cc-text-faint)' }} colSpan={4}>
                  No section was read — the request did not reach the economy database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={footNote}>
        Architecture: Discord → Murabot Economy Service → Murabot MongoDB ← this dashboard. There is
        no second economy and no dashboard-side balance calculation. Every figure above is an
        aggregation over the collections the slash commands read and write.
      </p>
    </>
  );
}

type EconomyDiagnostics = {
  requestId?: string;
  guildId?: string;
  database?: { name: string; uriSource: string | null; state: string; responseTimeMs: number };
  sections?: Array<{ section: string; state: string; ms: number; records: number | null }>;
  cache?: string;
  errorCategory?: string | null;
};

const th: React.CSSProperties = {
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6,
  color: 'var(--cc-text-faint)', fontWeight: 700, padding: '4px 6px',
};
const td: React.CSSProperties = { padding: '5px 6px', fontSize: 12.5, color: 'var(--cc-text-dim)' };

function LogList({ rows, symbol }: { rows: Array<RecentRow & { displayName?: string }>; symbol: string }) {
  return (
    <div className="cc-card" style={{ padding: 14 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((t, i) => (
          <div
            key={t.txId ?? `${t.at}-${i}`}
            style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12.5 }}
          >
            <code style={{ color: 'var(--cc-accent)' }}>{t.action ?? 'unknown'}</code>
            <strong style={{ color: t.amount >= 0 ? '#4ade80' : '#f87171' }}>
              {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString()} {symbol}
            </strong>
            <span style={{ color: 'var(--cc-text-dim)' }}>{t.displayName ?? 'Unknown User'}</span>
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

export { fmtDuration, Section, Stat, InfoGrid, Gate };
export type { ShopItem, TxnRow };
export { SECTIONS };
