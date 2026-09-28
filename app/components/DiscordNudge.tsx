'use client';

import { useEffect, useState } from 'react';

// Persistent (non-blocking) banner shown inside games when the shop account
// has no Discord linked. Progress still saves server-side via the Muragoods
// account; linking unlocks cross-platform sync, bot visibility and shared
// leaderboards.
export function DiscordNudge({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<'loading' | 'linked' | 'unlinked' | 'signedout'>('loading');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/discord');
        if (res.status === 401) { if (!cancelled) setState('signedout'); return; }
        const data = await res.json();
        if (!cancelled) setState(data.success && data.linked ? 'linked' : 'unlinked');
      } catch {
        if (!cancelled) setState('signedout');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state !== 'unlinked' || dismissed) return null;
  const next = typeof window !== 'undefined' ? window.location.pathname : '/games';
  return (
    <div style={{
      margin: compact ? '0 0 12px' : '0 auto 16px', maxWidth: 560,
      background: 'rgba(88,101,242,0.12)', border: '1px solid rgba(88,101,242,0.45)',
      borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center',
    }}>
      <span style={{ fontSize: 22 }}>🎮</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, color: '#fff', fontSize: 13, fontWeight: 700 }}>Connect Discord to sync everywhere</p>
        <p style={{ margin: '2px 0 0', color: 'var(--cc-text-dim, #b5b5c3)', fontSize: 12 }}>
          Save progress across devices, earn shared achievements, appear on leaderboards and in Murabot.
        </p>
      </div>
      <a
        href={`/api/auth/discord?mode=link&next=${encodeURIComponent(next)}`}
        style={{ background: '#5865F2', color: '#fff', fontWeight: 700, fontSize: 12.5,
                 padding: '9px 14px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap' }}
      >
        Connect Discord
      </a>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss"
        style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 15 }}>✕</button>
    </div>
  );
}
