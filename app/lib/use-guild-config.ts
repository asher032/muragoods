'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';

interface GuildConfig {
  modules?: Record<string, boolean>;
  music?: Record<string, unknown>;
  moderation?: Record<string, unknown>;
  welcome?: Record<string, unknown>;
  tickets?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  securitySettings?: Record<string, unknown>;
  community?: Record<string, unknown>;
  prefix?: string;
  [key: string]: unknown;
}

export function useGuildConfig() {
  const { token, selected } = useGuild();
  const [config, setConfig] = useState<GuildConfig>({});
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  /**
   * Report a failed request with the endpoint, the HTTP status and the server's
   * own message.
   *
   * Previously a failure showed only `data.error || 'Failed to save'`, so a 401,
   * a 403 and a 500 were indistinguishable — and if the response was not JSON
   * (a platform error page, say) `resp.json()` threw and the real status was
   * lost entirely, leaving a JSON parse message that pointed at nothing.
   */
  const describeFailure = async (
    action: 'load' | 'save',
    endpoint: string,
    resp: Response | null,
    thrown: unknown,
  ): Promise<string> => {
    if (!resp) {
      return `Failed to ${action} ${endpoint}: network error — ${String(thrown)}`;
    }
    let serverMessage = '';
    try {
      const body = await resp.clone().json();
      serverMessage = typeof body?.error === 'string' ? body.error : '';
    } catch {
      try {
        serverMessage = (await resp.clone().text()).slice(0, 200).trim();
      } catch {
        serverMessage = '';
      }
    }
    const suffix = serverMessage ? ` — ${serverMessage}` : '';
    return `Failed to ${action} ${endpoint}: HTTP ${resp.status}${suffix}`;
  };

  const load = useCallback(async () => {
    if (!token || !selected) return;
    setLoading(true);
    setError('');
    const endpoint = `/api/dashboard/config?guildId=${selected.id}`;
    let resp: Response | null = null;
    try {
      resp = await fetch(endpoint, { headers: { 'x-discord-token': token } });
      const data = await resp.json();
      if (data.success) {
        setConfig(data.config || {});
      } else {
        setError(await describeFailure('load', endpoint, resp, null));
      }
    } catch (err) {
      setError(await describeFailure('load', endpoint, resp, err));
    } finally {
      setLoading(false);
    }
  }, [token, selected]);

  const save = useCallback(async () => {
    if (!token || !selected) return false;
    setSaveState('saving');
    setError('');
    const endpoint = '/api/dashboard/config';
    let resp: Response | null = null;
    try {
      resp = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-discord-token': token },
        body: JSON.stringify({ guildId: selected.id, config }),
      });
      const data = await resp.json();
      if (data.success) {
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2500);
        return true;
      }
      setSaveState('error');
      setError(await describeFailure('save', endpoint, resp, null));
      setTimeout(() => setSaveState('idle'), 3000);
      return false;
    } catch (err) {
      setSaveState('error');
      setError(await describeFailure('save', endpoint, resp, err));
      setTimeout(() => setSaveState('idle'), 3000);
      return false;
    }
  }, [token, selected, config]);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback((section: string, key: string, value: unknown) => {
    setConfig((c) => ({
      ...c,
      [section]: { ...(c[section] as Record<string, unknown> || {}), [key]: value },
    }));
  }, []);

  return { config, loading, saveState, error, save, update, load, setConfig };
}

export async function loadGuildResources(token: string, guildId: string) {
  const resp = await fetch(`/api/dashboard/resources?guildId=${guildId}`, {
    headers: { 'x-discord-token': token },
  });
  return resp.json();
}
