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

  const load = useCallback(async () => {
    if (!token || !selected) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`/api/dashboard/config?guildId=${selected.id}`, {
        headers: { 'x-discord-token': token },
      });
      const data = await resp.json();
      if (data.success) {
        setConfig(data.config || {});
      } else {
        setError(data.error || 'Failed to load config');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [token, selected]);

  const save = useCallback(async () => {
    if (!token || !selected) return false;
    setSaveState('saving');
    setError('');
    try {
      const resp = await fetch('/api/dashboard/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-discord-token': token },
        body: JSON.stringify({ guildId: selected.id, config }),
      });
      const data = await resp.json();
      if (data.success) {
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2500);
        return true;
      } else {
        setSaveState('error');
        setError(data.error || 'Failed to save');
        setTimeout(() => setSaveState('idle'), 3000);
        return false;
      }
    } catch (err) {
      setSaveState('error');
      setError(String(err));
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
