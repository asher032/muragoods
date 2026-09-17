// State container for the ⚙️ Modules page.
// Holds the active guild, saved config, dirty state, and toasts.
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MODULES } from '@/app/lib/discord-modules';
import { Toast } from './types';
import { getPath, setPath } from './moduleUtils';

interface ModulesContextValue {
  guildId: string;
  setGuildId: (id: string) => void;
  config: Record<string, unknown> | null;
  saving: boolean;
  dirty: boolean;
  toasts: Toast[];
  setField: (key: string, value: unknown) => void;
  saveConfig: () => Promise<boolean>;
  resetConfig: () => void;
  refreshConfig: () => Promise<void>;
  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: string) => void;
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const [guildId, setGuildIdState] = useState('');
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const savedRef = useRef<string>('');
  const dirty = config !== null && JSON.stringify(config) !== savedRef.current;

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const setField = useCallback((key: string, value: unknown) => {
    setConfig((prev) => (prev ? setPath({ ...prev }, key, value) : null));
  }, []);

  const refreshConfig = useCallback(async () => {
    if (!guildId) return;
    try {
      const res = await fetch(`/api/admin/modules?action=config&guildId=${encodeURIComponent(guildId)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setConfig(data.data);
        savedRef.current = JSON.stringify(data.data);
      }
    } catch { /* ignore */ }
  }, [guildId]);

  const saveConfig = useCallback(async () => {
    if (!guildId || !config) return false;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveConfig', guildId, data: config }),
      });
      const data = await res.json();
      if (data.success) {
        savedRef.current = JSON.stringify(config);
        pushToast('success', '✅ Saved successfully!');
        await refreshConfig();
        return true;
      }
      pushToast('error', `❌ ${data.error ?? 'Could not save changes.'}`);
      return false;
    } catch {
      pushToast('error', '❌ Could not save changes.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [guildId, config, pushToast, refreshConfig]);

  const resetConfig = useCallback(() => {
    if (config) {
      savedRef.current = JSON.stringify(config);
      setConfig(JSON.parse(JSON.stringify(config)));
    }
    pushToast('info', 'Settings reset.');
  }, [config, pushToast]);

  const value = useMemo(() => ({
    guildId,
    setGuildId: (id: string) => { setGuildIdState(id); },
    config,
    saving,
    dirty,
    toasts,
    setField,
    saveConfig,
    resetConfig,
    refreshConfig,
    pushToast,
    dismissToast,
  }), [guildId, config, saving, dirty, toasts, setField, saveConfig, resetConfig, refreshConfig, pushToast, dismissToast]);

  // Auto-load a guild's config whenever the selected server changes.
  useEffect(() => {
    if (!guildId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/modules?action=config&guildId=${encodeURIComponent(guildId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.data) {
          setConfig(data.data);
          savedRef.current = JSON.stringify(data.data);
        } else {
          const fresh = defaultConfig();
          setConfig(fresh);
          savedRef.current = JSON.stringify(fresh);
        }
      } catch {
        const fresh = defaultConfig();
        setConfig(fresh);
        savedRef.current = JSON.stringify(fresh);
      }
    })();
    return () => { cancelled = true; };
  }, [guildId]);

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules(): ModulesContextValue {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error('useModules must be inside ModulesProvider');
  return ctx;
}

// Default values for a brand-new config, derived from the module defs.
export function defaultConfig(): Record<string, unknown> {
  const out: Record<string, unknown> = { modules: {} };
  for (const mod of MODULES) {
    (out.modules as Record<string, unknown>)[mod.id] = true;
    for (const f of mod.fields) {
      setPath(out, f.key, f.default);
    }
  }
  return out;
}
