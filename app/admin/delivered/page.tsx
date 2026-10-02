'use client';

import { type Order } from '@/app/lib/muragoods-data';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { AdminHeader } from '../components/AdminShell';
import { CircleCheck, Coins } from 'lucide-react';

type StatusEntry = { status: string; timestamp: string | number | Date };
type AdminOrder = Order & { userId: string; _id?: string; coinsAwarded?: boolean; statusHistory?: StatusEntry[] };

// Admin — Delivered Orders history. Orders whose status is 'Delivered' move
// here from the Live Order Feed so the dashboard only shows work in progress.
export default function AdminDeliveredPage() {
  // No client-side admin gate: app/admin/layout.tsx resolves access on the
  // server and redirects anyone who does not belong. The sign-in card this
  // page used to render was unreachable dead weight that also implied the
  // page itself was the thing being protected.
  const [orders, setOrders] = useState<AdminOrder[]>([]);

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
    fetchOrders();
  }, [fetchOrders]);

  const stats = useMemo(() => {
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const coins = orders.reduce((sum, o) => sum + (o.pointsEarned || 0), 0);
    return { count: orders.length, revenue, coins };
  }, [orders]);

  return (
    <main>
      <div className="deco-container">
        <AdminHeader
          title="Delivered orders"
          subtitle="Completed orders, moved out of the live feed so the overview only shows work in progress."
          actions={<Link href="/admin" className="deco-btn deco-btn-sm">Back to overview</Link>}
        />

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
