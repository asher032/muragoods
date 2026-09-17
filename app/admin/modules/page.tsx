// ⚙️ Modules configuration dashboard — all 12 modules, driven by
// the MODULES registry, with visual Discord selectors (no IDs shown).
'use client';

import { useEffect, useMemo, useState } from 'react';
import { NavBar } from '@/app/components/NavBar';
import { ModulesProvider, defaultConfig, useModules } from '@/app/components/discord/ModuleProvider';
import { MODULES } from '@/app/lib/discord-modules';
import { ModuleCard } from '@/app/components/discord/ModuleCard';
import { DiscordGuild } from '@/app/components/discord/types';
import { getPath } from '@/app/components/discord/moduleUtils';

const EMPTY_CONFIG = { modules: {} };

function ModulesShell() {
  const { guildId, setGuildId, config, saving, dirty, refreshConfig, toasts, dismissToast } = useModules();
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadGuilds = async () => {
    setGuildsLoading(true);
    try {
      const res = await fetch('/api/admin/modules?action=guilds');
      const data = await res.json();
      if (data.success) setGuilds(data.data ?? []);
    } catch { /* ignore */ }
    setGuildsLoading(false);
  };

  useEffect(() => { loadGuilds(); }, []);

  const pickGuild = async (id: string) => {
    setGuildId(id);
    // The provider auto-loads the config; just refresh the server list.
    await loadGuilds();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshConfig(), loadGuilds()]);
    setRefreshing(false);
  };

  const selectedGuild = useMemo(() => guilds.find((g) => g.id === guildId) ?? null, [guilds, guildId]);

  return (
    <>
      <NavBar pageLabel="⚙️ Modules" />
      <main className="modules-page">
        <div className="modules-header">
          <div>
            <p className="modules-eyebrow">SERVER CONFIG</p>
            <h1 className="modules-title">⚙️ Modules</h1>
            <p className="modules-sub">
              Configure every bot module from one dashboard — no Discord Developer Mode, no copying IDs.
            </p>
          </div>
          <div className="modules-server">
            <label className="modules-server-label">Server</label>
            <select
              value={guildId}
              onChange={(e) => pickGuild(e.target.value)}
              disabled={guildsLoading}
              className="modules-server-select"
            >
              <option value="">{guildsLoading ? 'Loading servers…' : 'Pick a server…'}</option>
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button type="button" className="deco-btn deco-btn-sm deco-btn-gold" onClick={onRefresh} disabled={refreshing || guildsLoading}>
              🔄 {refreshing ? '…' : 'Sync'}
            </button>
          </div>
        </div>

        {selectedGuild && (
          <div className="modules-status">
            Connected to <strong>{selectedGuild.name}</strong>
            {dirty && <span className="modules-dirty"> · unsaved changes</span>}
            {saving && <span className="modules-saving"> · saving…</span>}
          </div>
        )}

        {!guildId && (
          <div className="modules-empty">
            <div className="deco-container">
              <p>👆 Select a server above to start configuring its modules.</p>
              {guilds.length === 0 && !guildsLoading && (
                <p className="modules-empty-note">
                  The bot isn't in any servers yet — invite it with{' '}
                  <code>/invite</code> or run <code>mg!setup</code> on a server.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="modules-grid">
          {MODULES.map((mod) => (
            <ModuleCard key={mod.id} module={mod} />
          ))}
        </div>

        <div className="modules-toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismissToast(t.id)}>
              {t.message}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

export default function ModulesPage() {
  return (
    <ModulesProvider>
      <ModulesShell />
    </ModulesProvider>
  );
}
