'use client';

import Link from 'next/link';
import Image from 'next/image';
import { type Order, type OrderStatus } from '@/app/lib/muragoods-data';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';

const statusFlow: OrderStatus[] = [
  'Pending Payment',
  'Payment Verified',
  'Preparing',
  'Out for Delivery',
  'Delivered',
];

export default function AccountOrdersPage() {
  const [orders, setOrders] = useState<(Order & { _id?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const user = JSON.parse(userStr);

    async function fetchOrders() {
      try {
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (result.success) {
          setOrders(result.data.map((o: Order & { _id?: string }) => ({ ...o, id: o._id || o.id })));
        }
      } catch (fetchError) {
        console.error('Failed to fetch orders:', fetchError);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [router]);

  const logout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  const handleCancelOrder = async (orderId: string) => {
    const order = orders.find(o => (o._id || o.id) === orderId);
    if (!order) return;
    const cancellableStatuses: OrderStatus[] = ['Pending Payment', 'Payment Verified'];
    if (!cancellableStatuses.includes(order.status)) {
      alert('You cannot cancel this order anymore.');
      return;
    }
    if (!confirm(`Are you sure you want to cancel this order?`)) return;
    try {
      const res = await fetch(`/api/orders?id=${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' }),
      });
      const result = await res.json();
      if (result.success) {
        setOrders(current => current.map(o =>
          (o._id || o.id) === orderId
            ? { ...o, status: 'Cancelled' as OrderStatus }
            : o
        ));
      } else {
        alert(result.error || 'Failed to cancel order');
      }
    } catch {
      alert('Failed to cancel order');
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--obsidian)]">
        <p className="text-2xl animate-bounce text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
          LOADING ORDERS...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="My Orders" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '72rem' }}>
          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1
                className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase"
                style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}
              >
                My Orders
              </h1>
            </div>
          </div>

          {/* Summary Cards */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {[
              { label: 'Total Orders', value: String(orders.length) },
              { label: 'Preparing', value: String(orders.filter(o => o.status === 'Preparing').length) },
              { label: 'Delivered', value: String(orders.filter(o => o.status === 'Delivered').length) },
              { label: 'Cancelled', value: String(orders.filter(o => o.status === 'Cancelled').length) },
            ].map(card => (
              <div key={card.label} className="power-card p-5 rounded-xl">
                <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>{card.label}</p>
                <p className="mt-3 text-2xl text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{card.value}</p>
              </div>
            ))}
          </section>

          {/* Order Cards */}
          <section className="space-y-6">
            {orders.length === 0 ? (
              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-12 text-center rounded-2xl">
                <p className="text-sm text-[var(--cream)] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>NO ORDERS FOUND!</p>
                <Link href="/menu" className="deco-btn deco-btn-gold rounded-xl">Start Shopping</Link>
              </div>
            ) : orders.map(order => {
              const currentIndex = statusFlow.indexOf(order.status);
              const isCancelled = order.status === 'Cancelled';
              const cancellableStatuses: OrderStatus[] = ['Pending Payment', 'Payment Verified'];
              const canCancel = cancellableStatuses.includes(order.status);

              return (
                <article key={order.id} className={`border-2 bg-[var(--charcoal)] p-5 sm:p-6 rounded-2xl slide-in transition-all ${isCancelled ? 'border-[rgba(242,240,228,0.15)] opacity-70' : 'border-[var(--gold)] hover:shadow-[0_0_30px_rgba(212,175,55,0.15)]'}`}>
                  {/* Order Header */}
                  <div className="flex flex-col gap-4 border-b-2 border-[rgba(212,175,55,0.2)] pb-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Link href={`/order/${order.id}`} className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] hover:text-[var(--gold-bright)] transition-colors" style={{ fontFamily: 'var(--font-arcade)' }}>
                        Order #{String(order.id).slice(-8).toUpperCase()}
                      </Link>
                      <h2 className="mt-2 text-lg text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>{order.customer}</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="deco-badge deco-badge-gold rounded-lg">{order.zone}</span>
                      <span className="deco-badge deco-badge-cream rounded-lg">{order.payment}</span>
                      {isCancelled && <span className="deco-badge deco-badge-crimson rounded-lg">CANCELLED</span>}
                      {canCancel && (
                        <button onClick={() => handleCancelOrder(order._id || order.id)} className="deco-btn deco-btn-sm deco-btn-crimson rounded-xl" style={{ minHeight: '36px', padding: '8px 16px' }}>
                          ✖ Cancel
                        </button>
                      )}
                      {!canCancel && !isCancelled && (
                        <span className="deco-badge deco-badge-cream rounded-lg opacity-60">🔒 Locked</span>
                      )}
                    </div>
                  </div>

                  {/* Order Body */}
                  <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
                    <div>
                      {/* Status Steps */}
                      <div className="mb-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                        {statusFlow.map((step, index) => {
                          const active = !isCancelled && index <= currentIndex;
                          return (
                            <div key={step} className="relative">
                              <div className={`flex h-12 w-12 items-center justify-center border-2 text-sm transition-all ${active ? 'border-[var(--gold)] bg-[var(--gold)] text-[var(--obsidian)] pulse-badge' : 'border-[rgba(242,240,228,0.2)] bg-[var(--charcoal-light)] text-[var(--pewter)]'}`} style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>
                                {active && index > 0 ? '✓' : index + 1}
                              </div>
                              <p className="mt-2 text-[9px] text-[var(--pewter)] uppercase tracking-wider leading-tight" style={{ fontFamily: 'var(--font-arcade)' }}>{step}</p>
                            </div>
                          );
                        })}
                      </div>
                      <div className={`border-2 p-5 rounded-xl ${isCancelled ? 'border-[var(--crimson)] bg-[rgba(229,37,33,0.05)]' : 'border-[var(--gold)] bg-[rgba(212,175,55,0.05)]'}`}>
                        <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>Current Status</p>
                        <p className={`mt-3 text-base uppercase ${isCancelled ? 'text-[var(--crimson)]' : 'text-[var(--gold-bright)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                          {isCancelled ? '✖ CANCELLED' : order.status}
                        </p>
                      </div>
                    </div>

                    <div className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-5 rounded-xl">
                      <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>Delivery Info</p>
                      <ul className="mt-4 space-y-3 text-sm">
                        <li className="text-[var(--cream-muted)]"><span className="text-[var(--gold)]">Address: </span>{order.address}</li>
                        <li className="text-[var(--cream-muted)]"><span className="text-[var(--gold)]">Phone: </span>{order.phone}</li>
                        <li className="text-[var(--cream-muted)]"><span className="text-[var(--gold)]">Service: </span>{order.deliveryType}</li>
                        <li className="text-[var(--cream-muted)]"><span className="text-[var(--gold)]">Date: </span>{order.deliveryDate}</li>
                        <li className="pt-2 border-t border-[rgba(242,240,228,0.1)]"><span className="coin-price text-base">₱{order.total}</span></li>
                      </ul>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </section>
    </main>
  );
}
