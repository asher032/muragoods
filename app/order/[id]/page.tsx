'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { type Order, type OrderStatus } from '@/app/lib/muragoods-data';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';

const statusFlow: OrderStatus[] = [
  'Pending Payment',
  'Payment Verified',
  'Preparing',
  'Out for Delivery',
  'Delivered',
];

const statusEmojis: Record<string, string> = {
  'Pending Payment': '⏳',
  'Payment Verified': '✅',
  'Preparing': '👨‍🍳',
  'Out for Delivery': '🚚',
  'Delivered': '🎉',
};

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params?.id as string;
  const [order, setOrder] = useState<(Order & { _id?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }

    async function fetchOrder() {
      try {
        const user = JSON.parse(userStr!);
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          const found = result.data.find((o: Order & { _id?: string }) => (o._id || o.id) === orderId);
          if (found) {
            setOrder({ ...found, id: found._id || found.id });
          } else {
            setError('Order not found');
          }
        } else {
          setError('Failed to load order');
        }
      } catch {
        setError('Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    if (orderId) fetchOrder();
  }, [orderId, router]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--obsidian)]">
        <p className="text-xl animate-bounce text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>LOADING...</p>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-[var(--obsidian)]">
        <NavBar pageLabel="Order Not Found" />
        <section className="px-4 py-16 sm:px-8">
          <div className="deco-container text-center">
            <h1 className="text-xl text-[var(--cream)] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>ORDER NOT FOUND</h1>
            <p className="text-[var(--pewter)] mb-6">{error || 'This order does not exist.'}</p>
            <Link href="/orders" className="deco-btn deco-btn-gold rounded-xl">View All Orders</Link>
          </div>
        </section>
      </main>
    );
  }

  const currentIndex = statusFlow.indexOf(order.status);
  const items: string[] = (() => { try { return JSON.parse(String(order.items)); } catch { return []; } })();

  return (
    <main className="min-h-screen">
      <NavBar pageLabel={`Order ${(order._id || order.id).slice(-8).toUpperCase()}`} />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '64rem' }}>
          <PixelDivider variant="starBurst" />

          {/* Order Header */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
                Order Summary
              </h1>
              <p className="text-[9px] text-[var(--gold)] mt-2 uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)' }}>
                ID: {(order._id || order.id).slice(-12).toUpperCase()}
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/orders" className="deco-btn deco-btn-sm rounded-xl">← All Orders</Link>
              <Link href="/menu" className="deco-btn deco-btn-sm deco-btn-gold rounded-xl">+ New Order</Link>
            </div>
          </div>

          {/* Status Steps */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl p-6 mb-6">
            <h2 className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Order Progress</h2>
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
              {statusFlow.map((step, index) => {
                const active = index <= currentIndex;
                const current = index === currentIndex;
                return (
                  <div key={step} className="flex flex-col items-center min-w-[60px]">
                    <div className={`flex h-10 w-10 items-center justify-center border-2 text-[8px] transition-all rounded-full ${current ? 'border-[var(--gold-bright)] bg-[var(--gold)] text-[var(--obsidian)] pulse-badge scale-110' : active ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.2)] text-[var(--gold-bright)]' : 'border-[rgba(242,240,228,0.2)] bg-[var(--charcoal-light)] text-[var(--pewter)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                      {active && index > 0 ? '✓' : statusEmojis[step] || (index + 1)}
                    </div>
                    <p className="mt-2 text-[7px] text-[var(--pewter)] uppercase tracking-wider leading-tight text-center" style={{ fontFamily: 'var(--font-arcade)' }}>{step}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 border-t-2 border-[rgba(212,175,55,0.15)] pt-4 flex items-center gap-3">
              <span className="text-[9px] text-[var(--pewter)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Current:</span>
              <span className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>{order.status}</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Order Items */}
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl p-6">
              <h2 className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Items Ordered</h2>
              <div className="space-y-2">
                {items.length > 0 ? items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[var(--charcoal-light)] rounded-lg border border-[rgba(242,240,228,0.08)]">
                    <span className="text-sm text-[var(--cream)]">{item}</span>
                  </div>
                )) : <p className="text-sm text-[var(--pewter)]">No item details available</p>}
              </div>
              <div className="mt-4 pt-4 border-t-2 border-[rgba(212,175,55,0.15)] flex justify-between">
                <span className="text-[9px] text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Total</span>
                <span className="coin-price text-lg">₱{order.total}</span>
              </div>
            </div>

            {/* Delivery & Payment Info */}
            <div className="space-y-5">
              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl p-6">
                <h2 className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Delivery Info</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Customer</span><span className="text-[var(--cream)]">{order.customer}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Phone</span><span className="text-[var(--cream)]">{order.phone}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Zone</span><span className="text-[var(--cream)]">{order.zone}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Address</span><span className="text-[var(--cream)] text-right max-w-[60%] break-all">{order.address}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Date</span><span className="text-[var(--cream)]">{order.deliveryDate}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Service</span><span className="text-[var(--cream)]">{order.deliveryType}</span></div>
                </div>
              </div>

              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl p-6">
                <h2 className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Payment Info</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Method</span><span className="text-[var(--cream)]">{order.payment}</span></div>
                  {order.gcashRefNumber && <div className="flex justify-between"><span className="text-[var(--pewter)]">Ref #</span><span className="text-[var(--cream)]">{order.gcashRefNumber}</span></div>}
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Amount</span><span className="coin-price">₱{order.total}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
