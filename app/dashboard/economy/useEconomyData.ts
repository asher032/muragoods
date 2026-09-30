'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';

// ── One economy snapshot for the whole page ─────────────────────────────
// The Economy page is a control centre with a dozen panels. Each panel used to
// call its own endpoint, so a single page view produced a burst of upstream
// requests and the page reported itself rate-limited.
//
// This hook loads the data ONCE per guild and shares it with every panel.
// It re-fetches only when the guild changes or the user explicitly reloads —
// there is no polling loop and no effect that re-runs on every render.

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
  recent: Array<{
    txId: string;
    userId: string | null;
    action: string;
    amount: number;
    itemId: string | null;
    source: string | null;
    at: string;
  }>;
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
  currency?: { name?: string; symbol?: string };
}

export interface TxnRow {
  txId: string;
  userId: string | null;
  guildId: string | null;
  action: string;
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
  rarity: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  sellable: boolean;
  section: string;
  stock: number | null;
  effectType: string | null;
  dropSources: string[];
}

export interface EconomySnapshot {
  overview: Overview | null;
  config: EconomyConfig | null;
  leaderboard: LeaderboardRow[];
  health: Health | null;
  audit: Audit | null;
  shop: { sections: ShopSection[]; items: ShopItem[] } | null;
  transactions: { total: number; rows: TxnRow[]; actions: string[] } | null;
}

const EMPTY: EconomySnapshot = {
  overview: null, config: null, leaderboard: [], health: null,
  audit: null, shop: null, transactions: null,
};

export function useEconomyData() {
  const { token, selected, user } = useGuild();
  const [data, setData] = useState<EconomySnapshot>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  // Guard against a guild switch resolving out of order and painting the
  // previous server's economy onto the new one.
  const guildId = selected?.id ?? null;

  const load = useCallback(async () => {
    if (!token || !guildId) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    setCode('');

    const read = async <T,>(endpoint: string, extra?: Record<string, string | number>): Promise<T | null> => {
      const params = new URLSearchParams({ guildId, endpoint, ...(extra ?? {}) });
      const resp = await apiFetch<Record<string, unknown>>(
        `/api/dashboard/economy/read?${params.toString()}`,
        { token, signal: controller.signal },
      );
      if (id !== requestId.current) return null;
      if (!resp.ok || !resp.data?.success) return null;
      return resp.data as T;
    };

    try {
      // The overview already carries circulation + the config; the other reads
      // are independent, so a failure in one never blanks the page.
      const overviewResp = await apiFetch<{ success: boolean; overview?: Overview; config?: EconomyConfig; error?: string; code?: string }>(
        `/api/dashboard/economy/overview?guildId=${guildId}`,
        { token, signal: controller.signal },
      );
      if (id !== requestId.current) return;
      if (!overviewResp.ok || !overviewResp.data?.success) {
        setData(EMPTY);
        setError(overviewResp.ok
          ? overviewResp.data.error || 'Could not load economy'
          : overviewResp.error);
        setCode(overviewResp.ok ? overviewResp.data.code || '' : (overviewResp as { code?: string }).code || '');
        setLoading(false);
        return;
      }

      const [leaderboard, health, audit, shop, transactions] = await Promise.all([
        read<{ rows: LeaderboardRow[] }>('leaderboard', { limit: 10 }),
        read<{ health: Health }>('health'),
        read<Audit>('audit'),
        read<{ sections: ShopSection[]; items: ShopItem[] }>('shop'),
        read<{ total: number; rows: TxnRow[]; actions: string[] }>('transactions', { limit: 25 }),
      ]);
      if (id !== requestId.current) return;
      setData({
        overview: overviewResp.data.overview ?? null,
        config: overviewResp.data.config ?? null,
        leaderboard: leaderboard?.rows ?? [],
        health: health?.health ?? null,
        audit: audit ?? null,
        shop: shop ? { sections: shop.sections ?? [], items: shop.items ?? [] } : null,
        transactions: transactions
          ? { total: transactions.total ?? 0, rows: transactions.rows ?? [], actions: transactions.actions ?? [] }
          : null,
      });
    } catch {
      if (id === requestId.current) {
        setData(EMPTY);
        setError('Could not load economy data.');
        setCode('NETWORK_ERROR');
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [token, guildId]);

  useEffect(() => {
    // Fetch-on-mount. `load` is async and every state write happens after an
    // await, so nothing is set synchronously in the effect body. This is the
    // same shape as the shared useGuildConfig loader, for the same reason:
    // one request per guild, no polling, no re-render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
    };
    // Keyed on the guild id STRING, not the selection object: guild-context
    // replaces that object on live-detection refreshes, and depending on it
    // would refetch the whole economy on every refresh.
  }, [guildId, load]);

  return {
    data,
    loading,
    error,
    code,
    reload: load,
    // The Discord account performing the action. The backend re-checks this
    // against its own owner list — the client only reports who is asking.
    actorId: user?.discordId ?? null,
    guildName: selected?.name ?? '',
  };
}