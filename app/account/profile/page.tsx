'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type Order } from '@/app/lib/muragoods-data';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';
import { CoinBalance } from '@/app/components/CoinBalance';
import { useCoins } from '@/app/hooks/useCoins';

interface UserData {
  name?: string;
  email?: string;
}

export default function AccountProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [orders, setOrders] = useState<(Order & { _id?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const { coins } = useCoins();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const userData = JSON.parse(userStr);
    setUser(userData);

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
    fetchOrders();
  }, [router]);

  if (!user) return null;

  const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
  const deliveredCount = orders.filter(o => o.status === 'Delivered').length;
  const pendingCount = orders.filter(o => o.status === 'Pending Payment').length;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="My Profile" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '64rem' }}>
          <PixelDivider variant="ziggurat" />

          {/* Profile Header */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6 sm:p-8 mb-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Avatar */}
              <div className="w-20 h-20 bg-gradient-to-br from-[var(--gold)] to-[var(--gold-dark)] flex items-center justify-center rounded-full border-2 border-[var(--gold-bright)] shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                <span className="text-2xl text-[var(--obsidian)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {(user.name || user.email || 'P').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="text-center sm:text-left">
                <h1 className="text-lg text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {user.name || 'Player'}
                </h1>
                <p className="text-sm text-[var(--pewter)] mt-1">{user.email}</p>
                <div className="mt-3">
                  <CoinBalance size="md" />
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Orders', value: String(orders.length), icon: '📦' },
              { label: 'Delivered', value: String(deliveredCount), icon: '✅' },
              { label: 'Pending', value: String(pendingCount), icon: '⏳' },
              { label: 'Total Spent', value: `₱${totalSpent}`, icon: '💰' },
            ].map(stat => (
              <div key={stat.label} className="power-card p-4 text-center rounded-xl">
                <span className="text-xl">{stat.icon}</span>
                <p className="text-[9px] text-[var(--gold)] uppercase mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>{stat.label}</p>
                <p className="text-lg text-[var(--cream)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Link href="/orders" className="power-card p-5 rounded-xl text-center hover:border-[var(--gold-bright)] transition-all">
              <span className="text-2xl">📋</span>
              <p className="text-[10px] text-[var(--cream)] mt-2 uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>My Orders</p>
            </Link>
            <Link href="/menu" className="power-card p-5 rounded-xl text-center hover:border-[var(--gold-bright)] transition-all">
              <span className="text-2xl">🍕</span>
              <p className="text-[10px] text-[var(--cream)] mt-2 uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Order Menu</p>
            </Link>
            <a href="https://www.instagram.com/muragoods_/" target="_blank" rel="noopener noreferrer" className="power-card p-5 rounded-xl text-center hover:border-[var(--gold-bright)] transition-all">
              <span className="text-2xl">💬</span>
              <p className="text-[10px] text-[var(--cream)] mt-2 uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Contact Us</p>
            </a>
          </div>

          {/* Recent Orders */}
          {loading ? (
            <div className="text-center py-8"><p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>LOADING...</p></div>
          ) : orders.length > 0 ? (
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
              <h2 className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Recent Orders</h2>
              <div className="space-y-3">
                {orders.slice(0, 5).map(order => (
                  <Link key={order.id} href={`/order/${order.id}`} className="flex items-center justify-between p-3 bg-[var(--charcoal-light)] rounded-lg border border-[rgba(242,240,228,0.08)] hover:border-[var(--gold)] transition-all">
                    <div>
                      <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>{String(order.id).slice(-8).toUpperCase()}</p>
                      <p className="text-xs text-[var(--cream-muted)] mt-1">{order.deliveryDate}</p>
                    </div>
                    <div className="text-right">
                      <span className="coin-price text-sm">₱{order.total}</span>
                      <p className="text-[8px] text-[var(--pewter)] mt-1">{order.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
