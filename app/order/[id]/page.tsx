'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { type Order, type OrderStatus } from '@/app/lib/muragoods-data';
import { NavBar } from '@/app/components/NavBar';
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
  'Cancelled': '✖',
};

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params?.id as string;
  const [order, setOrder] = useState<(Order & { _id?: string; statusHistory?: Array<{ status: string; timestamp: string }> }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }

    async function fetchOrder() {
      try {
        const user = JSON.parse(userStr!);
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          const found = result.data.find((o: any) => (o._id || o.id) === orderId);
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

  const handleCancelOrder = async () => {
    if (!order || cancelling) return;
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders?id=${order._id || order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Cancelled',
          $push: { statusHistory: { status: 'Cancelled', timestamp: new Date().toISOString() } },
        }),
      });
      const result = await res.json();
      if (result.success) {
        setOrder(prev => prev ? { ...prev, status: 'Cancelled' as OrderStatus } : prev);
      } else {
        alert('Failed to cancel order');
      }
    } catch {
      alert('Failed to cancel order');
    }
    setCancelling(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen" style={{ background: 'var(--mario-bg)' }}>
        <NavBar pageLabel="Order" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 0' }}>
          <p className="animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'var(--mario-yellow)' }}>LOADING ORDER...</p>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen" style={{ background: 'var(--mario-bg)' }}>
        <NavBar pageLabel="Order Not Found" />
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
          <span style={{ fontSize: '48px' }}>❓</span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: 'var(--mario-text)', marginTop: '20px' }}>
            ORDER NOT FOUND
          </h1>
          <p style={{ color: 'var(--mario-text-muted)', fontSize: '13px', marginTop: '8px' }}>
            {error || 'This order may have been deleted or the link is invalid.'}
          </p>
          <Link href="/orders" className="mario-btn mario-btn-yellow mario-btn-sm" style={{ marginTop: '20px', display: 'inline-flex' }}>
            View All Orders
          </Link>
        </div>
      </main>
    );
  }

  const currentIndex = statusFlow.indexOf(order.status);
  const isCancelled = order.status === 'Cancelled';
  const canCancel = !isCancelled && currentIndex >= 0 && currentIndex <= 1;
  const items: string[] = (() => { try { return JSON.parse(String(order.items)); } catch { return []; } })();

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel={`Order ${(order._id || order.id).slice(-8).toUpperCase()}`} />

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '14px',
                color: 'var(--mario-yellow)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>Order Summary</h1>
              <p style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '8px',
                color: 'var(--mario-text-muted)',
                marginTop: '4px',
              }}>ID: {(order._id || order.id).slice(-12).toUpperCase()}</p>
              {isCancelled && (
                <p style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '9px',
                  color: 'var(--mario-red)',
                  marginTop: '4px',
                }}>✖ This order has been cancelled</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <Link href="/orders" className="mario-btn mario-btn-sm">← All Orders</Link>
              <Link href="/menu" className="mario-btn mario-btn-sm mario-btn-yellow">+ New Order</Link>
            </div>
          </div>
          <ShareOrder
            orderId={order._id || order.id}
            customerName={order.customer}
            total={order.total}
            items={items}
          />
        </div>

        {/* Status Progress */}
        <div style={{
          background: 'var(--mario-bg-card)',
          border: '1px solid rgba(255,214,10,0.15)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
            {statusFlow.map((step, index) => {
              const active = !isCancelled && index <= currentIndex;
              const current = index === currentIndex && !isCancelled;
              return (
                <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '55px', flex: 1 }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: `2px solid ${current ? 'var(--mario-yellow)' : active ? 'var(--mario-yellow)' : 'rgba(255,255,255,0.1)'}`,
                    background: current ? 'var(--mario-yellow)' : active ? 'rgba(255,214,10,0.15)' : 'var(--mario-bg-input)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    transition: 'all 0.2s',
                    transform: current ? 'scale(1.1)' : 'scale(1)',
                  }}>
                    {active && index > 0 ? '✓' : statusEmojis[step] || (index + 1)}
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-arcade)',
                    fontSize: '6px',
                    color: current ? 'var(--mario-yellow)' : active ? 'var(--mario-text)' : 'var(--mario-text-muted)',
                    textTransform: 'uppercase',
                    marginTop: '6px',
                    textAlign: 'center',
                    lineHeight: '1.2',
                    whiteSpace: 'nowrap',
                  }}>{step}</p>
                </div>
              );
            })}
          </div>
          {/* Progress bar */}
          <div style={{
            height: '4px',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '2px',
            marginTop: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: isCancelled ? '0%' : `${Math.max(5, ((currentIndex + 1) / statusFlow.length) * 100)}%`,
              background: isCancelled ? 'var(--mario-red)' : 'var(--mario-green)',
              borderRadius: '2px',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '10px',
          }}>
            <p style={{
              fontFamily: 'var(--font-arcade)',
              fontSize: '8px',
              color: 'var(--mario-text-muted)',
              textTransform: 'uppercase',
            }}>Current Status</p>
            <span style={{
              fontFamily: 'var(--font-arcade)',
              fontSize: '10px',
              color: isCancelled ? 'var(--mario-red)' : 'var(--mario-yellow)',
            }}>{order.status}</span>
          </div>

          {/* Cancel Button */}
          {canCancel && (
            <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
              <button
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="mario-btn mario-btn-red mario-btn-sm"
                style={{ width: '100%', opacity: cancelling ? 0.5 : 1 }}
              >
                {cancelling ? 'Cancelling...' : '✖ Cancel Order'}
              </button>
              <p style={{
                fontSize: '10px',
                color: 'var(--mario-text-muted)',
                marginTop: '6px',
                textAlign: 'center',
              }}>
                {currentIndex <= 0 ? 'You can cancel before payment is verified.' : 'You can cancel before the order is being prepared.'}
              </p>
            </div>
          )}
        </div>

        {/* Status Timeline */}
        <div style={{
          background: 'var(--mario-bg-card)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px',
        }}>
          <p style={{
            fontFamily: 'var(--font-arcade)',
            fontSize: '8px',
            color: 'var(--mario-yellow)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '12px',
          }}>📋 Status Timeline</p>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute',
              left: '15px',
              top: '0',
              bottom: '0',
              width: '2px',
              background: 'rgba(255,214,10,0.1)',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Order placed */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', position: 'relative' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--mario-yellow)',
                  border: '2px solid var(--mario-yellow)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  zIndex: 1,
                }}>📦</div>
                <div>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-yellow)' }}>Order Placed</p>
                  <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)', marginTop: '2px' }}>
                    {order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}
                  </p>
                </div>
              </div>

              {/* Status history */}
              {order.statusHistory && order.statusHistory.length > 0 ?
                order.statusHistory.map((entry, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', position: 'relative' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      border: `2px solid ${entry.status === 'Cancelled' ? 'var(--mario-red)' : entry.status === order.status ? 'var(--mario-yellow)' : 'rgba(255,255,255,0.15)'}`,
                      background: entry.status === 'Cancelled' ? 'rgba(230,57,70,0.15)' : entry.status === order.status ? 'var(--mario-yellow)' : 'var(--mario-bg-input)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      zIndex: 1,
                    }}>
                      {statusEmojis[entry.status] || '✓'}
                    </div>
                    <div>
                      <p style={{
                        fontFamily: 'var(--font-arcade)',
                        fontSize: '8px',
                        color: entry.status === order.status ? 'var(--mario-yellow)' : 'var(--mario-text)',
                        textTransform: 'uppercase',
                      }}>
                        {entry.status} {entry.status === order.status && '← Current'}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)', marginTop: '2px' }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )) :
                statusFlow.slice(0, currentIndex + 1).map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', position: 'relative' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      border: `2px solid ${step === order.status ? 'var(--mario-yellow)' : 'rgba(255,255,255,0.15)'}`,
                      background: step === order.status ? 'var(--mario-yellow)' : 'var(--mario-bg-input)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      zIndex: 1,
                    }}>{statusEmojis[step]}</div>
                    <div>
                      <p style={{
                        fontFamily: 'var(--font-arcade)',
                        fontSize: '8px',
                        color: step === order.status ? 'var(--mario-yellow)' : 'var(--mario-text)',
                        textTransform: 'uppercase',
                      }}>
                        {step} {step === order.status && '← Current'}
                      </p>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* Items + Delivery Info */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {/* Items */}
          <div style={{
            background: 'var(--mario-bg-card)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '20px',
          }}>
            <p style={{
              fontFamily: 'var(--font-arcade)',
              fontSize: '8px',
              color: 'var(--mario-yellow)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '12px',
            }}>Items Ordered</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {items.length > 0 ? items.map((item, i) => (
                <div key={i} style={{
                  padding: '10px',
                  background: 'var(--mario-bg-input)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontSize: '13px', color: 'var(--mario-text)' }}>{item}</span>
                </div>
              )) : <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)' }}>No item details available</p>}
            </div>
            <div style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-text)', textTransform: 'uppercase' }}>Total</span>
              <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: 'var(--mario-yellow)' }}>₱{order.total}</span>
            </div>
            {order.pointsEarned !== undefined && order.pointsEarned > 0 && (
              <div style={{
                marginTop: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-text-muted)', textTransform: 'uppercase' }}>
                  {order.status === 'Delivered' ? 'Coins Earned' : 'Coins Pending'}
                </span>
                <span style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '10px',
                  color: order.status === 'Delivered' ? 'var(--mario-green)' : 'var(--mario-yellow)',
                }}>🪙 +{order.pointsEarned}</span>
              </div>
            )}
          </div>

          {/* Delivery & Payment */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              background: 'var(--mario-bg-card)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '20px',
            }}>
              <p style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '8px',
                color: 'var(--mario-yellow)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '12px',
              }}>Delivery Info</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { label: 'Customer', value: order.customer },
                  { label: 'Phone', value: order.phone },
                  { label: 'Zone', value: order.zone },
                  { label: 'Address', value: order.address },
                  { label: 'Date', value: order.deliveryDate },
                  { label: 'Service', value: order.deliveryType },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--mario-text-muted)' }}>{row.label}</span>
                    <span style={{ color: 'var(--mario-text)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              background: 'var(--mario-bg-card)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '20px',
            }}>
              <p style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '8px',
                color: 'var(--mario-yellow)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '12px',
              }}>Payment Info</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--mario-text-muted)' }}>Method</span>
                  <span style={{ color: 'var(--mario-text)' }}>{order.payment}</span>
                </div>
                {(order.instaPayRefNumber || order.gcashRefNumber) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--mario-text-muted)' }}>Ref #</span>
                    <span style={{ color: 'var(--mario-text)' }}>{order.instaPayRefNumber || order.gcashRefNumber}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--mario-text-muted)' }}>Amount</span>
                  <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: 'var(--mario-yellow)' }}>₱{order.total}</span>
                </div>
              </div>
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <Link href={`/receipt/${order._id || order.id}`} className="mario-btn mario-btn-yellow mario-btn-sm" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                  🧾 View Receipt
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
