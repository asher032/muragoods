// Bot permission checker — verifies the bot has required Discord permissions
// in a channel, with Fix / Recheck actions.
'use client';

import { useEffect, useState } from 'react';
import { useModules } from './ModuleProvider';

interface PermissionCheckerProps {
  guildId: string;
  channelId?: string;
  required: string[]; // permission display names (matching DISCORD_PERMISSIONS)
}

// Discord bit → name (must mirror discord-modules.ts DISCORD_PERMISSIONS).
const PERM_BITS: Record<string, number> = {
  'View Channels': 1024,
  'Send Messages': 2048,
  'Embed Links': 4096,
  'Attach Files': 8192,
  'Read Message History': 16384,
  'Mention Everyone': 32768,
  'Use Slash Commands': 65536,
  'Manage Channels': 268435456,
  'Manage Roles': 536870912,
  'Administrator': 1073741824,
  'Move Members': 2147483648,
};

export function PermissionChecker({ guildId, channelId, required }: PermissionCheckerProps) {
  const { pushToast } = useModules();
  const [perms, setPerms] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(false);

  const test = async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'testPermissions', guildId };
      if (channelId) body.channelId = channelId;
      const res = await fetch('/api/admin/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) setPerms(data.data);
      else pushToast('warning', '⚠️ ' + (data.error ?? 'Permission check failed'));
    } catch {
      pushToast('error', '❌ Permission check failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { test(); }, [guildId, channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!perms) return <div className="perm-check loading">Checking permissions…</div>;

  const missing = required.filter((r) => !perms[r]);

  return (
    <div className="perm-check">
      <div className="perm-check-header">
        <span>🤖 Bot permissions</span>
        <button type="button" className="deco-btn deco-btn-sm deco-btn-dark" onClick={test} disabled={loading}>
          {loading ? '…' : 'Recheck'}
        </button>
      </div>
      <div className="perm-grid">
        {required.map((r) => (
          <div key={r} className={`perm-item ${perms[r] ? 'ok' : 'missing'}`}>
            <span>{perms[r] ? '✅' : '❌'}</span>
            <span>{r}</span>
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <div className="perm-missing">
          <div>
            ⚠️ <strong>Missing permission{missing.length > 1 ? 's' : ''}:</strong> {missing.join(', ')}
          </div>
          <div className="perm-actions">
            <button type="button" className="deco-btn deco-btn-sm deco-btn-gold" onClick={() => pushToast('info', 'Invite the bot with: /invite (admin or the listed permissions)')}>
              Fix Permissions
            </button>
            <button type="button" className="deco-btn deco-btn-sm deco-btn-dark" onClick={test}>
              Recheck
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
