'use client';

import { useState, useEffect } from 'react';
import { NavBar } from '@/app/components/NavBar';
import { Icon } from '@/app/components/Icon';
import Link from 'next/link';

interface TopUpOrder {
  orderId: string;
  transactionId: string;
  gameName: string;
  gameIcon: string;
  packageName: string;
  packageCurrency: string;
  packageAmount: number;
  amount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  topUpStatus: string;
  createdAt: string;
  paidAt?: string;
  completedAt?: string;
}

function getStatusColor(status: string): string {
  if (['completed', 'paid'].includes(status)) return '#06d6a0';
  if (status === 'processing') return '#ffd60a';
  if (['failed', 'cancelled', 'expired'].includes(status)) return '#e63946';
  if (status.includes('refund')) return '#f59e0b';
  return '#888';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending', processing: 'Processing', paid: 'Paid', completed: 'Completed',
    failed: 'Failed', cancelled: 'Cancelled', expired: 'Expired',
    manual_review: 'Under Review', 'refund_pending': 'Refund Pending',
    refunded: 'Refunded', 'refund_failed': 'Refund Failed',
  };
  return labels[status] || status;
}

export default function TopUpHistoryPage() {
  const [orders, setOrders] = useState<TopUpOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<TopUpOrder | null>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.email) { setError('Please log in to view your order history.'); setLoading(false); return; }

    fetch(`/api/topup?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(result => {
        if (result.success) setOrders(result.data || []);
        else setError('Failed to load orders');
      })
      .catch(() => setError('Failed to connect'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="My Top-Ups" />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,214,10,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="clipboard" size={20} color="#ffd60a" />
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a' }}>MY TOP-UPS</h1>
            <p style={{ fontSize: '10px', color: '#888' }}>Your game top-up order history</p>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="custom-loader" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: '#888', fontSize: '11px' }}>Loading orders...</p>
          </div>
        )}

        {error && !loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon name="question" size={28} color="#555" />
            <p style={{ color: '#888', fontSize: '12px', marginTop: '8px' }}>{error}</p>
            <Link href="/login" style={{ display: 'inline-block', marginTop: '12px', padding: '8px 20px', borderRadius: '8px', background: 'rgba(255,214,10,0.15)', color: '#ffd60a', fontSize: '10px', fontFamily: 'var(--font-arcade)', textDecoration: 'none' }}>
              LOG IN
            </Link>
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon name="game" size={28} color="#555" />
            <p style={{ color: '#888', fontSize: '12px', marginTop: '8px' }}>No top-up orders yet</p>
            <Link href="/topup" style={{ display: 'inline-block', marginTop: '12px', padding: '8px 20px', borderRadius: '8px', background: 'rgba(255,214,10,0.15)', color: '#ffd60a', fontSize: '10px', fontFamily: 'var(--font-arcade)', textDecoration: 'none' }}>
              TOP UP NOW
            </Link>
          </div>
        )}

        {/* Orders List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orders.map(order => {
            const isSelected = selectedOrder?.orderId === order.orderId;
            return (
              <div key={order.orderId}
                onClick={() => setSelectedOrder(isSelected ? null : order)}
                style={{
                  background: '#1a1a2e', borderRadius: '14px', border: '1px solid #2e2e2e',
                  padding: '16px', cursor: 'pointer', transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,214,10,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#2e2e2e')}>
                {/* Order Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,214,10,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                    {order.gameIcon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.gameName}</p>
                    <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>{order.packageName}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#ffd60a', fontFamily: 'var(--font-arcade)' }}>₱{order.finalAmount}</p>
                    <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>{new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Status Badges */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  <span style={{ fontSize: '8px', padding: '3px 8px', borderRadius: '6px', background: `${getStatusColor(order.paymentStatus)}15`, color: getStatusColor(order.paymentStatus), fontWeight: 600, fontFamily: 'var(--font-arcade)' }}>
                    PAY: {getStatusLabel(order.paymentStatus)}
                  </span>
                  <span style={{ fontSize: '8px', padding: '3px 8px', borderRadius: '6px', background: `${getStatusColor(order.topUpStatus)}15`, color: getStatusColor(order.topUpStatus), fontWeight: 600, fontFamily: 'var(--font-arcade)' }}>
                    TOP-UP: {getStatusLabel(order.topUpStatus)}
                  </span>
                </div>

                {/* Expanded Details */}
                {isSelected && (
                  <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #2e2e2e' }}>
                    {[
                      ['Order ID', order.orderId],
                      ['Transaction ID', order.transactionId],
                      ['Game', `${order.gameIcon} ${order.gameName}`],
                      ['Package', `${order.packageName} (${order.packageAmount} ${order.packageCurrency})`],
                      ['Amount', `₱${order.finalAmount}`],
                      ['Payment', order.paymentMethod],
                      ['Ordered', new Date(order.createdAt).toLocaleString()],
                      ...(order.paidAt ? [['Paid', new Date(order.paidAt).toLocaleString()]] : []),
                      ...(order.completedAt ? [['Completed', new Date(order.completedAt).toLocaleString()]] : []),
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '9px', color: '#888' }}>{String(label)}</span>
                        <span style={{ fontSize: '9px', color: '#ccc', fontWeight: 600, fontFamily: label === 'Order ID' || label === 'Transaction ID' ? 'monospace' : 'inherit' }}>{String(value)}</span>
                      </div>
                    ))}

                    {/* Timeline */}
                    <div style={{ marginTop: '14px' }}>
                      <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', marginBottom: '8px' }}>TIMELINE</p>
                      {[
                        { label: 'Order Created', done: true, time: order.createdAt },
                        { label: 'Payment', done: ['paid', 'processing', 'completed'].includes(order.paymentStatus), time: order.paidAt },
                        { label: 'Top-Up Processing', done: order.topUpStatus === 'processing', time: null },
                        { label: 'Completed', done: order.topUpStatus === 'completed', time: order.completedAt },
                      ].map((step, i) => (
                        <div key={step.label} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-start' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: step.done ? '#06d6a0' : '#2e2e2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                            {step.done && <Icon name="check" size={8} color="#000" />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '10px', color: step.done ? '#fff' : '#666', fontWeight: step.done ? 600 : 400 }}>{step.label}</p>
                            {step.time && <p style={{ fontSize: '8px', color: '#666' }}>{new Date(step.time).toLocaleString()}</p>}
                          </div>
                        </div>
                      ))}
                    </div>

                    <Link href={`/topup/track`}
                      style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: '8px', background: 'rgba(255,214,10,0.08)', color: '#ffd60a', fontSize: '10px', fontFamily: 'var(--font-arcade)', textDecoration: 'none', marginTop: '10px', border: '1px solid rgba(255,214,10,0.15)' }}>
                      TRACK ORDER
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
