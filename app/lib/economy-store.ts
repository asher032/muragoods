// ── The Murabot economy read model ──────────────────────────────────────
//
// ONE source of truth: the `murabot` cluster, database `murastream_bot`, and
// the collections the Discord commands actually read and write:
//
//   economy             one wallet per (guildId, userId)
//   economy_tx          the audit ledger — every mutation, one row per txId
//   economy_shop_stock  per-window limited stock
//   guild_config        the guild's `economy` section
//
// This module used to be an HTTP bridge to the bot process. That was the
// single reason the Economy page could show a feature list with no data: every
// figure depended on one more process being awake, warm and reachable, and
// when it was not, the failure was rendered as "No transactions yet" — an empty
// database, which is a lie. The dashboard is already a declared client of this
// cluster (it reads `guild_config` here through the same pooled client), so
// reading the economy from the same place is not a second economy. It is the
// same economy, reached without a hop.
//
// Every pipeline below is a port of the corresponding function in
// `discord-bot/bot/economy.py`, in the same order and with the same
// `$ifNull` normalization, so the dashboard and `/balance` cannot disagree.
// `scripts/check-economy-store-parity.mjs` fails the build if the two sides
// drift on collection names, key names, filter shapes or the ledger type
// lists — the two are not allowed to quietly diverge.
//
// Nothing here writes. The dashboard reads the economy; only the bot (and the
// owner's explicit save) may change a balance.
//
// The one thing the site still asks the bot process for is "is this account
// the Murabot owner" (`app/lib/economy-owner.ts`), because the bot owns that
// list. Everything numeric is read here, so no figure on this page depends on
// a second process being awake — the failure mode that produced a page of
// empty panels.

import { clusterDb, clusterDbName, clusterUriSource, withDatabase } from '@/app/lib/db/clusters';
import table from '@/app/lib/items-table.json';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Doc = Record<string, any>;
type Db = import('mongodb').Db;

/** The collections this module reads. Named once so diagnostics can report them. */
export const ECONOMY_COLLECTIONS = {
  wallets: 'economy',
  ledger: 'economy_tx',
  stock: 'economy_shop_stock',
  config: 'guild_config',
} as const;

/**
 * Ledger types that move currency OUT of a wallet. Mirrors
 * `economy._DESTROYING_TYPES`; the parity check compares the two.
 */
export const DESTROYING_TYPES: readonly string[] = [
  'shop_buy', 'shop_buy_refund', 'market_buy', 'gamble_lose', 'crime_lose', 'rob_lose',
];

/** Reward/claim ledger types counted as rewards paid out. Mirrors `_REWARD_TYPES`. */
export const REWARD_TYPES: readonly string[] = [
  'daily', 'weekly', 'monthly', 'quest', 'achievement', 'activity',
  'beg', 'dig', 'fish', 'farm', 'job', 'work', 'lottery',
];

/** Ledger types counted as gambling volume. Mirrors `_GAMBLE_TYPES`. */
export const GAMBLE_TYPES: readonly string[] = [
  'gamble_win', 'gamble_lose', 'crime_win', 'crime_lose', 'rob_win', 'rob_lose', 'lottery',
];

/** Filter chips for the transactions panel. Mirrors `economy.TRANSACTION_ACTIONS`. */
export const TRANSACTION_ACTIONS: readonly string[] = [
  'all', 'daily', 'weekly', 'monthly', 'quest', 'achievement', 'activity',
  'job', 'work', 'beg', 'shop_buy', 'shop_sell', 'market_buy', 'market_sell',
  'gamble_win', 'gamble_lose', 'crime_win', 'crime_lose', 'rob_win',
  'rob_lose', 'lottery', 'transfer_in', 'transfer_out', 'bank_deposit_out',
  'bank_withdraw_out', 'admin',
];

/**
 * Guild filter.
 *
 * The bot writes `guildId` as an integer (`economy._gid`). Some rows written by
 * older tooling or by hand hold the string form, and a strict integer match
 * hides those wallets entirely — which is how a page can show a top holder who
 * is missing from circulation. Both forms are matched; a document has exactly
 * one value for the key, so this can never double-count.
 */
function guildFilter(guildId: string): Doc {
  const gid = Number(guildId);
  return Number.isFinite(gid) ? { guildId: { $in: [gid, String(guildId)] } } : { guildId: String(guildId) };
}

/** Normalize the two wallet fields before ANY arithmetic, exactly as the bot does. */
const NORMALIZE_WALLET: Doc = {
  $addFields: {
    balance: { $ifNull: ['$balance', 0] },
    bank: { $ifNull: ['$bank', 0] },
    gems: { $ifNull: ['$gems', 0] },
  },
};

const int = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const iso = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toISOString?: unknown }).toISOString === 'function') {
    return String((value as Date).toISOString());
  }
  return String(value ?? '');
};

// ── Wallet aggregates ──────────────────────────────────────────────────

export interface WalletStats {
  wallets: number; pocket: number; bank: number; net: number;
  avg: number; max: number; min: number; median: number; topShare: number;
}

/** Port of `economy._wallet_stats` + `economy._median_net`. */
export async function walletStats(db: Db, guildId: string): Promise<WalletStats> {
  const wallets = db.collection(ECONOMY_COLLECTIONS.wallets);
  const rows = await wallets.aggregate([
    { $match: guildFilter(guildId) },
    { $addFields: { balance: { $ifNull: ['$balance', 0] }, bank: { $ifNull: ['$bank', 0] } } },
    { $addFields: { _net: { $add: ['$balance', '$bank'] } } },
    {
      $group: {
        _id: null,
        wallets: { $sum: 1 },
        pocket: { $sum: '$balance' },
        bank: { $sum: '$bank' },
        net: { $sum: '$_net' },
        avg: { $avg: '$_net' },
        max: { $max: '$_net' },
        min: { $min: '$_net' },
      },
    },
  ]).toArray();

  if (!rows.length) {
    return { wallets: 0, pocket: 0, bank: 0, net: 0, avg: 0, max: 0, min: 0, median: 0, topShare: 0 };
  }
  const row = rows[0] as Doc;
  const net = int(row.net);
  const max = int(row.max);
  return {
    wallets: int(row.wallets),
    pocket: int(row.pocket),
    bank: int(row.bank),
    net,
    avg: Math.round(Number(row.avg ?? 0) * 100) / 100,
    max,
    min: int(row.min),
    median: await medianNet(db, guildId),
    topShare: net ? Math.round((max / net) * 10000) / 100 : 0,
  };
}

/** Port of `economy._median_net`. Returns 0 on a server without `$percentile`. */
async function medianNet(db: Db, guildId: string): Promise<number> {
  try {
    const rows = await db.collection(ECONOMY_COLLECTIONS.wallets).aggregate([
      { $match: guildFilter(guildId) },
      { $addFields: { balance: { $ifNull: ['$balance', 0] }, bank: { $ifNull: ['$bank', 0] } } },
      { $addFields: { _net: { $add: ['$balance', '$bank'] } } },
      { $group: { _id: null, median: { $percentile: { input: '$_net', p: [0.5], method: 'approximate' } } } },
    ]).toArray();
    const value = (rows[0] as Doc | undefined)?.median;
    return Array.isArray(value) ? int(value[0]) : int(value);
  } catch {
    return 0;
  }
}

export interface TopWalletRow {
  canonicalUserId: string; userId: string; guildId: string;
  balance: number; bank: number; total: number; displayName?: string;
}

/** Port of `economy.top_wallets`. Identity is the wallet's userId, never a name. */
export async function topWallets(
  db: Db, guildId: string, by: 'net' | 'balance' | 'gems' = 'net', limit = 10, skip = 0,
): Promise<TopWalletRow[]> {
  const capped = Math.max(1, Math.min(limit, 25));
  const pipeline: Doc[] = [{ $match: guildFilter(guildId) }, NORMALIZE_WALLET];
  if (by === 'gems') pipeline.push({ $sort: { gems: -1, userId: 1 } });
  else if (by === 'balance') pipeline.push({ $sort: { balance: -1, userId: 1 } });
  else {
    pipeline.push({ $addFields: { _net: { $add: ['$balance', '$bank'] } } });
    pipeline.push({ $sort: { _net: -1, userId: 1 } });
  }
  pipeline.push({ $skip: Math.max(0, skip) }, { $limit: capped });
  pipeline.push({ $project: { _id: 0, userId: 1, guildId: 1, balance: 1, bank: 1, gems: 1 } });

  const rows: Doc[] = await db.collection(ECONOMY_COLLECTIONS.wallets).aggregate(pipeline).toArray();
  return rows.map((r) => {
    const doc = r as Doc;
    return {
      canonicalUserId: String(doc.userId ?? ''),
      userId: String(doc.userId ?? ''),
      guildId: String(doc.guildId ?? guildId),
      balance: int(doc.balance),
      bank: int(doc.bank),
      total: int(doc.balance) + int(doc.bank),
    };
  });
}

// ── Overview ───────────────────────────────────────────────────────────

export interface RecentTx {
  txId: string | null; userId: string | null; action: string | null;
  amount: number; itemId: string | null; source: string | null; at: string;
}

export interface EconomyOverview {
  users: number;
  circulation: { pocket: number; bank: number; total: number; average: number; median: number; highest: number };
  dau: number;
  transactions: number;
  top: TopWalletRow[];
  recent: RecentTx[];
}

/** Port of `economy.economy_overview`. Every number is a real aggregation. */
export async function economyOverview(db: Db, guildId: string): Promise<EconomyOverview> {
  const ledger = db.collection(ECONOMY_COLLECTIONS.ledger);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [stats, dau, transactions, top, recent] = await Promise.all([
    walletStats(db, guildId),
    ledger.distinct('userId', { ...guildFilter(guildId), createdAt: { $gte: dayAgo } }),
    ledger.countDocuments(guildFilter(guildId)),
    topWallets(db, guildId, 'net', 5),
    ledger.find(guildFilter(guildId)).sort({ createdAt: -1 }).limit(10).toArray(),
  ]);
  return {
    users: stats.wallets,
    circulation: {
      pocket: stats.pocket,
      bank: stats.bank,
      total: stats.net,
      average: stats.avg,
      median: stats.median,
      highest: stats.max,
    },
    dau: dau.length,
    transactions,
    top,
    recent: (recent as Doc[]).map((t) => ({
      txId: t.txId == null ? null : String(t.txId),
      userId: t.userId == null ? null : String(t.userId),
      action: t.type == null ? null : String(t.type),
      amount: int(t.amount),
      itemId: t.itemId == null ? null : String(t.itemId),
      source: t.source == null ? null : String(t.source),
      at: iso(t.createdAt),
    })),
  };
}

// ── Health ─────────────────────────────────────────────────────────────

export interface EconomyHealth {
  windowHours: number; circulation: number; pocket: number; bank: number;
  createdToday: number; removedToday: number; netChangeToday: number;
  avgBalance: number; medianBalance: number; highestBalance: number;
  wallets: number; topSharePct: number; shopSpending: number; marketVolume: number;
  rewardPayouts: number; gamblingVolume: number; workIncome: number;
}

/** Port of `economy.economy_health`. */
export async function economyHealth(db: Db, guildId: string): Promise<EconomyHealth> {
  const ledger = db.collection(ECONOMY_COLLECTIONS.ledger);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const match = { ...guildFilter(guildId), createdAt: { $gte: since } };

  const flowRows = await ledger.aggregate([
    { $match: match },
    {
      $addFields: {
        amt: { $ifNull: ['$amount', 0] },
        sign: { $cond: [{ $in: ['$type', [...DESTROYING_TYPES]] }, -1, 1] },
      },
    },
    {
      $group: {
        _id: null,
        created: { $sum: { $cond: [{ $gt: ['$sign', 0] }, { $max: [0, '$amt'] }, 0] } },
        removed: { $sum: { $cond: [{ $lt: ['$sign', 0] }, { $abs: '$amt' }, 0] } },
      },
    },
  ]).toArray();

  const flow = (flowRows[0] ?? {}) as Doc;
  const volume = async (type: string | string[]): Promise<number> => {
    const rows = await ledger.aggregate([
      { $match: { ...match, type } },
      { $group: { _id: null, v: { $sum: { $abs: { $ifNull: ['$amount', 0] } } } } },
    ]).toArray();
    return int((rows[0] as Doc | undefined)?.v);
  };
  const sumOf = async (types: readonly string[]): Promise<number> => {
    const rows = await ledger.aggregate([
      { $match: { ...match, type: { $in: [...types] } } },
      { $group: { _id: null, v: { $sum: { $abs: { $ifNull: ['$amount', 0] } } } } },
    ]).toArray();
    return int((rows[0] as Doc | undefined)?.v);
  };
  const payouts = async (): Promise<number> => {
    const rows = await ledger.aggregate([
      { $match: { ...match, type: { $in: [...REWARD_TYPES] }, amount: { $gt: 0 } } },
      { $group: { _id: null, v: { $sum: '$amount' } } },
    ]).toArray();
    return int((rows[0] as Doc | undefined)?.v);
  };

  const [stats, shopSpending, marketBuy, marketSell, rewardPayouts, gamblingVolume, workIncome] =
    await Promise.all([
      walletStats(db, guildId),
      volume('shop_buy'),
      volume('market_buy'),
      volume('market_sell'),
      payouts(),
      sumOf(GAMBLE_TYPES),
      Promise.all([volume('job'), volume('work'), volume('activity')]).then((v) => v.reduce((a, b) => a + b, 0)),
    ]);

  return {
    windowHours: 24,
    circulation: stats.net,
    pocket: stats.pocket,
    bank: stats.bank,
    createdToday: int(flow.created),
    removedToday: int(flow.removed),
    netChangeToday: int(flow.created) - int(flow.removed),
    avgBalance: stats.avg,
    medianBalance: stats.median,
    highestBalance: stats.max,
    wallets: stats.wallets,
    topSharePct: stats.topShare,
    shopSpending,
    marketVolume: marketBuy + marketSell,
    rewardPayouts,
    gamblingVolume,
    workIncome,
  };
}

// ── Transactions ───────────────────────────────────────────────────────

export interface TxnRow {
  txId: string | null; userId: string | null; guildId: string | null;
  action: string | null; amount: number; currency: string | null;
  itemId: string | null; source: string; result: string; at: string;
  metadata: Record<string, unknown>;
}

export interface TxnPage {
  total: number; limit: number; skip: number; actions: readonly string[]; rows: TxnRow[];
}

export interface TxnFilter {
  userId?: string; action?: string; hours?: number; direction?: string;
  itemId?: string; txId?: string; limit?: number; skip?: number;
}

/** Port of `economy.economy_transactions`. Filters compose server-side. */
export async function economyTransactions(db: Db, guildId: string, filter: TxnFilter = {}): Promise<TxnPage> {
  const ledger = db.collection(ECONOMY_COLLECTIONS.ledger);
  const match: Doc = { ...guildFilter(guildId) };
  const hours = Number(filter.hours ?? 168);
  if (hours > 0) {
    match.createdAt = { $gte: new Date(Date.now() - Math.min(hours, 24 * 90) * 60 * 60 * 1000) };
  }
  if (filter.userId) {
    const uid = Number(filter.userId);
    match.userId = Number.isFinite(uid) && filter.userId.trim() !== '' ? { $in: [uid, filter.userId.trim()] } : filter.userId.trim();
  }
  if (filter.action && filter.action !== 'all') match.type = filter.action;
  if (filter.direction === 'positive') match.amount = { $gt: 0 };
  else if (filter.direction === 'negative') match.amount = { $lt: 0 };
  if (filter.itemId) match.itemId = filter.itemId;
  if (filter.txId) match.txId = filter.txId;

  const limit = Math.max(1, Math.min(Number(filter.limit ?? 50), 200));
  const skip = Math.max(0, Number(filter.skip ?? 0));
  const [total, rows] = await Promise.all([
    ledger.countDocuments(match),
    ledger.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
  ]);
  return {
    total,
    limit,
    skip,
    actions: TRANSACTION_ACTIONS,
    rows: (rows as Doc[]).map((t) => ({
      txId: t.txId == null ? null : String(t.txId),
      userId: t.userId == null ? null : String(t.userId),
      guildId: t.guildId == null ? null : String(t.guildId),
      action: t.type == null ? null : String(t.type),
      amount: int(t.amount),
      currency: null,
      itemId: t.itemId == null ? null : String(t.itemId),
      source: t.source ? String(t.source) : 'discord',
      result: 'applied',
      at: iso(t.createdAt),
      metadata: t.metadata && typeof t.metadata === 'object' ? (t.metadata as Record<string, unknown>) : {},
    })),
  };
}

// ── Anti-exploit audit ─────────────────────────────────────────────────

export interface AuditFinding {
  code: string; severity: string; itemId?: string; txId?: string; count?: number; detail: string;
}

export interface AuditReport {
  checkedAt: string; peakSinglePayout: number; wallet_audit: string;
  findings: AuditFinding[]; findingCount: number; protections: string[];
}

/** Port of `economy.anti_exploit_audit`. Detection only — it never writes. */
export async function antiExploitAudit(db: Db, guildId: string, limit = 50): Promise<AuditReport> {
  const findings: AuditFinding[] = [];
  const now = new Date().toISOString();

  // 1. Buy/sell arbitrage in the canonical catalog.
  for (const item of table.items as Array<Record<string, unknown>>) {
    const buy = Number(item.buyPrice ?? 0);
    const sell = Number(item.sellPrice ?? 0);
    if (buy > 0 && sell >= buy) {
      findings.push({
        code: 'BUY_SELL_ARBITRAGE', severity: 'critical', itemId: String(item.id),
        detail: `${item.name} sells for ${sell.toLocaleString()} at or above its ${buy.toLocaleString()} buy price.`,
      });
    }
  }

  const ledger = db.collection(ECONOMY_COLLECTIONS.ledger);
  const wallets = db.collection(ECONOMY_COLLECTIONS.wallets);

  // 2. Negative balances cannot be produced by the guarded write.
  const negative = await wallets.countDocuments({
    ...guildFilter(guildId), $or: [{ balance: { $lt: 0 } }, { bank: { $lt: 0 } }],
  });
  if (negative) {
    findings.push({
      code: 'NEGATIVE_BALANCE', severity: 'critical', count: negative,
      detail: `${negative} wallet(s) hold a negative balance.`,
    });
  }

  // 3. The same reward key granted twice.
  const dupes = await ledger.aggregate([
    { $match: { ...guildFilter(guildId), type: { $in: ['daily', 'weekly', 'monthly'] } } },
    { $match: { 'metadata.rewardKey': { $exists: true, $ne: null } } },
    { $group: { _id: '$metadata.rewardKey', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 20 },
  ]).toArray();
  for (const d of dupes as Doc[]) {
    findings.push({
      code: 'DUPLICATE_REWARD', severity: 'high', count: int(d.n),
      detail: `Reward key ${d._id} was granted ${int(d.n)} times.`,
    });
  }

  // 4. Peak single payout, the ceiling the rest of the audit is read against.
  const peakRows = await ledger.aggregate([
    { $match: { ...guildFilter(guildId), amount: { $gt: 0 } } },
    { $group: { _id: null, max: { $max: '$amount' } } },
  ]).toArray();

  // 5. An item removal with a non-negative amount means the guard was bypassed.
  const itemRemovals = await ledger.aggregate([
    { $match: { ...guildFilter(guildId), type: 'item_remove', amount: { $gte: 0 } } },
    { $limit: 20 },
  ]).toArray();
  for (const d of itemRemovals as Doc[]) {
    findings.push({
      code: 'POSITIVE_ITEM_REMOVAL', severity: 'high', txId: d.txId == null ? undefined : String(d.txId),
      detail: `Item removal recorded a non-negative amount (${int(d.amount)}).`,
    });
  }

  return {
    checkedAt: now,
    peakSinglePayout: int((peakRows[0] as Doc | undefined)?.max),
    wallet_audit: 'read-only',
    findings: findings.slice(0, limit),
    findingCount: findings.length,
    protections: [
      'Atomic guarded balance updates (a debit that would go negative matches no document)',
      'Unique transaction IDs on every ledger row',
      'Idempotent reward claims keyed per user + period',
      'Server-side reward math — clients never send an amount',
      'Trade locks with expiry sweep',
      'Atomic stock claim before payment, refunded on failure',
      'Catalog-resolved prices; buy/sell arbitrage blocked at the catalog',
    ],
  };
}

// ── Shop ───────────────────────────────────────────────────────────────

/** Mirrors `shop.SECTIONS` in the bot: id → label, rotation hours, blurb. */
export const SHOP_SECTIONS = [
  { id: 'coin', label: '🪙 Coin Shop', hours: 4, blurb: 'Everyday campus supplies, food, buffs and equipment.' },
  { id: 'fishing', label: '🎣 Fishing Shop', hours: 4, blurb: 'Rods, hooks and fishing gear. Rotates every 4 hours.' },
  { id: 'special', label: '✨ Special Shop', hours: 6, blurb: 'Epic and Godly pieces, event exclusives and trophies.' },
  { id: 'skin', label: '🎨 Skin Shop', hours: 24, blurb: 'Cosmetic collectibles and trinkets. Rotates daily.' },
] as const;

/** Port of `shop.section_for` — total and deterministic, so every item has one home. */
export function shopSectionFor(item: {
  dropSources?: string[]; effectType?: string | null; rarity: string; category: string;
}): string {
  const sources = item.dropSources ?? [];
  if (sources.includes('fish') || sources.includes('fishing_bonus') || item.effectType === 'fishing_bonus') {
    return 'fishing';
  }
  if (item.rarity === 'epic' || item.rarity === 'godly') return 'special';
  if ((item.category === 'collectible' || item.category === 'trinket') && !item.effectType) return 'skin';
  return 'coin';
}

/** Port of `shop.rotation_window`: wall-clock aligned, recomputable from a timestamp. */
function rotationWindow(section: string, at: Date = new Date()): number {
  const hours = SHOP_SECTIONS.find((s) => s.id === section)?.hours ?? 6;
  return Math.floor(at.getTime() / (hours * 3600));
}

function humanTimeLeft(section: string, at: Date = new Date()): string {
  const hours = SHOP_SECTIONS.find((s) => s.id === section)?.hours ?? 6;
  const window = rotationWindow(section, at);
  const seconds = Math.max(0, (window + 1) * hours * 3600 - Math.floor(at.getTime() / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m` : 'under a minute';
}

export interface ShopItemRow {
  id: string; name: string; description: string; rarity: string; category: string;
  buyPrice: number; sellPrice: number; sellable: boolean; shopEnabled: boolean;
  section: string; stock: number | null; effectType: string | null; dropSources: string[];
  purchaseAvailable: boolean;
}

/**
 * The shop, from the SAME generated catalog snapshot the item catalog and the
 * bot's `/shop` render — `check-items-parity` fails the build if the snapshot
 * drifts from `items.py`, so this cannot become a second catalog.
 *
 * Stock is read, never created: a missing document means the window has not
 * been opened yet, which is exactly "full", so a dashboard read cannot consume
 * or fabricate stock.
 */
export async function shopSnapshot(db: Db, guildId: string): Promise<{ sections: unknown[]; items: ShopItemRow[] }> {
  const now = new Date();
  const catalog = (table.items as Array<Record<string, unknown>>)
    .filter((item) => item.shopEnabled === true && item.active !== false)
    .map((item) => {
      const section = shopSectionFor({
        dropSources: (item.dropSources as string[]) ?? [],
        effectType: (item.effectType as string | null) ?? null,
        rarity: String(item.rarity),
        category: String(item.category),
      });
      return {
        item: {
          id: String(item.id), name: String(item.name), description: String(item.description ?? ''),
          rarity: String(item.rarity), category: String(item.category),
          buyPrice: int(item.buyPrice), sellPrice: int(item.sellPrice),
          sellable: item.sellable === true, shopEnabled: true, section,
          effectType: (item.effectType as string | null) ?? null,
          dropSources: (item.dropSources as string[]) ?? [],
          stockLimit: item.shopStock == null ? null : int(item.shopStock),
        },
        section,
      };
    });

  const gid = Number(guildId);
  const docs = await db.collection(ECONOMY_COLLECTIONS.stock).find({
    ...guildFilter(guildId),
    window: { $in: [...new Set(catalog.map((c) => rotationWindow(c.section, now)))] },
  }).toArray();
  const remaining = new Map<string, number>();
  for (const d of docs as Doc[]) remaining.set(`${d.itemId}|${d.window}`, int(d.remaining));

  const rank: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, godly: 4 };
  const items = catalog
    .map(({ item }) => ({
      ...item,
      stock: item.stockLimit === null
        ? null
        : remaining.get(`${item.id}|${rotationWindow(item.section, now)}`) ?? item.stockLimit,
      // Availability is exactly what the bot's buy path requires: enabled,
      // priced, and not sold out. Rarity is never a gate.
      purchaseAvailable: item.buyPrice > 0 && (item.stockLimit === null || remaining.get(`${item.id}|${rotationWindow(item.section, now)}`) !== 0),
    }))
    .sort((a, b) => (rank[a.rarity] ?? 9) - (rank[b.rarity] ?? 9) || a.buyPrice - b.buyPrice);

  void gid;
  return {
    sections: SHOP_SECTIONS.map((s) => ({ ...s, rotatesIn: humanTimeLeft(s.id, now) })),
    items,
  };
}

// ── Guild economy configuration ────────────────────────────────────────

/** Mirrors `economy.ECONOMY_DEFAULTS`; the bot remains the runtime authority. */
export const ECONOMY_DEFAULTS: Record<string, unknown> = {
  currencyName: 'coins', currencySymbol: '🪙', startBalance: 100,
  dailyAmount: 250, weeklyAmount: 1500, monthlyAmount: 6000,
  workMin: 50, workMax: 300, begMin: 5, begMax: 100,
  workCooldownSec: 3600, jobCooldownSec: 3600, jobFailRate: 0.3,
  jobCooldownOverrides: {}, disabledJobs: [], begCooldownSec: 300,
  crimeCooldownSec: 1800, activityCooldownSec: 600, gambleMax: 10000,
  gambleCooldownSec: 60, robCooldownSec: 3600, robMinTarget: 100,
  multipliers: {}, disabledItems: [], lotteryTicketPrice: 100,
  lotteryMaxTickets: 10, bankCapacity: 10000,
};

export type ConfigState = 'found' | 'not_initialized';

/** Port of `economy.get_economy_config`: defaults overlaid with the stored section. */
export async function economyConfig(
  db: Db, guildId: string,
): Promise<{ state: ConfigState; config: Record<string, unknown> }> {
  const doc = await db.collection(ECONOMY_COLLECTIONS.config).findOne({ guildId });
  const section = doc?.economy && typeof doc.economy === 'object' ? (doc.economy as Doc) : null;
  const config: Record<string, unknown> = { ...ECONOMY_DEFAULTS };
  for (const [key, value] of Object.entries(section ?? {})) {
    if (key in config) config[key] = value;
  }
  return { state: section ? 'found' : 'not_initialized', config };
}

// ── Diagnostics ────────────────────────────────────────────────────────

export type SectionState = 'ok' | 'empty' | 'error';

export interface SectionResult<T> {
  section: string;
  state: SectionState;
  /** Populated whenever the read SUCCEEDED — including with zero records. */
  data: T | null;
  /** Populated only when the read FAILED. Never implied by an empty result. */
  error: { code: string; message: string; retryable: boolean } | null;
  ms: number;
  records: number | null;
}

export interface StoreDiagnostics {
  requestId: string;
  guildId: string;
  database: { name: string; uriSource: string | null; state: string; responseTimeMs: number };
  sections: Array<{ section: string; state: SectionState; ms: number; records: number | null }>;
  cache: 'HIT' | 'MISS';
  errorCategory: string | null;
}

/**
 * Run one section read, converting a database failure into an ERROR state.
 *
 * This is the distinction the page was missing. A read that throws is reported
 * as an error with its category; a read that succeeds with zero rows is
 * reported as empty. Collapsing the first into the second is what made a broken
 * connection look like an empty database.
 */
export async function section<T>(
  name: string,
  run: () => Promise<T>,
  count: (data: T) => number,
): Promise<SectionResult<T>> {
  const started = Date.now();
  try {
    const data = await run();
    const records = count(data);
    return {
      section: name,
      state: records === 0 ? 'empty' : 'ok',
      data,
      error: null,
      ms: Date.now() - started,
      records,
    };
  } catch (err) {
    const state = await classifyOnce();
    return {
      section: name,
      state: 'error',
      data: null,
      error: {
        code: state.state === 'CONFIGURATION_ERROR' ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_UNAVAILABLE',
        message: state.state === 'CONFIGURATION_ERROR'
          ? `The Murabot database is not configured on the site (${state.variable ?? 'MURABOT_MONGODB_URI'}).`
          : 'The Murabot database could not be reached. The economy data is intact — this is a connection problem.',
        retryable: state.state !== 'CONFIGURATION_ERROR',
      },
      ms: Date.now() - started,
      records: null,
    };
  }
}

/** Classify the cluster once so an error message can name the real problem. */
async function classifyOnce(): Promise<{ state: string; variable: string | null }> {
  try {
    await clusterDb('murabot');
    return { state: 'UNAVAILABLE', variable: null };
  } catch (err) {
    const e = err as { state?: string; variable?: string | null };
    return { state: e.state ?? 'UNAVAILABLE', variable: e.variable ?? null };
  }
}

/** Run a read inside the safe database wrapper and hand back a diagnostics entry. */
export async function withEconomyDb<T>(
  requestId: string,
  guildId: string,
  fn: (db: Db) => Promise<T>,
): Promise<{ ok: true; data: T; diagnostics: StoreDiagnostics } | { ok: false; error: { code: string; message: string; retryable: boolean }; diagnostics: StoreDiagnostics }> {
  const started = Date.now();
  const result = await withDatabase('murabot', fn);
  const database = {
    name: clusterDbName('murabot'),
    uriSource: clusterUriSource('murabot'),
    state: result.ok ? 'READY' : result.error.state,
    responseTimeMs: Date.now() - started,
  };
  if (result.ok) {
    return {
      ok: true,
      data: result.data,
      diagnostics: {
        requestId, guildId, database, sections: [], cache: 'MISS', errorCategory: null,
      },
    };
  }
  return {
    ok: false,
    error: {
      code: result.error.state === 'CONFIGURATION_ERROR' ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_UNAVAILABLE',
      message: result.error.state === 'CONFIGURATION_ERROR'
        ? 'The Murabot database is not configured on the site (MURABOT_MONGODB_URI).'
        : 'The Murabot database could not be reached. The economy data is intact — this is a connection problem.',
      retryable: result.error.state !== 'CONFIGURATION_ERROR',
    },
    diagnostics: {
      requestId, guildId, database, sections: [], cache: 'MISS', errorCategory: result.error.state,
    },
  };
}
