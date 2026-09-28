'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';

export default function ConnectedAccountsPage() {
  return (
    <Suspense>
      <ConnectedInner />
    </Suspense>
  );
}

function ConnectedInner() {

interface Privacy { gameProfile: string; favorites: string; activity: string; watchHistory: string }

  const router = useRouter();
  const params = useSearchParams();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [discord, setDiscord] = useState<{ username: string; avatar: string; linkedAt: string | null } | null>(null);
  const [privacy, setPrivacy] = useState<Privacy>({ gameProfile: 'public', favorites: 'private', activity: 'private', watchHistory: 'private' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('user')) { router.push('/login'); return; }
    const err = params.get('error');
    const ok = params.get('linked');
    if (err) setMsg(err);
    if (ok) setMsg(`Discord ${ok} connected!`);
    (async () => {
      try {
        const [d, p] = await Promise.all([
          fetch('/api/account/discord').then(r => r.json()),
          fetch('/api/account/privacy').then(r => r.json()),
        ]);
        if (d.success) { setLinked(d.linked); setDiscord(d.discord); }
        if (p.success) setPrivacy(p.privacy);
      } catch { setMsg('Could not load account status.'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = async () => {
    if (!confirm('Disconnect Discord? Your games, progress and favorites stay intact — only the link is removed.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/account/discord/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) { setLinked(false); setDiscord(null); setMsg('Discord disconnected. Your data is intact.'); }
      else setMsg(data.error || 'Disconnect failed.');
    } catch { setMsg('Disconnect failed.'); }
    setBusy(false);
  };

  const savePrivacy = async (key: keyof Privacy, value: string) => {
    const next = { ...privacy, [key]: value };
    setPrivacy(next);
    try {
      const res = await fetch('/api/account/privacy', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json();
      setMsg(data.success ? 'Privacy saved.' : (data.error || 'Save failed.'));
    } catch { setMsg('Save failed.'); }
  };

  const exportData = async () => {
    try {
      const [prog, favs, act] = await Promise.all([
        fetch('/api/games/progress?summary=1').then(r => r.json()),
        fetch('/api/favorites').then(r => r.json()),
        fetch('/api/activity?limit=100').then(r => r.json()),
      ]);
      const blob = new Blob([JSON.stringify({ progress: prog, favorites: favs, activity: act }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'muragoods-data.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { setMsg('Export failed.'); }
  };

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 16, padding: 20, marginBottom: 14,
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="My Muragoods" />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 90px' }}>
        <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>👤 My Muragoods</h1>
        <p style={{ color: '#888', fontSize: 13 }}>One identity: Muragoods → Discord → Games → Murastream → Shop → Murabot.</p>
        {msg && <p style={{ color: '#ffd60a', fontSize: 13 }}>{msg}</p>}

        <div style={card}>
          <h2 style={h2}>🔗 Connected Accounts</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {discord?.avatar
              ? <img src={discord.avatar} alt="" width={44} height={44} style={{ borderRadius: 22 }} />
              : <span style={{ fontSize: 32 }}>🎮</span>}
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fff', fontWeight: 700, margin: 0 }}>
                Discord {linked ? `· @${discord?.username}` : '· not connected'}
              </p>
              <p style={{ color: '#888', fontSize: 12, margin: '2px 0 0' }}>
                {linked && discord?.linkedAt
                  ? `Connected ${new Date(discord.linkedAt).toLocaleDateString()}`
                  : 'Link to sync progress, favorites and achievements everywhere.'}
              </p>
            </div>
            {linked
              ? <button onClick={() => void disconnect()} disabled={busy} style={btn(false)}>Disconnect</button>
              : <a href="/api/auth/discord?mode=link&next=/account/connected" style={{ ...btn(true), textDecoration: 'none' }}>Connect Discord</a>}
          </div>
          <p style={{ color: '#666', fontSize: 12, marginBottom: 0 }}>
            Disconnecting never deletes your games, progress or favorites — it only removes the link.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Link href="/games" style={link}>🎮 Game Center</Link>
            <Link href="/account/my-space" style={link}>⭐ My Space</Link>
            <Link href="/account/profile" style={link}>✏️ Profile</Link>
          </div>
        </div>

        <div style={card}>
          <h2 style={h2}>🔒 Privacy</h2>
          <PrivacyRow label="Game profile" desc="Who can see your level, stats and leaderboard entries" value={privacy.gameProfile}
            options={['public', 'private']} onChange={(v) => void savePrivacy('gameProfile', v)} />
          <PrivacyRow label="Favorites" desc="Who can browse your favorites" value={privacy.favorites}
            options={['public', 'private']} onChange={(v) => void savePrivacy('favorites', v)} />
          <PrivacyRow label="Activity sharing" desc="Who can see your recent activity" value={privacy.activity}
            options={['private', 'friends', 'public']} onChange={(v) => void savePrivacy('activity', v)} />
          <PrivacyRow label="Watch history" desc="Who can see what you watched" value={privacy.watchHistory}
            options={['private', 'public']} onChange={(v) => void savePrivacy('watchHistory', v)} />
        </div>

        <div style={card}>
          <h2 style={h2}>📦 Your data</h2>
          <button onClick={() => void exportData()} style={btn(true)}>Export my game data (JSON)</button>
          <p style={{ color: '#666', fontSize: 12 }}>Orders are financial records and are retained for support even if you delete game data.</p>
        </div>
      </div>
    </main>
  );
}

const h2: React.CSSProperties = { color: '#fff', fontSize: 16, fontWeight: 800, margin: '0 0 12px' };
const link: React.CSSProperties = { color: '#ffd60a', fontSize: 13, fontWeight: 700, textDecoration: 'none' };
const btn = (primary: boolean): React.CSSProperties => ({
  background: primary ? '#5865F2' : 'rgba(255,255,255,0.08)', color: '#fff',
  border: 'none', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
});

function PrivacyRow({ label, desc, value, options, onChange }: {
  label: string; desc: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ flex: 1 }}>
        <p style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: 0 }}>{label}</p>
        <p style={{ color: '#888', fontSize: 12, margin: 0 }}>{desc}</p>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            style={{ background: value === o ? '#ffd60a' : 'rgba(255,255,255,0.07)', color: value === o ? '#111' : '#ccc',
                     border: 'none', fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
