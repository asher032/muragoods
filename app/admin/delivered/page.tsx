'use client';

import { type Order } from '@/app/lib/muragoods-data';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/contexts/AuthContext';
import { CircleCheck, Coins } from 'lucide-react';

type StatusEntry = { status: string; timestamp: string | number | Date };
type AdminOrder = Order & { userId: string; _id?: string; coinsAwarded?: boolean; statusHistory?: StatusEntry[] };

// Admin — Delivered Orders history. Orders whose status is 'Delivered' move
// here from the Live Order Feed so the dashboard only shows work in progress.
export default function AdminDeliveredPage() {
  const { user, isAdmin } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [orders, setOrders] = useState<AdminOrder[]>([]);

  useEffect(() => {
    if (isAdmin && user) setIsAuthenticated(true);
  }, [isAdmin, user]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?isAdmin=true');
      const result = await res.json();
      if (result.success) {
        setOrders((result.data as AdminOrder[]).filter(o => o.status === 'Delivered'));
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchOrders();
  }, [isAuthenticated, fetchOrders]);

  const stats = useMemo(() => {
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const coins = orders.reduce((sum, o) => sum + (o.pointsEarned || 0), 0);
    return { count: orders.length, revenue, coins };
  }, [orders]);

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md border-2 border-[var(--gold)] bg-[var(--charcoal)] p-8 rounded-2xl text-center">
          <h1 className="text-lg text-[var(--cream)] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>ADMIN ACCESS</h1>
          <p className="text-sm text-[var(--pewter)] mb-6">Sign in with an admin account to view delivered orders.</p>
          <a href="/login" className="deco-btn deco-btn-crimson w-full inline-block">GO TO LOGIN</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8">
      <div className="deco-container">
        <header className="mb-8 flex flex-col gap-4 border-2 border-[var(--gold)] bg-[var(--charcoal)] p-6 md:flex-row md:items-center md:justify-between rounded-2xl">
          <div>
            <p className="text-[11px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>Admin</p>
            <h1 className="mt-2 text-xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Delivered Orders</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/admin" className="deco-btn deco-btn-sm">Back to Dashboard</Link>
          </div>
        </header>

        {/* Summary */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="power-card p-5 rounded-xl">
            <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>Delivered Orders</p>
            <p className="mt-3 text-xl" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--gold-bright)' }}>{stats.count}</p>
          </div>
          <div className="power-card p-5 rounded-xl">
            <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>Total Revenue</p>
            <p className="mt-3 text-xl" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--emerald-bright)' }}>₱{stats.revenue}</p>
          </div>
          <div className="power-card p-5 rounded-xl">
            <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>Coins Awarded</p>
            <p className="mt-3 text-xl" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--gold-bright)' }}>{stats.coins}</p>
          </div>
        </section>

        {/* Table */}
        <section className="mt-8 border-2 border-[var(--gold)] bg-[var(--charcoal)] p-6 rounded-2xl">
          <h2 className="text-sm text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>History</h2>
          {orders.length === 0 ? (
            <div className="mt-6 text-center py-12">
              <CircleCheck size={28} color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />
              <p className="mt-3 text-sm text-[var(--pewter)]">No delivered orders yet.</p>
              <p className="text-xs text-[var(--pewter)] mt-1">Orders marked &quot;Delivered&quot; in the dashboard will appear here.</p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto border border-[rgba(242,240,228,0.12)] rounded-xl">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--obsidian)]">
                  <tr>
                    {['Order', 'Customer', 'Zone', 'Items', 'Total', 'Coins', 'Delivered'].map(h => (
                      <th key={h} className="px-3 py-3 text-[9px] text-[var(--gold)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <tr key={String(order._id || order.id)} className={`border-t border-[rgba(242,240,228,0.08)] transition-colors hover:bg-[var(--charcoal-light)] ${idx % 2 === 0 ? '' : 'bg-[rgba(212,175,55,0.02)]'}`}>
                      <td className="px-3 py-3 text-xs text-[var(--cream-muted)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                        <Link href={`/order/${order._id || order.id}`} className="hover:text-[var(--gold-bright)] underline decoration-dotted">
                          {String(order._id || order.id || '').slice(-8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-xs text-[var(--cream)]">{order.customer}</div>
                        <div className="text-[11px] text-[var(--gold)] hidden sm:block">{order.userId}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-[var(--cream-muted)]">{order.zone}</td>
                      <td className="px-3 py-3 text-[11px] text-[var(--pewter)]">{order.items.join(', ')}</td>
                      <td className="px-3 py-3 text-xs text-[var(--gold-bright)]">₱{order.total}</td>
                      <td className="px-3 py-3">
                        {(order.pointsEarned ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--gold-bright)]">
                            <Coins size={11} color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> +{order.pointsEarned}
                            {order.coinsAwarded === false && <span className="text-[8px] text-[var(--crimson)] ml-1">(pending)</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-[var(--pewter)]">
                        {(() => {
                          const delivered = order.statusHistory?.find(h => h.status === 'Delivered');
                          return delivered?.timestamp ? new Date(delivered.timestamp).toLocaleDateString() : '—';
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
