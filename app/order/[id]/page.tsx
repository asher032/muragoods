'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { type Order, type OrderStatus } from '@/app/lib/muragoods-data';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';
import { MarioWalker } from '@/app/components/MarioWalker';
import { PixelArt } from '@/app/components/PixelArt';
import ShareOrder from '@/app/components/ShareOrder';

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
            <PixelArt variant="confused-mario" size={4} />
            <h1 className="text-xl text-[var(--cream)] mb-2 mt-6" style={{ fontFamily: 'var(--font-arcade)' }}>ORDER NOT FOUND</h1>
            <p className="text-[var(--pewter)] mb-6">{error || 'Mario can\'t find this order! It may have been deleted or the link is invalid.'}</p>
            <Link href="/orders" className="deco-btn deco-btn-gold rounded-xl">View All Orders</Link>
          </div>
        </section>
      </main>
    );
  }

  const currentIndex = statusFlow.indexOf(order.status);
  const isCancelled = order.status === 'Cancelled';
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
              <p className="text-[10px] text-[var(--gold)] mt-2 uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)' }}>
                ID: {(order._id || order.id).slice(-12).toUpperCase()}
              </p>
              {isCancelled && (
                <p className="text-[11px] text-[var(--crimson)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>
                  ✖ This order has been cancelled
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 items-end">
              <div className="flex gap-3">
                <Link href="/orders" className="deco-btn deco-btn-sm rounded-xl">← All Orders</Link>
                <Link href="/menu" className="deco-btn deco-btn-sm deco-btn-gold rounded-xl">+ New Order</Link>
              </div>
              <ShareOrder
                orderId={order._id || order.id}
                customerName={order.customer}
                total={order.total}
                items={items}
              />
            </div>
          </div>

          {/* Mario Walker — animated progress */}
          <div className="mb-6">
            <MarioWalker
              currentStage={isCancelled ? -1 : currentIndex}
              isCancelled={isCancelled}
              stages={statusFlow}
            />
          </div>

          {/* Status Steps */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6 mb-6">
            <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Order Progress</h2>
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
              {statusFlow.map((step, index) => {
                const active = !isCancelled && index <= currentIndex;
                const current = index === currentIndex;
                return (
                  <div key={step} className="flex flex-col items-center min-w-[70px]">
                    <div className={`flex h-12 w-12 items-center justify-center border-2 text-sm transition-all rounded-full ${current && !isCancelled ? 'border-[var(--gold-bright)] bg-[var(--gold)] text-[var(--obsidian)] pulse-badge scale-110' : active ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.2)] text-[var(--gold-bright)]' : 'border-[rgba(242,240,228,0.2)] bg-[var(--charcoal-light)] text-[var(--pewter)]'}`} style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px' }}>
                      {active && index > 0 ? '✓' : statusEmojis[step] || (index + 1)}
                    </div>
                    <p className="mt-2 text-[9px] text-[var(--pewter)] uppercase tracking-wider leading-tight text-center" style={{ fontFamily: 'var(--font-arcade)' }}>{step}</p>
                  </div>
                );
              })}
            </div>
            <div className={`mt-6 border-t-2 pt-4 flex items-center gap-3 ${isCancelled ? 'border-[var(--crimson)]' : 'border-[rgba(212,175,55,0.15)]'}`}>
              <span className="text-[10px] text-[var(--pewter)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Current:</span>
              <span className={`text-base uppercase ${isCancelled ? 'text-[var(--crimson)]' : 'text-[var(--gold-bright)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>{order.status}</span>
            </div>
          </div>

          {/* Status Timeline */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6 mb-6">
            <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>📋 Status Timeline</h2>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-[rgba(212,175,55,0.2)]" />
              <div className="space-y-4">
                {/* Order placed */}
                <div className="flex items-start gap-4 relative">
                  <div className="w-10 h-10 rounded-full bg-[var(--gold)] border-2 border-[var(--gold-bright)] flex items-center justify-center z-10">
                    <span className="text-sm">📦</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Order Placed</p>
                    <p className="text-xs text-[var(--pewter)] mt-1">{order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}</p>
                  </div>
                </div>

                {/* Status history entries */}
                {(order as Record<string, unknown>).statusHistory && Array.isArray((order as Record<string, unknown>).statusHistory) ?
                  ((order as Record<string, unknown>).statusHistory as Array<{ status: string; timestamp: string }>).map((entry, i) => {
                    const statusIndex = statusFlow.indexOf(entry.status as OrderStatus);
                    const isCurrentStatus = entry.status === order.status;
                    return (
                      <div key={i} className="flex items-start gap-4 relative">
                        <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center z-10 ${
                          entry.status === 'Cancelled' ? 'bg-[var(--crimson)] border-[var(--crimson)]' :
                          isCurrentStatus ? 'bg-[var(--gold)] border-[var(--gold-bright)]' :
                          'bg-[var(--charcoal-light)] border-[rgba(242,240,228,0.2)]'
                        }`}>
                          <span className="text-sm">{statusEmojis[entry.status] || '✓'}</span>
                        </div>
                        <div className="flex-1">
                          <p className={`text-[10px] uppercase ${isCurrentStatus ? 'text-[var(--gold-bright)]' : 'text-[var(--cream)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                            {entry.status} {isCurrentStatus && '← Current'}
                          </p>
                          <p className="text-xs text-[var(--pewter)] mt-1">{new Date(entry.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })
                : (
                  /* Fallback: show status steps without timestamps */
                  statusFlow.slice(0, currentIndex + 1).map((step, i) => (
                    <div key={i} className="flex items-start gap-4 relative">
                      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center z-10 ${
                        step === order.status ? 'bg-[var(--gold)] border-[var(--gold-bright)]' :
                        'bg-[var(--charcoal-light)] border-[rgba(242,240,228,0.2)]'
                      }`}>
                        <span className="text-sm">{statusEmojis[step]}</span>
                      </div>
                      <div className="flex-1">
                        <p className={`text-[10px] uppercase ${step === order.status ? 'text-[var(--gold-bright)]' : 'text-[var(--cream)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                          {step} {step === order.status && '← Current'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Order Items */}
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
              <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Items Ordered</h2>
              <div className="space-y-2">
                {items.length > 0 ? items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[var(--charcoal-light)] rounded-xl border border-[rgba(242,240,228,0.08)]">
                    <span className="text-sm text-[var(--cream)]">{item}</span>
                  </div>
                )) : <p className="text-sm text-[var(--pewter)]">No item details available</p>}
              </div>
              <div className="mt-4 pt-4 border-t-2 border-[rgba(212,175,55,0.15)] flex justify-between items-center">
                <span className="text-[10px] text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Total</span>
                <span className="coin-price text-xl">₱{order.total}</span>
              </div>
              {order.pointsEarned !== undefined && order.pointsEarned > 0 && (
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-[10px] text-[var(--pewter)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Coins Earned</span>
                  <span className="text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>🪙 +{order.pointsEarned}</span>
                </div>
              )}
            </div>

            {/* Delivery & Payment Info */}
            <div className="space-y-5">
              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
                <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Delivery Info</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Customer</span><span className="text-[var(--cream)]">{order.customer}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Phone</span><span className="text-[var(--cream)]">{order.phone}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Zone</span><span className="text-[var(--cream)]">{order.zone}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Address</span><span className="text-[var(--cream)] text-right max-w-[60%] break-all">{order.address}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Date</span><span className="text-[var(--cream)]">{order.deliveryDate}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Service</span><span className="text-[var(--cream)]">{order.deliveryType}</span></div>
                  {'deliveryTimeSlot' in order && (order as { deliveryTimeSlot?: string }).deliveryTimeSlot && (
                    <div className="flex justify-between"><span className="text-[var(--pewter)]">Time Slot</span><span className="text-[var(--cream)]">{((order as { deliveryTimeSlot?: string }).deliveryTimeSlot === 'morning') ? '🌅 Morning (9AM-12PM)' : ((order as { deliveryTimeSlot?: string }).deliveryTimeSlot === 'afternoon') ? '☀️ Afternoon (12PM-5PM)' : '🌙 Evening (5PM-8PM)'}</span></div>
                  )}
                </div>
              </div>

              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
                <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Payment Info</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Method</span><span className="text-[var(--cream)]">{order.payment}</span></div>
                  {order.gcashRefNumber && <div className="flex justify-between"><span className="text-[var(--pewter)]">Ref #</span><span className="text-[var(--cream)]">{order.gcashRefNumber}</span></div>}
                  <div className="flex justify-between"><span className="text-[var(--pewter)]">Amount</span><span className="coin-price text-lg">₱{order.total}</span></div>
                </div>
                {/* Receipt Button */}
                <div className="mt-4 pt-4 border-t border-[rgba(212,175,55,0.15)]">
                  <Link href={`/receipt/${order._id || order.id}`} className="deco-btn deco-btn-sm deco-btn-gold rounded-lg w-full text-center block">
                    🧾 View Receipt
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Review Section — only for delivered orders */}
          {order.status === 'Delivered' && (
            <ReviewSection orderId={order._id || order.id} items={items} userName={order.customer} userId={order.userId || ''} />
          )}
        </div>
      </section>
    </main>
  );
}

// Review Section Component
function ReviewSection({ orderId, items, userName, userId }: { orderId: string; items: string[]; userName: string; userId: string }) {
  const [reviews, setReviews] = useState<Array<{ _id: string; productName: string; rating: number; comment: string; adminReply: string; userName: string; createdAt: string }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/reviews?orderId=${orderId}`)
      .then(r => r.json())
      .then(result => { if (result.success) setReviews(result.data); })
      .catch(() => {});
  }, [orderId]);

  const handleSubmit = async () => {
    if (!selectedItem || submitting) return;
    setSubmitting(true);
    try {
      const productName = selectedItem.split(' (')[0].trim();
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, userId, userName, productName, rating, comment }),
      });
      const result = await res.json();
      if (result.success) {
        setReviews(prev => [result.data, ...prev]);
        setSuccess(true);
        setShowForm(false);
        setSelectedItem('');
        setRating(5);
        setComment('');
        setTimeout(() => setSuccess(false), 3000);
      } else {
        alert(result.error || 'Failed to submit review');
      }
    } catch {
      alert('Failed to submit review');
    }
    setSubmitting(false);
  };

  const reviewedProducts = reviews.map(r => r.productName);
  const unreviewedItems = items.filter(item => !reviewedProducts.includes(item.split(' (')[0].trim()));

  return (
    <div className="mt-6 border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>⭐ Rate Your Order</h2>
        {unreviewedItems.length > 0 && !showForm && (
          <button onClick={() => { setShowForm(true); setSelectedItem(unreviewedItems[0]); }} className="deco-btn deco-btn-sm deco-btn-gold rounded-lg">
            + Write Review
          </button>
        )}
      </div>

      {success && (
        <div className="mb-4 border-2 border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.2)] p-3 rounded-xl text-center">
          <p className="text-[10px] text-[var(--emerald-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>✓ Review submitted!</p>
        </div>
      )}

      {/* Review Form */}
      {showForm && (
        <div className="mb-4 border-2 border-[var(--gold)] bg-[var(--charcoal-light)] rounded-xl p-4 space-y-3">
          <div>
            <label className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Which item?</label>
            <select value={selectedItem} onChange={e => setSelectedItem(e.target.value)} className="deco-select rounded-lg w-full">
              {unreviewedItems.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star} onClick={() => setRating(star)} className="text-2xl transition-transform hover:scale-110">
                  <span className={star <= rating ? 'text-[var(--gold-bright)]' : 'text-[var(--pewter)]'}>★</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[9px] text-[var(--gold)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Comment (optional)</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="How was the food?" className="deco-input rounded-lg w-full h-20 resize-none" maxLength={500} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={!selectedItem || submitting} className="deco-btn deco-btn-sm deco-btn-gold rounded-lg disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
            <button onClick={() => setShowForm(false)} className="deco-btn deco-btn-sm deco-btn-dark rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Existing Reviews */}
      {reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.map(review => (
            <div key={review._id} className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{review.productName}</p>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(s => (
                    <span key={s} className={s <= review.rating ? 'text-[var(--gold-bright)]' : 'text-[var(--pewter)]'} style={{ fontSize: '10px' }}>★</span>
                  ))}
                </div>
              </div>
              {review.comment && <p className="text-xs text-[var(--cream-muted)] mt-2">{review.comment}</p>}
              <p className="text-[8px] text-[var(--pewter)] mt-2">by {review.userName} · {new Date(review.createdAt).toLocaleDateString()}</p>
              {review.adminReply && (
                <div className="mt-3 border-t border-[rgba(212,175,55,0.15)] pt-3">
                  <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>🔧 Muragoods Reply</p>
                  <p className="text-xs text-[var(--cream-muted)] mt-1">{review.adminReply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !showForm ? (
        <p className="text-xs text-[var(--pewter)] text-center py-4">No reviews yet. Be the first to rate this order!</p>
      ) : null}
    </div>
  );
}
