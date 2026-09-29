'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';
import { useAuth } from '@/app/contexts/AuthContext';

// ── Canonical Muragoods profile ──────────────────────────────────────────
// ONE page, ONE user record (/api/me) for the whole ecosystem: shop,
// Murastream, games, letters, rewards and the Murabot dashboard all read
// this same identity. Product-specific pages are views — never second
// profiles.

interface MeResponse {
  success: boolean;
  authenticated: boolean;
  linked?: boolean;
  user?: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    avatar: string;
    bio: string;
    role: string;
    coins: number;
    perks: number;
    memberSince: string | null;
    discord: { connected: boolean; userId: string | null; username: string | null; avatar: string };
  };
  discord?: { connected: boolean; userId: string; username: string };
  connectUrl?: string;
  muragoods?: { orders: { count: number; totalSpent: number } };
  murastream?: { watchlist: number; likes: number; history: number; favorites: number };
  games?: { gamesPlayed: number; totalXp: number; achievements: number };
  letters?: { letters: number };
  error?: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="deco-container" style={{ maxWidth: '72rem', marginTop: 16, padding: 20 }}>
      <h2 className="text-lg text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
        {title}
      </h2>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ minWidth: 110, flex: '1 1 110px' }}>
      <div className="text-2xl text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
        {value}
      </div>
      <div className="text-xs uppercase" style={{ color: 'var(--muted, #9a8c6a)' }}>
        {label}
      </div>
    </div>
  );
}

function RowLink({ href, label, sub }: { href: string; label: string; sub?: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        color: 'var(--cream)', textDecoration: 'none',
      }}
    >
      <span>
        <span style={{ display: 'block', fontWeight: 600 }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, opacity: 0.65 }}>{sub}</span>}
      </span>
      <span aria-hidden>→</span>
    </Link>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { state, logout, refresh } = useAuth();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/me', { cache: 'no-store', signal: controller.signal });
      const body = (await res.json().catch(() => null)) as MeResponse | null;
      if (id !== requestId.current) return;
      if (!body || !body.success) {
        setError(body && 'error' in body && body.error ? String(body.error) : 'Could not load profile');
        setData(null);
      } else {
        setData(body);
      }
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof DOMException && err.name === 'AbortError' ? 'Profile request timed out — retry.' : 'Network error');
      setData(null);
    } finally {
      clearTimeout(timer);
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (state === 'authenticated' || state === 'error') void load();
    return () => { requestId.current += 1; };
  }, [state, load, router]);

  const save = async () => {
    const name = nameDraft.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 40) {
      setSaveError('Name must be 2–40 characters');
      return;
    }
    if (bioDraft.trim().length > 200) {
      setSaveError('Bio must be under 200 characters');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bio: bioDraft.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (body?.success) {
        setEditing(false);
        await refresh(); // AuthContext + every consumer sees the new name
        await load();
      } else {
        setSaveError(body?.error || 'Save failed');
      }
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await logout(); // server clears shop + Discord sessions: one logout, everywhere
    router.push('/');
  };

  const uploadAvatar = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setSaveError('Image too large — pick one under 2MB');
      return;
    }
    setAvatarBusy(true);
    setSaveError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: dataUrl }),
      });
      const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (body?.success) {
        await refresh();
        await load();
      } else {
        setSaveError(body?.error || 'Avatar upload failed');
      }
    } catch {
      setSaveError('Avatar upload failed');
    } finally {
      setAvatarBusy(false);
    }
  };

  if (state === 'checking' || (loading && !data && !error)) {
    return (
      <main className="min-h-screen">
        <NavBar pageLabel="Profile" />
        <p className="text-center" style={{ padding: 60, color: 'var(--cream)' }}>LOADING PROFILE…</p>
      </main>
    );
  }

  if (error || !data?.authenticated) {
    return (
      <main className="min-h-screen">
        <NavBar pageLabel="Profile" />
        <div className="deco-container" style={{ maxWidth: '36rem', margin: '40px auto', padding: 32, textAlign: 'center' }}>
          <h1 className="text-xl text-[var(--cream)]">Couldn&apos;t load your profile</h1>
          <p style={{ opacity: 0.7, margin: '8px 0 20px' }}>{error || 'Sign in to view your profile.'}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button type="button" className="deco-btn" onClick={() => void load()}>Retry</button>
            <Link className="deco-btn" href="/login">Sign in</Link>
          </div>
        </div>
      </main>
    );
  }

  // Discord-only visitor: no Muragoods account yet — explicit link, no duplicate.
  if (data.linked === false || !data.user) {
    return (
      <main className="min-h-screen">
        <NavBar pageLabel="Profile" />
        <div className="deco-container" style={{ maxWidth: '36rem', margin: '40px auto', padding: 32, textAlign: 'center' }}>
          <h1 className="text-xl text-[var(--cream)]">Connect your Muragoods account</h1>
          <p style={{ opacity: 0.7, margin: '8px 0 20px' }}>
            Signed in with Discord as <strong>@{data.discord?.username}</strong>, but no Muragoods account is
            linked yet. Link one to use a single profile everywhere — nothing is created automatically.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link className="deco-btn" href="/login">Sign in</Link>
            <Link className="deco-btn" href={data.connectUrl || '/api/auth/discord?mode=link'}>Link Discord</Link>
          </div>
        </div>
      </main>
    );
  }

  const u = data.user;
  const ms = data.murastream || { watchlist: 0, likes: 0, history: 0, favorites: 0 };
  const g = data.games || { gamesPlayed: 0, totalXp: 0, achievements: 0 };
  const mo = data.muragoods?.orders || { count: 0, totalSpent: 0 };

  return (
    <main className="min-h-screen" style={{ paddingBottom: 80 }}>
      <NavBar pageLabel="Profile" />

      {/* Identity header — the ONE profile */}
      <section className="deco-container" style={{ maxWidth: '72rem', marginTop: 24, padding: 24 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            aria-label="Avatar"
            style={{
              width: 84, height: 84, borderRadius: '50%', flexShrink: 0,
              background: u.avatar ? `url(${u.avatar}) center/cover` : 'var(--gold-dark)',
              display: 'grid', placeItems: 'center', fontSize: 32, color: '#fff',
            }}
          >
            {!u.avatar && (u.username?.charAt(0)?.toUpperCase() || '?')}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            aria-label="Upload avatar"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void uploadAvatar(f);
            }}
          />
          <div style={{ flex: '1 1 220px' }}>
            {editing ? (
              <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={40}
                  placeholder="Display name"
                  style={{ padding: 8, borderRadius: 8 }}
                  aria-label="Display name"
                />
                <input
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  maxLength={200}
                  placeholder="Bio (under 200 characters)"
                  style={{ padding: 8, borderRadius: 8 }}
                  aria-label="Bio"
                />
                {saveError && <span style={{ color: '#ff8a8a', fontSize: 12 }}>{saveError}</span>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="deco-btn deco-btn-sm" onClick={() => void save()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="deco-btn deco-btn-sm" onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl text-[var(--cream)]" style={{ margin: 0 }}>{u.displayName}</h1>
                <p style={{ margin: '4px 0', opacity: 0.7, fontSize: 13 }}>{u.email}</p>
                {u.bio && <p style={{ margin: '4px 0 0', fontSize: 14 }}>{u.bio}</p>}
                <button
                  type="button"
                  className="deco-btn deco-btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => { setNameDraft(u.username); setBioDraft(u.bio); setSaveError(''); setEditing(true); }}
                >
                  Edit profile
                </button>
                <button
                  type="button"
                  className="deco-btn deco-btn-sm"
                  style={{ marginTop: 8, marginLeft: 8 }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy}
                >
                  {avatarBusy ? 'Uploading…' : 'Change avatar'}
                </button>
                {saveError && !editing && (
                  <span style={{ display: 'block', color: '#ff8a8a', fontSize: 12, marginTop: 6 }}>{saveError}</span>
                )}
              </>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div>
              {u.discord.connected ? (
                <span>🟢 Discord connected{u.discord.username ? ` (@${u.discord.username})` : ''}</span>
              ) : (
                <Link href="/api/auth/discord?mode=link">Connect Discord</Link>
              )}
            </div>
            <div style={{ opacity: 0.65, marginTop: 4 }}>ID: {u.id}</div>
          </div>
        </div>
      </section>

      <Section title="Account">
        <RowLink href="/account/connected" label="Connected accounts" sub="Discord link, disconnect, reconnect" />
        <RowLink href="/account/my-space" label="Account settings & security" sub="Preferences, privacy, password" />
      </Section>

      <Section title="Muragoods — orders · rewards · points">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
          <Stat label="Orders" value={mo.count} />
          <Stat label="Total spent ₱" value={mo.totalSpent.toLocaleString()} />
          <Stat label="Coins" value={u.coins.toLocaleString()} />
          <Stat label="Perks" value={u.perks} />
        </div>
        <RowLink href="/account/orders" label="My orders" sub={`${mo.count} orders`} />
        <RowLink href="/rewards" label="Rewards & points" sub={`${u.coins.toLocaleString()} coins`} />
        <RowLink href="/support" label="Support tickets" sub="Help and order issues" />
      </Section>

      <Section title="Murastream — watchlist · favorites · history">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
          <Stat label="Watchlist" value={ms.watchlist} />
          <Stat label="Favorites" value={ms.favorites} />
          <Stat label="Likes" value={ms.likes} />
          <Stat label="Watched" value={ms.history} />
        </div>
        <RowLink href="/murastream" label="Open Murastream" sub="Same profile, same lists" />
        <RowLink href="/murastream/my-list" label="My watchlist" sub={`${ms.watchlist} saved`} />
      </Section>

      <Section title="Games — progress · achievements · scores">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
          <Stat label="Games played" value={g.gamesPlayed} />
          <Stat label="Total XP" value={g.totalXp.toLocaleString()} />
          <Stat label="Achievements" value={g.achievements} />
        </div>
        <RowLink href="/games" label="Open Game Center" sub="Progress follows this profile" />
        <RowLink href="/achievements" label="Achievements" sub={`${g.achievements} unlocked`} />
      </Section>

      <Section title="Letters">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
          <Stat label="Letters written" value={data.letters?.letters || 0} />
        </div>
        <RowLink href="/untold-words" label="Untold Words" sub="Letters tied to this account" />
      </Section>

      <Section title="Murabot — Discord">
        <RowLink
          href="/dashboard"
          label="Open Murabot dashboard"
          sub={u.discord.connected ? `Discord linked (@${u.discord.username || 'connected'})` : 'Connect Discord to manage servers'}
        />
        <RowLink href="/account/connected" label="Discord connection" sub={u.discord.connected ? 'Manage or reconnect' : 'Not connected'} />
      </Section>

      <div style={{ maxWidth: '72rem', margin: '24px auto 0', textAlign: 'center' }}>
        <button type="button" className="deco-btn" onClick={() => void signOut()}>
          Log out everywhere
        </button>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
          One logout signs you out of Muragoods, Murastream, games and the Murabot dashboard.
        </p>
      </div>
    </main>
  );
}
