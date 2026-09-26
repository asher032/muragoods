'use client';

// Shared dashboard API client. Failure handling rules:
//  - every request has a timeout
//  - 429/5xx/network/timeout → retried with exponential backoff (max 4 attempts)
//  - 400/401/403/404 → permanent, no retry; error surfaced verbatim
//  - success is NEVER fabricated: non-OK → returned as { ok:false, error, status }

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; retryable: boolean };

const TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 4;
const BACKOFFS_MS = [0, 5_000, 15_000, 30_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function once(
  url: string,
  init: RequestInit,
  token?: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'x-discord-token': token } : {}),
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch<T>(
  url: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<ApiResult<T>> {
  const method = opts.method ?? 'GET';
  const init: RequestInit = {
    method,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };

  let lastError = 'Request failed';
  let lastStatus = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (BACKOFFS_MS[attempt] > 0) await sleep(BACKOFFS_MS[attempt]);
    try {
      const resp = await once(url, init, opts.token);

      if (resp.ok) {
        const data = (await resp.json()) as T;
        return { ok: true, data };
      }

      lastStatus = resp.status;
      const payload = (await resp.json().catch(() => null)) as { error?: string } | null;
      lastError = payload?.error || `HTTP ${resp.status}`;

      // Permanent client errors: surface immediately, never retry.
      if (!isRetryable(resp.status)) {
        return { ok: false, error: lastError, status: resp.status, retryable: false };
      }
      // 429/5xx: fall through to retry.
    } catch (err) {
      lastStatus = 0;
      lastError = err instanceof DOMException && err.name === 'AbortError'
        ? 'Request timed out'
        : err instanceof Error
          ? err.message
          : 'Network error';
      // Network/timeout: fall through to retry.
    }
  }

  return { ok: false, error: lastError, status: lastStatus, retryable: true };
}

export interface GuildSummary {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  members: number | null;
  botInstalled?: boolean | null;
  botOnlineInGuild?: boolean | null;
}

// One server from the unified detection endpoint
// (GET /api/dashboard/servers). The four membership sources are reported
// independently — managing a server never implies the bot is installed.
export interface DetectedServer {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  inUserGuilds: boolean;
  userCanManage: boolean;
  userPermissions: string;
  botInGateway: boolean | null;
  botInRest: boolean | null;
  botInstalled: boolean | null;
  botOnlineInGuild: boolean | null;
  botPermissions: string | null;
  botIsAdmin: boolean | null;
  channelCount: number | null;
  categoryCount: number | null;
  roleCount: number | null;
  memberCount: number | null;
  presenceCount: number | null;
  botConnection: 'online' | 'offline' | 'unknown';
  inviteUrl: string | null;
  needsInvite: boolean;
  missingPermissions: boolean;
}

export interface ServersMeta {
  botOnline: boolean | null;
  botGuildCount: number | null;
  userGuildCount: number;
  manageableCount: number;
  refreshedAt: string;
  cached?: boolean;
}

export interface ServersResponse {
  success: boolean;
  servers: DetectedServer[];
  meta: ServersMeta;
  error?: string;
}

export interface BotServiceHealth {
  status: 'ok' | 'degraded' | 'offline';
  responseTime: number;
  lastCheck: string;
}

// Real fields from the bot's own /health — the heartbeat-ACK clock, an actual
// `ffmpeg -version` execution, and HTTP probes. Nothing here is inferred.
export interface BotDetail {
  ok: boolean | null;
  latency: number | null;
  uptimeSeconds: number | null;
  lastHeartbeat: string | null;
  reconnectCount: number | null;
  gateway: {
    alive: boolean | null;
    heartbeatAgeSeconds: number | null;
    staleAfterSeconds: number | null;
  } | null;
  subsystems: Record<string, string>;
  ffmpeg: boolean | null;
  opus: { loaded: boolean | null; status: string | null; lib: string | null } | null;
  voiceBackend: { davey: boolean | null } | null;
  guilds: number | null;
  databaseDetail: { configured: boolean | null; errorClass: string | null; hint: string | null } | null;
  user: { username: string | null; avatarUrl: string | null; applicationId: string | number | null } | null;
  connectionState: string | null;
  gatewayState?: string | null;
  lastApiCheck: { at: string | null; latencyMs: number | null; reachable: boolean | null } | null;
}

export interface BotStatusResponse {
  status: 'ok' | 'degraded' | 'offline';
  // The bot's status on its own. `status` above is an aggregate that also
  // includes the site's backend, Discord's API and the site's database, so it
  // must never be used to label the bot.
  botStatus: 'ok' | 'degraded' | 'offline';
  checkedAt: string;
  bot: BotDetail | null;
  services: {
    dashboardBackend: BotServiceHealth;
    botGateway: BotServiceHealth;
    discordApi: BotServiceHealth;
    database: BotServiceHealth;
  };
}

import { useEffect, useState } from 'react';

// Shared so more than one page reads bot status the same way. The dashboard
// home previously defined its own copy inline.
export function useBotStatus(): BotStatusResponse | null {
  const [status, setStatus] = useState<BotStatusResponse | null>(null);
  useEffect(() => {
    let alive = true;
    dashboardApi.status()
      .then((r) => { if (alive && r.ok) setStatus(r.data); })
      .catch(() => { /* surfaced by the consuming page's own error state */ });
    return () => { alive = false; };
  }, []);
  return status;
}

export interface GuildConfigDoc {
  guildId: string;
  guildName?: string;
  modules?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface ActivityEntry {
  type?: string;
  label?: string;
  summary?: string;
  detail?: string;
  actor?: string;
  at: string;
}

export const dashboardApi = {
  guilds: (token: string) =>
    apiFetch<{ success: boolean; guilds: GuildSummary[] }>('/api/dashboard/guilds', { token }),

  // Unified server detection (live user auth × live bot presence, verified
  // server-side). forceRefresh=true bypasses the 45s cache (Refresh button).
  servers: (forceRefresh = false) =>
    apiFetch<ServersResponse>(`/api/dashboard/servers${forceRefresh ? '?refresh=1' : ''}`),

  refreshServers: () =>
    apiFetch<ServersResponse>('/api/dashboard/servers', { method: 'POST' }),

  // Single-server verification. The guildId is re-verified server-side
  // (user-manages + live bot check) — never trusted from the caller.
  server: (guildId: string) =>
    apiFetch<{ success: boolean; server: DetectedServer; meta: ServersMeta; error?: string }>(
      `/api/dashboard/servers?guildId=${encodeURIComponent(guildId)}`,
    ),

  config: (token: string, guildId: string) =>
    apiFetch<{ success: boolean; config: GuildConfigDoc; guild: { id: string; name: string; icon: string | null } }>(
      `/api/dashboard/config?guildId=${encodeURIComponent(guildId)}`,
      { token },
    ),

  saveConfig: (token: string, guildId: string, config: Record<string, unknown>) =>
    apiFetch<{ success: boolean }>('/api/dashboard/config', { method: 'PATCH', token, body: { guildId, config } }),

  status: () =>
    apiFetch<BotStatusResponse>('/api/dashboard/status'),

  analytics: (token: string, guildId: string, range: string) =>
    apiFetch<{ success: boolean; data: Record<string, unknown> }>(
      `/api/dashboard/analytics?guildId=${encodeURIComponent(guildId)}&range=${encodeURIComponent(range)}`,
      { token },
    ),

  audit: (token: string, guildId: string) =>
    apiFetch<{ success: boolean; audit: ActivityEntry[] }>(
      `/api/dashboard/audit?guildId=${encodeURIComponent(guildId)}`,
      { token },
    ),

  automations: (token: string, guildId: string) =>
    apiFetch<{ success: boolean; automations: unknown[] }>(
      `/api/dashboard/automations?guildId=${encodeURIComponent(guildId)}`,
      { token },
    ),

  tickets: (token: string, guildId: string) =>
    apiFetch<{ success: boolean; tickets: Array<Record<string, unknown>> }>(
      `/api/dashboard/tickets/list?guildId=${encodeURIComponent(guildId)}`,
      { token },
    ),
};
