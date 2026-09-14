'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type Order } from '@/app/lib/muragoods-data';
import { NavBar } from '@/app/components/NavBar';
import { Icon } from '@/app/components/Icon';
import { CoinBalance } from '@/app/components/CoinBalance';
import { useCoins } from '@/app/hooks/useCoins';
import { AnimatedProgressBar } from '@/app/components/AnimatedProgressBar';
import { Camera, CircleCheck, CircleX, Cloudy, Coins, Crown, Hourglass, IdCard, Package, Pencil, Sparkles, Star, Tag, Wallet, X } from 'lucide-react';
interface UserData {
  name?: string;
  email?: string;
  avatar?: string;
  userId?: string;
  createdAt?: string;
}

interface Perk {
  perkId: string;
  perkName: string;
  perkDescription: string;
  addedBy: string;
  addedAt: string;
  redeemed: boolean;
}

export default function AccountProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState<string>('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState('');
  const [perks, setPerks] = useState<Perk[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const { coins: localCoins } = useCoins();
  const [serverCoins, setServerCoins] = useState<number | null>(null);
  const displayIdRef = useRef('');

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) { router.push('/login'); return; }
      const userData = JSON.parse(userStr);
      setUser(userData);
      const savedAvatar = localStorage.getItem('muragoods_avatar');
      if (savedAvatar) setAvatar(savedAvatar);
      if (userData.userId) setUserId(userData.userId);

      // Fetch profile from the account API — server avatar wins over the
      // localStorage cache so a saved avatar follows the user across devices.
      async function fetchAccount() {
        try {
          const res = await fetch(`/api/account/profile?email=${encodeURIComponent(userData.email)}`);
          if (!res.ok) return;
          const result = await res.json();
          if (result.success && result.data) {
            if (result.data.avatar) {
              setAvatar(result.data.avatar);
              localStorage.setItem('muragoods_avatar', result.data.avatar);
            }
            if (result.data.userId) {
              setUserId(prev => prev || result.data.userId);
              const stored = JSON.parse(localStorage.getItem('user') || '{}');
              if (!stored.userId) {
                stored.userId = result.data.userId;
                localStorage.setItem('user', JSON.stringify(stored));
              }
            }
          }
        } catch { /* empty */ }
      }
      void fetchAccount();

      // Fetch user profile from server to get createdAt
      async function fetchProfile() {
        try {
          const res = await fetch(`/api/admin/users?email=${encodeURIComponent(userData.email)}`);
          if (res.ok) {
            const result = await res.json();
            if (result.success && (result.data?.createdAt || result.data?.joinedAt)) {
              const date = result.data.createdAt || result.data.joinedAt;
              setUser(prev => ({ ...prev!, createdAt: date }));
              // Update localStorage so future loads are instant
              const stored = JSON.parse(localStorage.getItem('user') || '{}');
              if (!stored.createdAt) {
                stored.createdAt = date;
                localStorage.setItem('user', JSON.stringify(stored));
              }
            }
          }
        } catch { /* empty */ }
      }

      // Fetch coin balance from server
      async function fetchCoinBalance() {
        try {
          const res = await fetch(`/api/admin/coins?email=${encodeURIComponent(userData.email)}`);
          if (res.ok) {
            const result = await res.json();
            if (result.success && result.data?.coinBalance !== undefined) {
              setServerCoins(result.data.coinBalance);
            }
          }
        } catch { /* empty */ }
      }

      async function fetchOrders() {
        try {
          const res = await fetch(`/api/orders?userId=${encodeURIComponent(userData.email)}`);
          const result = await res.json();
          if (result.success && Array.isArray(result.data)) {
            setOrders(result.data.map((o: any) => ({ ...o, id: o._id || o.id })));
          }
        } catch { /* empty */ }
        setLoading(false);
      }

      async function fetchPerks() {
        try {
          const res = await fetch(`/api/perks?email=${encodeURIComponent(userData.email)}`);
          const result = await res.json();
          if (result.success && result.data) {
            if (result.data.userId) {
              setUserId(result.data.userId);
              const stored = JSON.parse(localStorage.getItem('user') || '{}');
              if (!stored.userId) {
                stored.userId = result.data.userId;
                localStorage.setItem('user', JSON.stringify(stored));
              }
            }
            setPerks(result.data.perks || []);
          }
        } catch { /* empty */ }
      }

      fetchOrders();
      fetchPerks();
      fetchCoinBalance();
      fetchProfile();
    } catch {
      setLoading(false);
    }
  }, [router]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return; }
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatar(dataUrl);
      localStorage.setItem('muragoods_avatar', dataUrl);
      // Persist to the server so the avatar follows the account (best effort).
      fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email, avatar: dataUrl }),
      }).catch(() => { /* offline — stays local */ });
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
  };

  const saveName = async () => {
    const name = nameDraft.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 40) {
      setNameError('Name must be 2–40 characters');
      return;
    }
    setNameSaving(true); setNameError('');
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email, name }),
      });
      const result = await res.json();
      if (result.success) {
        setUser(prev => (prev ? { ...prev, name } : prev));
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        stored.name = name;
        localStorage.setItem('user', JSON.stringify(stored));
        setEditingName(false);
      } else {
        setNameError(result.error || 'Could not save name');
      }
    } catch {
      setNameError('Could not save name — check your connection');
    } finally {
      setNameSaving(false);
    }
  };

  const memberSince = useMemo(() => {
    // First try user's own createdAt from DB
    if (user?.createdAt) {
      const d = new Date(user.createdAt);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('en', { month: 'short', year: 'numeric' });
    }
    // Fallback: earliest order date
    if (orders.length === 0) return 'N/A';
    for (let i = orders.length - 1; i >= 0; i--) {
      const raw = orders[i].createdAt || orders[i].created;
      if (!raw) continue;
      let d: Date;
      if (typeof raw === 'object' && raw !== null && '$date' in raw) d = new Date(raw.$date);
      else d = new Date(String(raw));
      if (!isNaN(d.getTime())) return d.toLocaleDateString('en', { month: 'short', year: 'numeric' });
    }
    return 'N/A';
  }, [orders, user]);

  const displayId = useMemo(() => {
    if (userId) return userId;
    if (!displayIdRef.current && user?.email) {
      displayIdRef.current = 'MG-' + user.email.split('@')[0].toUpperCase().slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    }
    return displayIdRef.current || 'N/A';
  }, [userId, user]);

  if (loading) {
    return (
      <main className="min-h-screen" style={{ background: 'var(--mario-bg)' }}>
        <NavBar pageLabel="My Profile" />
        <div className="flex items-center justify-center py-32">
          <p className="text-sm animate-pulse" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--mario-yellow)' }}>LOADING PROFILE...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen" style={{ background: 'var(--mario-bg)' }}>
        <NavBar pageLabel="My Profile" />
        <div className="flex items-center justify-center py-32">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--mario-text)', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Please log in to view your profile</p>
            <Link href="/login" className="mario-btn mario-btn-yellow mario-btn-sm" style={{ marginTop: '12px' }}>Login</Link>
          </div>
        </div>
      </main>
    );
  }

  const activeOrders = orders.filter((o: any) => o.status !== 'Cancelled');
  const totalSpent = activeOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
  const deliveredCount = activeOrders.filter((o: any) => o.status === 'Delivered').length;
  const activeCount = activeOrders.filter((o: any) => !['Delivered'].includes(o.status)).length;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }} className="page-enter">
      <NavBar pageLabel="My Profile" />

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 16px' }}>
        {/* Hero Header */}
        <div style={{
          marginTop: '24px',
          borderRadius: '20px',
          overflow: 'hidden',
          position: 'relative',
          background: 'linear-gradient(135deg, #1a0a3e 0%, #0f0f1a 50%, #0a1a2e 100%)',
          border: '1px solid rgba(255,214,10,0.15)',
          padding: '32px 20px 24px',
          textAlign: 'center',
        }}>
          {/* Floating decorative elements */}
          <div style={{ position: 'absolute', top: '12px', left: '16px', fontSize: '20px', opacity: 0.3, animation: 'float 3s ease-in-out infinite' }}><Star color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></div>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '16px', opacity: 0.25, animation: 'float 3s ease-in-out infinite 0.5s' }}><Coins color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></div>
          <div style={{ position: 'absolute', bottom: '16px', left: '30px', fontSize: '14px', opacity: 0.2, animation: 'float 3s ease-in-out infinite 1s' }}><Cloudy className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></div>
          <div style={{ position: 'absolute', bottom: '20px', right: '40px', fontSize: '12px', opacity: 0.2, animation: 'float 3s ease-in-out infinite 1.5s' }}><Sparkles color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></div>

          {/* Glow */}
          <div style={{ position: 'absolute', top: '30%', left: '50%', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,214,10,0.08), transparent 70%)', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />

          {/* Profile Card Inner */}
          <div className="profile-card" style={{ marginTop: 0 }}>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            {/* Avatar */}
            <div
              className="group"
              style={{ cursor: 'pointer', position: 'relative' }}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatar ? (
                <div style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50%',
                  border: '3px solid var(--mario-yellow)',
                  overflow: 'hidden',
                  boxShadow: '0 0 20px rgba(255,214,10,0.2)',
                }}>
                  <img src={avatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50%',
                  border: '3px solid var(--mario-yellow)',
                  background: 'linear-gradient(135deg, var(--mario-yellow), var(--mario-orange))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(255,214,10,0.2)',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-arcade)',
                    fontSize: '32px',
                    color: 'var(--mario-bg)',
                  }}>
                    {(user.name || user.email || 'P').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div style={{
                position: 'absolute',
                bottom: '2px',
                right: '2px',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--mario-yellow)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}><Camera className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
            </div>

            {/* Name & Info */}
            <div style={{ textAlign: 'center' }}>
              {editingName ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <input
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') setEditingName(false); }}
                    autoFocus
                    maxLength={40}
                    aria-label="Display name"
                    style={{
                      background: 'var(--mario-bg-input)', border: '1px solid rgba(255,214,10,0.4)',
                      borderRadius: 8, color: 'var(--mario-text)', padding: '8px 12px',
                      fontFamily: 'var(--font-arcade)', fontSize: 12, textAlign: 'center',
                      width: 240, outline: 'none',
                    }}
                  />
                  {nameError && <p style={{ fontSize: 11, color: 'var(--mario-red)', margin: 0 }}>{nameError}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => void saveName()} disabled={nameSaving} style={{
                      background: 'var(--mario-yellow)', color: 'var(--mario-bg)', border: 'none',
                      borderRadius: 6, padding: '6px 14px', cursor: nameSaving ? 'wait' : 'pointer',
                      fontFamily: 'var(--font-arcade)', fontSize: 9,
                    }}>{nameSaving ? 'SAVING…' : 'SAVE'}</button>
                    <button onClick={() => setEditingName(false)} style={{
                      background: 'transparent', color: 'var(--mario-text-muted)',
                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                      padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: 9,
                    }}>CANCEL</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setNameDraft(user.name || ''); setNameError(''); setEditingName(true); }}
                  title="Click to edit your display name"
                  aria-label="Edit display name"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <h1 style={{
                    fontFamily: 'var(--font-arcade)',
                    fontSize: '16px',
                    color: 'var(--mario-yellow)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    textShadow: '2px 2px 0 rgba(0,0,0,0.5)',
                    margin: 0,
                  }}>
                    {user.name || 'Player'}
                  </h1>
                  <span style={{ display: 'inline-flex', opacity: 0.55 }}><Pencil size={12} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
                </button>
              )}
              <p style={{ color: 'var(--mario-text-muted)', fontSize: '13px', marginTop: '4px' }}>
                {user.email}
              </p>
              <div style={{
                marginTop: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                background: 'rgba(255,214,10,0.1)',
                border: '1px solid rgba(255,214,10,0.2)',
                borderRadius: '8px',
              }}>
                <span style={{ fontSize: '12px' }}><IdCard className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
                <span style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '9px',
                  color: 'var(--mario-yellow)',
                }}>
                  ID: {displayId}
                </span>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <CoinBalance count={serverCoins !== null ? serverCoins : localCoins} size="md" />
                <span style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '8px',
                  color: 'var(--mario-text-muted)',
                }}>
                  Member since {memberSince}
                </span>
              </div>
            </div>

            {/* Perks */}
            {perks.length > 0 && (
              <div className="w-full border-t border-white/10 pt-4 mt-4">
                <p className="font-arcade text-[10px] text-mario-yellow uppercase tracking-widest mb-3">Your Perks</p>
                <div className="flex flex-wrap gap-2">
                  {perks.map((perk, i) => (
                    <button key={i} onClick={async () => {
                      if (!confirm(`Remove perk "${perk.perkName}"?`)) return;
                      try {
                        await fetch(`/api/perks?email=${encodeURIComponent(user?.email || '')}&perkId=${perk.perkId}`, { method: 'DELETE' });
                        setPerks(prev => prev.filter(p => p.perkId !== perk.perkId));
                      } catch { /* empty */ }
                    }}
                    className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-arcade text-[9px] transition-all ${
                      perk.redeemed
                        ? 'border-white/10 bg-white/3 text-mario-text-muted opacity-50 cursor-default'
                        : 'border-mario-yellow/30 bg-mario-yellow/10 text-mario-yellow hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 cursor-pointer'
                    }`}
                    title={perk.redeemed ? 'Already used' : 'Click to remove'}>
                      {perk.perkId === 'gold_member' ? <Crown color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> : <Tag className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />}
                      <span>{perk.perkName}</span>
                      {perk.redeemed ? <span className="text-[7px] opacity-60">(Used)</span> : <span className="text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"><X className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>}
                    </button>
                  ))}
                </div>
                <p className="text-[8px] text-mario-text-muted mt-2">Tap a perk to remove it</p>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          marginTop: '20px',
        }}>
          {[
            { label: 'Orders', value: String(activeOrders.length), icon: <Icon name="box" size={16} />, color: 'var(--mario-text)' },
            { label: 'Delivered', value: String(deliveredCount), icon: <CircleCheck color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color:'var(--mario-green)' },
            { label: 'Active', value: String(activeCount), icon: <Hourglass color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color: 'var(--mario-yellow)' },
            { label: 'Spent', value: `₱${totalSpent.toLocaleString()}`, icon: <Wallet color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color:'var(--mario-yellow)' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: 'var(--mario-bg-card)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '16px 8px',
              textAlign: 'center',
            }}>
              {stat.icon}
              <p style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '7px',
                color: 'var(--mario-text-muted)',
                textTransform: 'uppercase',
                marginTop: '6px',
              }}>{stat.label}</p>
              <p style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '12px',
                color: stat.color,
                marginTop: '4px',
              }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-6">
          <p className="font-arcade text-[10px] text-mario-yellow uppercase tracking-widest mb-3">Quick Actions</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { href: '/menu', icon: <Icon name="food" size={22} />, label: 'Order Food', color: '#06d6a0' },
              { href: '/points', icon: <Icon name="coin" size={22} />, label: 'My Points', color: '#ffd60a' },
              { href: '/rewards', icon: <Icon name="gift" size={22} />, label: 'Rewards', color: '#4895ef' },
              { href: '/orders', icon: <Icon name="box" size={22} />, label: 'My Orders', color: '#e63946' },
              { href: '/support', icon: <Icon name="chat" size={22} />, label: 'Support', color: '#c896ff' },
              { href: '/favorites', icon: <Icon name="heart" size={22} color="#e63946" />, label: 'Favorites', color: '#ff006e' },
            ].map(action => (
              <Link key={action.href} href={action.href} className="group block text-center p-4 rounded-xl border border-white/8 bg-mario-bg-card hover:border-white/20 hover:bg-white/5 transition-all duration-200">
                <div className="flex justify-center mb-2 group-hover:scale-110 transition-transform">
                  {action.icon}
                </div>
                <p className="font-arcade text-[9px] text-mario-text group-hover:text-mario-yellow transition-colors uppercase leading-tight">{action.label}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Orders */}
        <div style={{ marginTop: '24px', paddingBottom: '60px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <p style={{
              fontFamily: 'var(--font-arcade)',
              fontSize: '8px',
              color: 'var(--mario-yellow)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>Recent Orders</p>
            {orders.length > 0 && (
              <Link href="/orders" style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '8px',
                color: 'var(--mario-yellow)',
                textDecoration: 'none',
              }}>VIEW ALL →</Link>
            )}
          </div>
          {orders.length > 0 ? (
            <div style={{
              background: 'var(--mario-bg-card)',
              border: '1px solid rgba(255,214,10,0.15)',
              borderRadius: '16px',
              overflow: 'hidden',
            }}>
              {orders.slice(0, 5).map((order: any, idx: number) => (
                <Link key={order.id || idx} href={`/order/${order.id}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  textDecoration: 'none',
                  borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'var(--mario-bg-input)',
                      border: '1px solid rgba(255,214,10,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: '14px' }}>
                        {order.status === 'Delivered' ? <CircleCheck color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> : order.status ==='Cancelled' ? <CircleX color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> : <Package className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />}
                      </span>
                    </div>
                    <div>
                      <p style={{
                        fontFamily: 'var(--font-arcade)',
                        fontSize: '8px',
                        color: 'var(--mario-yellow)',
                      }}>#{String(order.id || '').slice(-8).toUpperCase()}</p>
                      <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)', marginTop: '2px' }}>
                        {order.deliveryDate || '—'}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontFamily: 'var(--font-arcade)',
                      fontSize: '12px',
                      color: 'var(--mario-yellow)',
                    }}>₱{order.total}</span>
                    <p style={{
                      fontFamily: 'var(--font-arcade)',
                      fontSize: '7px',
                      marginTop: '2px',
                      textTransform: 'uppercase',
                      color: order.status === 'Cancelled' ? 'var(--mario-red)' : order.status === 'Delivered' ? 'var(--mario-green)' : 'var(--mario-text-muted)',
                    }}>{order.status}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{
              background: 'var(--mario-bg-card)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '40px 20px',
              textAlign: 'center',
            }}>
              <span style={{ fontSize: '32px' }}><Package className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
              <p style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '10px',
                color: 'var(--mario-text)',
                marginTop: '12px',
              }}>NO ORDERS YET</p>
              <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginTop: '6px' }}>
                Your order history will appear here
              </p>
              <Link href="/menu" className="mario-btn mario-btn-yellow mario-btn-sm" style={{ marginTop: '16px', display: 'inline-flex' }}>
                Start Ordering
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
