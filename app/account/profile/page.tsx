'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type Order } from '@/app/lib/muragoods-data';
import { NavBar } from '@/app/components/NavBar';
import { CoinBalance } from '@/app/components/CoinBalance';
import { useCoins } from '@/app/hooks/useCoins';
import { AnimatedProgressBar } from '@/app/components/AnimatedProgressBar';

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

      // Fetch user profile from server to get createdAt
      async function fetchProfile() {
        try {
          const res = await fetch(`/api/admin/users?email=${encodeURIComponent(userData.email)}`);
          if (res.ok) {
            const result = await res.json();
            if (result.success && result.data?.createdAt) {
              setUser(prev => ({ ...prev!, createdAt: result.data.createdAt }));
              // Update localStorage so future loads are instant
              const stored = JSON.parse(localStorage.getItem('user') || '{}');
              if (!stored.createdAt) {
                stored.createdAt = result.data.createdAt;
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
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
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
          <div style={{ position: 'absolute', top: '12px', left: '16px', fontSize: '20px', opacity: 0.3, animation: 'float 3s ease-in-out infinite' }}>⭐</div>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '16px', opacity: 0.25, animation: 'float 3s ease-in-out infinite 0.5s' }}>🪙</div>
          <div style={{ position: 'absolute', bottom: '16px', left: '30px', fontSize: '14px', opacity: 0.2, animation: 'float 3s ease-in-out infinite 1s' }}>🍄</div>
          <div style={{ position: 'absolute', bottom: '20px', right: '40px', fontSize: '12px', opacity: 0.2, animation: 'float 3s ease-in-out infinite 1.5s' }}>✨</div>

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
              }}>📷</div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
            </div>

            {/* Name & Info */}
            <div style={{ textAlign: 'center' }}>
              <h1 style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '16px',
                color: 'var(--mario-yellow)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                textShadow: '2px 2px 0 rgba(0,0,0,0.5)',
              }}>
                {user.name || 'Player'}
              </h1>
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
                <span style={{ fontSize: '12px' }}>🪪</span>
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
              <div style={{ width: '100%', borderTop: '1px solid rgba(255,214,10,0.1)', paddingTop: '16px' }}>
                <p style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '8px',
                  color: 'var(--mario-yellow)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '8px',
                }}>Your Perks</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {perks.map((perk, i) => (
                    <span key={i} style={{
                      fontFamily: 'var(--font-arcade)',
                      fontSize: '8px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: perk.redeemed ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,214,10,0.25)',
                      background: perk.redeemed ? 'rgba(255,255,255,0.03)' : 'rgba(255,214,10,0.1)',
                      color: perk.redeemed ? 'var(--mario-text-muted)' : 'var(--mario-yellow)',
                      opacity: perk.redeemed ? 0.5 : 1,
                    }}>
                      {perk.perkId === 'gold_member' ? '👑 ' : '🏷️ '}{perk.perkName} {perk.redeemed ? '(Used)' : ''}
                    </span>
                  ))}
                </div>
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
            { label: 'Orders', value: String(activeOrders.length), icon: '📦', color: 'var(--mario-text)' },
            { label: 'Delivered', value: String(deliveredCount), icon: '✅', color: 'var(--mario-green)' },
            { label: 'Active', value: String(activeCount), icon: '⏳', color: 'var(--mario-yellow)' },
            { label: 'Spent', value: `₱${totalSpent.toLocaleString()}`, icon: '💰', color: 'var(--mario-yellow)' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: 'var(--mario-bg-card)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '16px 8px',
              textAlign: 'center',
            }}>
              <span style={{ fontSize: '18px' }}>{stat.icon}</span>
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
        <div style={{ marginTop: '24px' }}>
          <p style={{
            fontFamily: 'var(--font-arcade)',
            fontSize: '8px',
            color: 'var(--mario-yellow)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '10px',
          }}>Quick Actions</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { href: '/menu', icon: '🍕', label: 'Order Food' },
              { href: '/points', icon: '🪙', label: 'My Points' },
              { href: '/rewards', icon: '🏪', label: 'Rewards' },
              { href: '/orders', icon: '📋', label: 'Orders' },
              { href: '/support', icon: '💬', label: 'Support' },
              { href: '/favorites', icon: '❤️', label: 'Favorites' },
            ].map(action => (
              <Link key={action.href} href={action.href} style={{
                display: 'block',
                background: 'var(--mario-bg-card)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '16px 8px',
                textAlign: 'center',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,214,10,0.3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              >
                <span style={{ fontSize: '18px' }}>{action.icon}</span>
                <p style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '7px',
                  color: 'var(--mario-text)',
                  marginTop: '6px',
                  textTransform: 'uppercase',
                }}>{action.label}</p>
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
                        {order.status === 'Delivered' ? '✅' : order.status === 'Cancelled' ? '✖' : '📦'}
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
              <span style={{ fontSize: '32px' }}>📦</span>
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
