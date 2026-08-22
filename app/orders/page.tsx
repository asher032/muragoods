'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type Order, type OrderStatus } from '@/app/lib/muragoods-data';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';
import { PixelArt } from '@/app/components/PixelArt';

const statusFlow: OrderStatus[] = [
  'Pending Payment',
  'Payment Verified',
  'Preparing',
  'Out for Delivery',
  'Delivered',
];

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<(Order & { _id?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const user = JSON.parse(userStr);

    async function fetchOrders() {
      try {
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          const safeOrders = result.data.map((o: Record<string, unknown>) => {
            const order = o as Order & { _id?: string };
            return { ...order, id: order._id || order.id || String(order._id || '') };
          });
          setOrders(safeOrders);
        } else {
          setOrders([]);
        }
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [router]);

  const handleCancelOrder = async (orderId: string) => {
    const order = orders.find(o => (o._id || o.id) === orderId);
    if (!order) return;

    // Can cancel if Pending Payment or Payment Verified
    const cancellableStatuses: OrderStatus[] = ['Pending Payment', 'Payment Verified'];
    if (!cancellableStatuses.includes(order.status)) {
      alert('You cannot cancel this order anymore. It has already been processed.');
      return;
    }

    if (!confirm(`Are you sure you want to cancel this order? Status: ${order.status}`)) return;
    setCancellingId(orderId);

    try {
      // PATCH to set status to Cancelled instead of deleting
      const res = await fetch(`/api/orders?id=${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' }),
      });
      const result = await res.json();
      if (result.success) {
        setOrders((current) =>
          current.map((o) =>
            (o._id || o.id) === orderId
              ? { ...o, status: 'Cancelled' as OrderStatus }
              : o
          )
        );
      } else {
        alert(result.error || 'Failed to cancel order');
      }
    } catch {
      alert('Failed to cancel order');
    } finally {
      setCancellingId(null);
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
      <NavBar pageLabel="Track Your Quest" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '72rem' }}>
          <PixelDivider variant="starBurst" />

          {/* Header */}
          <div className="mb-8">
            <h1
              className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase"
              style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}
            >
              Track Your Quest
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">
              Your food is being prepped in Bowser&apos;s Castle Kitchen!
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-4 text-sm text-[var(--crimson)] rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
              ⚠ {error}
            </div>
          )}

          {/* Empty State */}
          {orders.length === 0 ? (
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-12 text-center rounded-xl">
              <PixelArt variant="empty-chest" size={4} />
              <p
                className="text-sm text-[var(--cream)] mb-2 mt-6"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                NO ORDERS FOUND!
              </p>
              <p className="text-xs text-[var(--pewter)] mb-6">Your treasure chest is empty — time to go shopping!</p>
              <Link href="/menu" className="deco-btn deco-btn-gold rounded-xl">
                Start Shopping
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map((order) => {
                const currentIndex = statusFlow.indexOf(order.status);
                const isCancelled = order.status === 'Cancelled';
                const cancellableStatuses: OrderStatus[] = ['Pending Payment', 'Payment Verified'];
                const canCancel = cancellableStatuses.includes(order.status);

                return (
                  <article
                    key={order.id}
                    className={`border-2 bg-[var(--charcoal)] p-6 rounded-xl slide-in transition-all ${
                      isCancelled
                        ? 'border-[rgba(242,240,228,0.15)] opacity-70'
                        : 'border-[var(--gold)] hover:shadow-[0_0_30px_rgba(212,175,55,0.15)]'
                    }`}
                  >
                    {/* Order Header */}
                    <div className="flex flex-col gap-4 border-b-2 border-[rgba(212,175,55,0.2)] pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <Link
                          href={`/order/${order._id || order.id}`}
                          className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] hover:text-[var(--gold-bright)] transition-colors"
                          style={{ fontFamily: 'var(--font-arcade)' }}
                        >
                          Order #{String(order.id).slice(-8).toUpperCase()}
                        </Link>
                        <h2
                          className="mt-2 text-lg text-[var(--cream)] uppercase"
                          style={{ fontFamily: 'var(--font-arcade)' }}
                        >
                          {order.customer}
                        </h2>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="deco-badge deco-badge-gold rounded-lg">{order.zone}</span>
                        <span className="deco-badge deco-badge-cream rounded-lg">{order.payment}</span>
                        {isCancelled && (
                          <span className="deco-badge deco-badge-crimson rounded-lg">CANCELLED</span>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => handleCancelOrder(order._id || order.id)}
                            disabled={cancellingId === (order._id || order.id)}
                            className="deco-btn deco-btn-sm deco-btn-crimson disabled:opacity-50 rounded-xl"
                            style={{ minHeight: '36px', padding: '8px 16px' }}
                          >
                            {cancellingId === (order._id || order.id) ? 'Cancelling...' : '✖ Cancel Order'}
                          </button>
                        )}
                        {!canCancel && !isCancelled && (
                          <span className="deco-badge deco-badge-cream rounded-lg opacity-60">🔒 Locked</span>
                        )}
                      </div>
                    </div>

                    {/* Order Body */}
                    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
                      <div>
                        {/* Status Steps */}
                        <div className="mb-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                          {statusFlow.map((step, index) => {
                            const active = !isCancelled && index <= currentIndex;
                            return (
                              <div key={step} className="relative">
                                <div
                                  className={`flex h-12 w-12 items-center justify-center border-2 text-sm transition-all ${
                                    active
                                      ? 'border-[var(--gold)] bg-[var(--gold)] text-[var(--obsidian)] pulse-badge'
                                      : 'border-[rgba(242,240,228,0.2)] bg-[var(--charcoal-light)] text-[var(--pewter)]'
                                  }`}
                                  style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}
                                >
                                  {active && index > 0 ? '✓' : index + 1}
                                </div>
                                <p
                                  className="mt-2 text-[9px] text-[var(--pewter)] uppercase tracking-wider leading-tight"
                                  style={{ fontFamily: 'var(--font-arcade)' }}
                                >
                                  {step}
                                </p>
                              </div>
                            );
                          })}
                        </div>

                        {/* Current Status */}
                        <div className={`border-2 p-5 rounded-xl ${isCancelled ? 'border-[var(--crimson)] bg-[rgba(229,37,33,0.05)]' : 'border-[var(--gold)] bg-[rgba(212,175,55,0.05)]'}`}>
                          <p
                            className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]"
                            style={{ fontFamily: 'var(--font-arcade)' }}
                          >
                            Current Status
                          </p>
                          <p
                            className={`mt-3 text-base uppercase ${isCancelled ? 'text-[var(--crimson)]' : 'text-[var(--gold-bright)]'}`}
                            style={{ fontFamily: 'var(--font-arcade)' }}
                          >
                            {isCancelled ? '✖ CANCELLED' : order.status}
                          </p>
                        </div>
                      </div>

                      {/* Delivery Info */}
                      <div className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-5 rounded-xl">
                        <p
                          className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]"
                          style={{ fontFamily: 'var(--font-arcade)' }}
                        >
                          Delivery Info
                        </p>
                        <ul className="mt-4 space-y-3 text-sm">
                          <li className="text-[var(--cream-muted)]">
                            <span className="text-[var(--gold)]">Address: </span>
                            {order.address}
                          </li>
                          <li className="text-[var(--cream-muted)]">
                            <span className="text-[var(--gold)]">Phone: </span>
                            {order.phone}
                          </li>
                          <li className="text-[var(--cream-muted)]">
                            <span className="text-[var(--gold)]">Service: </span>
                            {order.deliveryType}
                          </li>
                          <li className="text-[var(--cream-muted)]">
                            <span className="text-[var(--gold)]">Date: </span>
                            {order.deliveryDate}
                          </li>
                          <li className="pt-2 border-t border-[rgba(242,240,228,0.1)]">
                            <span className="coin-price text-base">₱{order.total}</span>
                          </li>
                          {order.pointsEarned !== undefined && order.pointsEarned > 0 && (
                            <li className="pt-2 border-t border-[rgba(242,240,228,0.1)]">
                              <span className="text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
                                🪙 +{order.pointsEarned} Coins Earned!
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
