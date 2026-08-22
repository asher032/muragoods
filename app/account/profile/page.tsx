'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type Order } from '@/app/lib/muragoods-data';
import { NavBar } from '@/app/components/NavBar';
import { CoinBalance } from '@/app/components/CoinBalance';
import { useCoins } from '@/app/hooks/useCoins';

interface UserData {
  name?: string;
  email?: string;
  avatar?: string;
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
  const [orders, setOrders] = useState<(Order & { _id?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState<string>('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState('');
  const [perks, setPerks] = useState<Perk[]>([]);
  const { coins } = useCoins();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const userData = JSON.parse(userStr);
    setUser(userData);
    const savedAvatar = localStorage.getItem('muragoods_avatar');
    if (savedAvatar) setAvatar(savedAvatar);

    async function fetchOrders() {
      try {
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(userData.email)}`);
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          setOrders(result.data.map((o: Order & { _id?: string }) => ({ ...o, id: o._id || o.id })));
        }
      } catch { /* empty */ }
      setLoading(false);
    }

    async function fetchPerks() {
      try {
        const res = await fetch(`/api/perks?email=${encodeURIComponent(userData.email)}`);
        const result = await res.json();
        if (result.success && result.data) {
          setUserId(result.data.userId || '');
          setPerks(result.data.perks || []);
        }
      } catch { /* empty */ }
    }

    fetchOrders();
    fetchPerks();
  }, [router]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB');
      return;
    }
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

  if (!user) return null;

  const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
  const deliveredCount = orders.filter(o => o.status === 'Delivered').length;
  const activeCount = orders.filter(o => !['Cancelled', 'Delivered'].includes(o.status)).length;
  const memberSince = orders.length > 0 ? new Date(orders[orders.length - 1].createdAt).toLocaleDateString('en', { month: 'short', year: 'numeric' }) : 'New';

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="My Profile" />

      {/* Profile Banner + Card */}
      <section className="relative">
        {/* Banner */}
        <div className="h-40 sm:h-52 w-full bg-gradient-to-r from-[var(--gold-dark)] via-[var(--gold)] to-[var(--gold-dark)] relative overflow-hidden">
          {/* Decorative pattern */}
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(10,10,10,0.3) 10px, rgba(10,10,10,0.3) 20px)' }} />
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--obsidian)] to-transparent" />
        </div>

        {/* Profile Card (overlapping banner) */}
        <div className="max-w-4xl mx-auto px-4 sm:px-8 -mt-20 relative z-10">
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6 sm:p-8 shadow-[0_0_30px_rgba(212,175,55,0.1)]">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
              {/* Avatar */}
              <div className="relative group cursor-pointer shrink-0" onClick={() => fileInputRef.current?.click()}>
                {avatar ? (
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-[var(--gold)] shadow-[0_0_25px_rgba(212,175,55,0.4)] overflow-hidden bg-[var(--charcoal-light)]">
                    <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-[var(--gold)] shadow-[0_0_25px_rgba(212,175,55,0.4)] bg-gradient-to-br from-[var(--gold)] to-[var(--gold-dark)] flex items-center justify-center">
                    <span className="text-4xl sm:text-5xl text-[var(--obsidian)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                      {(user.name || user.email || 'P').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 rounded-full bg-[rgba(10,10,10,0.6)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-2 border-[var(--gold)]">
                  <span className="text-[var(--gold)] text-xl">📷</span>
                </div>
                {uploadingAvatar && (
                  <div className="absolute inset-0 rounded-full bg-[rgba(10,10,10,0.8)] flex items-center justify-center">
                    <span className="text-[var(--gold-bright)] animate-pulse text-xs">Uploading...</span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              </div>

              {/* Info */}
              <div className="flex-1 text-center sm:text-left pb-2">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
                    {user.name || 'Player'}
                  </h1>
                  {perks.some(p => p.perkId === 'gold_member') && (
                    <span className="text-lg px-2 py-0.5 bg-gradient-to-r from-[var(--gold)] to-[var(--gold-bright)] text-[var(--obsidian)] rounded-lg text-[8px] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
                      👑 Gold Member
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--pewter)] mt-1">{user.email}</p>
                {userId && (
                  <p className="text-[9px] text-[var(--gold)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>ID: {userId}</p>
                )}
                <div className="mt-3 flex items-center justify-center sm:justify-start gap-3">
                  <CoinBalance size="md" />
                  <span className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>Member since {memberSince}</span>
                </div>
              </div>

              {/* Action */}
              <div className="shrink-0">
                <Link href="/support" className="deco-btn deco-btn-sm deco-btn-dark">
                  💬 Support
                </Link>
              </div>
            </div>

            {/* Perks */}
            {perks.length > 0 && (
              <div className="mt-6 pt-4 border-t-2 border-[rgba(212,175,55,0.15)]">
                <p className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-3" style={{ fontFamily: 'var(--font-arcade)' }}>Your Perks</p>
                <div className="flex flex-wrap gap-2">
                  {perks.map((perk, i) => (
                    <span key={i} className={`text-[8px] px-3 py-1.5 rounded-lg border ${perk.redeemed ? 'border-[var(--pewter)] text-[var(--pewter)] opacity-60' : 'border-[var(--gold)] bg-[rgba(212,175,55,0.1)] text-[var(--gold-bright)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                      {perk.perkId === 'gold_member' ? '👑 ' : perk.perkId === 'priority_order' ? '⚡ ' : perk.perkId === 'mystery_upgrade' ? '🎁 ' : perk.perkId === 'custom_shoutout' ? '📱 ' : '🏷️ '}{perk.perkName} {perk.redeemed ? '(Used)' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-8 mt-8 pb-16">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Orders', value: String(orders.length), icon: '📦', color: 'var(--cream)' },
              { label: 'Delivered', value: String(deliveredCount), icon: '✅', color: 'var(--emerald-bright)' },
              { label: 'Active', value: String(activeCount), icon: '⏳', color: 'var(--gold-bright)' },
              { label: 'Total Spent', value: `₱${totalSpent.toLocaleString()}`, icon: '💰', color: 'var(--gold)' },
            ].map(stat => (
              <div key={stat.label} className="power-card p-5 text-center rounded-xl hover:shadow-[0_0_20px_rgba(212,175,55,0.15)] transition-all">
                <span className="text-2xl">{stat.icon}</span>
                <p className="text-[9px] text-[var(--pewter)] uppercase mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>{stat.label}</p>
                <p className="text-lg mt-1" style={{ fontFamily: 'var(--font-arcade)', color: stat.color }}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div>
            <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-3" style={{ fontFamily: 'var(--font-arcade)' }}>Quick Actions</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { href: '/menu', icon: '🍕', label: 'Order Food' },
                { href: '/points', icon: '🪙', label: 'My Points' },
                { href: '/rewards', icon: '🏪', label: 'Rewards Shop' },
                { href: '/orders', icon: '📋', label: 'Order History' },
                { href: '/achievements', icon: '🏆', label: 'Achievements' },
                { href: '/support', icon: '💬', label: 'Support' },
              ].map(action => (
                <Link key={action.href} href={action.href} className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] p-4 rounded-xl text-center hover:border-[var(--gold)] hover:bg-[rgba(212,175,55,0.05)] transition-all">
                  <span className="text-xl">{action.icon}</span>
                  <p className="text-[9px] text-[var(--cream)] mt-2 uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>{action.label}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Orders */}
          {loading ? (
            <div className="text-center py-8"><p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>LOADING...</p></div>
          ) : orders.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>Recent Orders</p>
                <Link href="/orders" className="text-[9px] text-[var(--gold)] hover:text-[var(--gold-bright)] transition-colors" style={{ fontFamily: 'var(--font-arcade)' }}>VIEW ALL →</Link>
              </div>
              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl overflow-hidden">
                {orders.slice(0, 5).map((order, idx) => (
                  <Link key={order.id} href={`/order/${order.id}`} className={`flex items-center justify-between p-4 hover:bg-[var(--charcoal-light)] transition-all ${idx > 0 ? 'border-t border-[rgba(212,175,55,0.1)]' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--charcoal-light)] border border-[rgba(212,175,55,0.15)] flex items-center justify-center">
                        <span className="text-sm">
                          {order.status === 'Delivered' ? '✅' : order.status === 'Cancelled' ? '✖' : order.status === 'Preparing' ? '🍳' : '📦'}
                        </span>
                      </div>
                      <div>
                        <p className="text-[9px] text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>#{String(order.id).slice(-8).toUpperCase()}</p>
                        <p className="text-xs text-[var(--pewter)] mt-0.5">{order.deliveryDate}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="coin-price text-sm">₱{order.total}</span>
                      <p className={`text-[8px] mt-1 uppercase ${order.status === 'Cancelled' ? 'text-[var(--crimson)]' : order.status === 'Delivered' ? 'text-[var(--emerald-bright)]' : 'text-[var(--pewter)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>{order.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl p-8 text-center">
              <span className="text-3xl">📦</span>
              <p className="text-sm text-[var(--cream)] mt-3" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>NO ORDERS YET</p>
              <p className="text-xs text-[var(--pewter)] mt-1">Your order history will appear here</p>
              <Link href="/menu" className="deco-btn deco-btn-gold rounded-xl mt-4 inline-block">Start Ordering</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
