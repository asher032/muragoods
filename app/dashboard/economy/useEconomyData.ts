'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';

// ── One economy snapshot for the whole page ─────────────────────────────
// The page asks ONCE. It used to fire seven requests (an overview plus one per
// panel) and then quietly turned every failure into an empty list, so a broken
// connection was indistinguishable from an empty economy — "No transactions
// yet" when in fact nothing had been asked.
//
// The state model is now explicit and is the point of this file:
//
//   loading  → "Loading economy…"
//   ok       → real data
//   empty    → the read succeeded and there is genuinely nothing
//   error    → the read FAILED, with a category and a working Retry
//
// A section is only ever `empty` because the backend said so.

export interface EconomyConfig {
  currencyName?: string;
  currencySymbol?: string;
  startBalance?: number;
  dailyAmount?: number;
  weeklyAmount?: number;
  monthlyAmount?: number;
  workMin?: number;
  workMax?: number;
  begMin?: number;
  begMax?: number;
  workCooldownSec?: number;
  begCooldownSec?: number;
  crimeCooldownSec?: number;
  activityCooldownSec?: number;
  gambleMax?: number;
  gambleCooldownSec?: number;
  robCooldownSec?: number;
  robMinTarget?: number;
  lotteryTicketPrice?: number;
  lotteryMaxTickets?: number;
  jobCooldownSec?: number;
  jobFailRate?: number;
  jobCooldownOverrides?: Record<string, number>;
  disabledJobs?: string[];
  disabledItems?: string[];
  bankCapacity?: number;
}

export interface LeaderboardRow {
  canonicalUserId: string;
  userId: string;
  guildId: string;
  displayName?: string;
  balance: number;
  bank: number;
  total: number;
}

export interface Overview {
  users: number;
  circulation: {
    pocket: number;
    bank: number;
    total: number;
    average: number;
    median: number;
    highest: number;
  };
  dau: number;
  transactions: number;
  top: LeaderboardRow[];
  recent: RecentRow[];
}

export interface RecentRow {
  txId: string | null;
  userId: string | null;
  action: string | null;
  amount: number;
  itemId: string | null;
  source: string | null;
  at: string;
  /** Resolved live from the guild; "Unknown User" when it cannot be resolved. */
  displayName?: string;
}

export interface Health {
  windowHours: number;
  circulation: number;
  pocket: number;
  bank: number;
  createdToday: number;
  removedToday: number;
  netChangeToday: number;
  avgBalance: number;
  medianBalance: number;
  highestBalance: number;
  wallets: number;
  topSharePct: number;
  shopSpending: number;
  marketVolume: number;
  rewardPayouts: number;
  gamblingVolume: number;
  workIncome: number;
}

export interface TxnRow {
  txId: string | null;
  userId: string | null;
  guildId: string | null;
  action: string | null;
  amount: number;
  currency: string | null;
  itemId: string | null;
  source: string;
  result: string;
  at: string;
  metadata: Record<string, unknown>;
}

export interface AuditFinding {
  code: string;
  severity: string;
  itemId?: string;
  txId?: string;
  count?: number;
  detail: string;
}

export interface Audit {
  checkedAt: string;
  peakSinglePayout: number;
  wallet_audit: string;
  findings: AuditFinding[];
  findingCount: number;
  protections: string[];
}

export interface ShopSection {
  id: string;
  label: string;
  blurb: string;
  hours: number;
  rotatesIn: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  rarity: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  sellable: boolean;
  shopEnabled: boolean;
  section: string;
  stock: number | null;
  effectType: string | null;
  dropSources: string[];
  purchaseAvailable: boolean;
}

export interface Statistics {
  wallets: number;
  dau: number;
  transactions: number;
  recent: number;
  circulation: Overview['circulation'];
}

/** Per-section outcome, exactly as the backend reported it. */
export interface SectionStatus {
  state: 'ok' | 'empty' | 'error';
  error: { code: string; message: string; retryable: boolean } | null;
  ms: number;
  records: number | null;
}

/** Murabot's own presence for the selected guild, from its gateway cache. */
export interface BotPresenceSnapshot {
  online: boolean;
  installed: boolean;
  guildAccessible: boolean;
  botUserId: string | null;
  botUsername: string | null;
  gatewayState: string | null;
  heartbeatAgeSeconds: number | null;
  latencyMs: number | null;
  channels?: number;
  error: { code: string; message: string } | null;
}

/**
 * Mirrors `OwnerDiagnostics` from app/lib/murabot-owner.ts.
 *
 * Declared locally rather than imported: that module reads `process.env` and
 * runs on the server, and a type-only import would still pull it into the
 * client bundle. The two must stay in step — the ids arrive already masked.
 */
export interface OwnerDiagnostics {
  authenticatedDiscordUserId: string | null;
  configuredOwnerId: string | null;
  ownerConfigured: boolean;
  isOwner: boolean;
}

export interface Diagnostics {
  requestId?: string;
  guildId?: string;
  database?: { name: string; uriSource: string | null; state: string; responseTimeMs: number };
  sections?: Array<{ section: string; state: string; ms: number; records: number | null }>;
  cache?: string;
  errorCategory?: string | null;
}

export interface EconomySnapshot {
  overview: Overview | null;
  config: EconomyConfig | null;
  leaderboard: LeaderboardRow[];
  logs: RecentRow[];
  health: Health | null;
  audit: Audit | null;
  shop: { sections: ShopSection[]; items: ShopItem[] } | null;
  transactions: { total: number; rows: TxnRow[]; actions: readonly string[] } | null;
  statistics: Statistics | null;
  /**
   * Whether the server has a saved economy section. `not_initialized` is NOT
   * an error: the bot's defaults are in force and the dashboard says so.
   */
  configState: 'found' | 'not_initialized' | 'unknown';
  sections: Record<string, SectionStatus>;
  diagnostics: Diagnostics | null;
  /** Present unless Murabot could not answer at all. */
  bot: BotPresenceSnapshot | null;
  /** False when the deployment has no MURABOT_OWNER_DISCORD_ID configured. */
  ownerConfigured: boolean;
  /** null = ownership could not be confirmed. */
  isOwner: boolean | null;
  /**
   * Both Discord ids MASKED to their last four characters, plus the verdict.
   * Enough to confirm a match or spot the wrong signed-in account; not enough
   * to recover the owner's id, which stays on the server.
   */
  owner: OwnerDiagnostics | null;
  /** True when the backend could not reach the Murabot database at all. */
  databaseAvailable: boolean;
}

const EMPTY: EconomySnapshot = {
  overview: null, config: null, leaderboard: [], logs: [], health: null,
  audit: null, shop: null, transactions: null, statistics: null,
  configState: 'unknown',
  sections: {}, diagnostics: null, bot: null, ownerConfigured: true,
  isOwner: null, owner: null, databaseAvailable: true,
};

export function useEconomyData() {
  const { token, selected } = useGuild();
  const [data, setData] = useState<EconomySnapshot>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  // A retry while one is already in flight must not start a second request.
  const inFlight = useRef(false);
  // Keyed on the guild id STRING, not the selection object: guild-context
  // replaces that object on live-detection refreshes, and depending on it
  // would refetch the whole economy on every refresh.
  const guildId = selected?.id ?? null;

  const load = useCallback(async (opts: { fresh?: boolean } = {}) => {
    if (!token || !guildId) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    const id = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    setCode('');

    const params = new URLSearchParams({ guildId });
    // `fresh` drops the server cache so Retry actually re-reads the database
    // instead of replaying the response that just failed.
    if (opts.fresh) params.set('fresh', '1');

    try {
      const resp = await apiFetch<Record<string, unknown>>(
        `/api/dashboard/economy?${params.toString()}`,
        { token, signal: controller.signal },
      );
      if (id !== requestId.current) return;

      if (!resp.ok || !resp.data?.success) {
        const body = resp.ok ? (resp.data as Record<string, unknown>) : null;
        const transport = resp.ok ? null : resp;
        setData(EMPTY);
        setCode(String(body?.code ?? transport?.code ?? 'ECONOMY_LOAD_FAILED'));
        setError(String(body?.error ?? transport?.error ?? 'Could not load economy data.'));
        return;
      }

      const body = resp.data as unknown as {
        overview?: Overview | null;
        config?: EconomyConfig | null;
        leaderboard?: LeaderboardRow[];
        logs?: RecentRow[];
        health?: Health | null;
        audit?: Audit | null;
        shop?: { sections?: ShopSection[]; items?: ShopItem[] } | null;
        transactions?: { total?: number; rows?: TxnRow[]; actions?: readonly string[] } | null;
        statistics?: Statistics | null;
        configState?: 'found' | 'not_initialized' | 'unknown';
        sections?: Record<string, SectionStatus>;
        diagnostics?: Diagnostics;
        bot?: BotPresenceSnapshot | null;
        ownerConfigured?: boolean;
        isOwner?: boolean | null;
        owner?: OwnerDiagnostics | null;
        databaseAvailable?: boolean;
        error?: { code: string; message: string; retryable: boolean };
      };

      setData({
        overview: body.overview ?? null,
        config: body.config ?? null,
        leaderboard: body.leaderboard ?? [],
        logs: body.logs ?? [],
        health: body.health ?? null,
        audit: body.audit ?? null,
        shop: body.shop ? { sections: body.shop.sections ?? [], items: body.shop.items ?? [] } : null,
        transactions: body.transactions
          ? { total: body.transactions.total ?? 0, rows: body.transactions.rows ?? [], actions: body.transactions.actions ?? [] }
          : null,
        statistics: body.statistics ?? null,
        configState: body.configState ?? 'unknown',
        sections: body.sections ?? {},
        diagnostics: body.diagnostics ?? null,
        bot: body.bot ?? null,
        ownerConfigured: body.ownerConfigured !== false,
        isOwner: body.isOwner ?? null,
        owner: body.owner ?? null,
        databaseAvailable: body.databaseAvailable !== false,
      });

      // A database the site cannot reach is a page-level failure, not a set of
      // empty sections: it is the one condition that makes every number on the
      // page unknowable, and it must be stated.
      if (body.error) {
        setCode(body.error.code);
        setError(body.error.message);
      }
    } catch {
      if (id === requestId.current) {
        setData(EMPTY);
        setError('Could not reach the dashboard. Check your connection and retry.');
        setCode('NETWORK_ERROR');
      }
    } finally {
      inFlight.current = false;
      if (id === requestId.current) setLoading(false);
    }
  }, [token, guildId]);

  useEffect(() => {
    // Fetch-on-mount. `load` is async and every state write happens after an
    // await, so nothing is set synchronously in the effect body. One request
    // per guild, no polling, no re-render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
      inFlight.current = false;
    };
  }, [guildId, load]);

  return {
    data,
    loading,
    error,
    code,
    /** Retry: a fresh read that bypasses the server cache. */
    reload: useCallback(() => load({ fresh: true }), [load]),
    /** Background refresh that may be served from a warm cache. */
    refresh: useCallback(() => load(), [load]),
    // The API derives ownership from the signed-in session. Nothing about the
    // caller's identity is ever sent from the browser, so there is nothing for
    // a tampered client to change.
    isOwner: data.isOwner,
    guildName: selected?.name ?? '',
  };
}

/**
 * The state of one section, for the UI to branch on.
 *
 * `error` and `empty` are separate outcomes on purpose: "the read failed" and
 * "the read succeeded and there is nothing" are different facts, and only one
 * of them is fixed by pressing Retry.
 */
export type SectionOutcome =
  | { kind: 'loading' }
  | { kind: 'data' }
  | { kind: 'empty' }
  | { kind: 'error'; error: { code: string; message: string; retryable: boolean } };

export function sectionOutcome(
  data: EconomySnapshot, name: string, loading: boolean,
): SectionOutcome {
  if (loading) return { kind: 'loading' };
  const found = data.sections?.[name];
  if (!found) {
    // No verdict for this section at all — the database could not be reached.
    return {
      kind: 'error',
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The Murabot economy database could not be reached.',
        retryable: true,
      },
    };
  }
  if (found.state === 'error') {
    return { kind: 'error', error: found.error ?? { code: 'SECTION_FAILED', message: 'This section could not be read.', retryable: true } };
  }
  return found.state === 'empty' ? { kind: 'empty' } : { kind: 'data' };
}
