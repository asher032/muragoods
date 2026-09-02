'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';
import { getPaymentStatusColor, getTopUpStatusColor } from '@/app/lib/game-catalog';

type Filter = 'all' | 'pending' | 'processing' | 'paid' | 'failed' | 'refund_pending' | 'refunded';

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const adminEmails = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];
    if (!adminEmails.includes(user.email)) {
      router.push('/');
      return;
    }
    fetchOrders();
  }, [router]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/topup-orders');
      const result = await res.json();
      if (result.success) {
        setOrders(result.data || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.paymentStatus === filter);

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.paymentStatus === 'pending').length,
    processing: orders.filter(o => o.paymentStatus === 'processing').length,
    paid: orders.filter(o => o.paymentStatus === 'paid').length,
    failed: orders.filter(o => o.paymentStatus === 'failed').length,
    refundPending: orders.filter(o => o.paymentStatus === 'refund_pending').length,
    refunded: orders.filter(o => o.paymentStatus === 'refunded').length,
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Payment Recovery" />
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px' }}>
        <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a', marginBottom: '16px' }}>PAYMENT RECOVERY</h2>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginBottom: '20px' }}>
          {[
            { label: 'Total', value: stats.total, color: '#fff' },
            { label: 'Pending', value: stats.pending, color: '#888' },
            { label: 'Processing', value: stats.processing, color: '#ffd60a' },
            { label: 'Paid', value: stats.paid, color: '#06d6a0' },
            { label: 'Failed', value: stats.failed, color: '#e63946' },
            { label: 'Refund Pending', value: stats.refundPending, color: '#f59e0b' },
            { label: 'Refunded', value: stats.refunded, color: '#4895ef' },
          ].map(s => (
            <div key={s.label} style={{ background: '#1a1a2e', borderRadius: '8px', padding: '12px', border: '1px solid #2e2e2e', textAlign: 'center' }}>
              <p style={{ fontSize: '18px', fontWeight: 900, color: s.color, fontFamily: 'var(--font-arcade)' }}>{s.value}</p>
              <p style={{ fontSize: '8px', color: '#888', marginTop: '4px' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
          {(['all', 'pending', 'processing', 'paid', 'failed', 'refund_pending', 'refunded'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSelectedOrder(null); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', border: 'none',
                background: filter === f ? 'rgba(255,214,10,0.15)' : '#222',
                color: filter === f ? '#ffd60a' : '#888',
                fontSize: '9px', fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-arcade)', whiteSpace: 'nowrap',
              }}
            >
              {f.replace(/_/g, ' ').toUpperCase()}
            </button>
          ))}
          <button onClick={fetchOrders} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#222', color: '#888', fontSize: '9px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-arcade)' }}>
            🔄 REFRESH
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="custom-loader" style={{ margin: '0 auto' }} />
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666', fontSize: '12px', padding: '40px' }}>No orders found for this filter.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map((order) => {
              const payStatus = String(order.paymentStatus || 'pending') as 'pending' | 'processing' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refund_pending' | 'refund_processing' | 'refunded' | 'refund_failed';
              const tuStatus = String(order.topUpStatus || 'pending') as 'pending' | 'processing' | 'completed' | 'failed' | 'manual_review';
              const accountDetails = (order.accountDetails || {}) as Record<string, string>;
              const isSelected = selectedOrder?.orderId === order.orderId;

              return (
                <div
                  key={String(order.orderId)}
                  onClick={() => setSelectedOrder(isSelected ? null : order)}
                  style={{
                    background: '#1a1a2e', borderRadius: '10px', padding: '14px 16px',
                    border: isSelected ? '1px solid rgba(255,214,10,0.3)' : '1px solid #2e2e2e',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>{String(order.gameIcon)}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{String(order.gameName)} — {String(order.packageName)}</p>
                      <p style={{ fontSize: '9px', color: '#888' }}>{String(order.orderId)} · {String(order.transactionId)}</p>
                    </div>
                    <p style={{ fontSize: '13px', fontWeight: 900, color: '#ffd60a', fontFamily: 'var(--font-arcade)' }}>₱{String(order.finalAmount)}</p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '4px', background: `${getPaymentStatusColor(payStatus)}20`, color: getPaymentStatusColor(payStatus), fontWeight: 600 }}>
                      {payStatus}
                    </span>
                    <span style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '4px', background: `${getTopUpStatusColor(tuStatus)}20`, color: getTopUpStatusColor(tuStatus), fontWeight: 600 }}>
                      {tuStatus}
                    </span>
                    <span style={{ fontSize: '9px', color: '#666', marginLeft: 'auto' }}>
                      {new Date(order.createdAt as string).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Expanded Details */}
                  {isSelected && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #2e2e2e' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10px' }}>
                        {[
                          ['Account', Object.entries(accountDetails).filter(([,v]) => v).map(([k, v]) => `${k}: ${v}`).join(' / ')],
                          ['Customer', String(order.customerEmail)],
                          ['Payment', String(order.paymentMethod)],
                          ['Attempts', String(order.paymentAttempts)],
                          ['Retries', String(order.retryCount)],
                          ['Session', String(order.paymongoSessionId || 'N/A')],
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <p style={{ color: '#888', marginBottom: '2px' }}>{String(label)}</p>
                            <p style={{ color: '#ccc' }}>{String(value)}</p>
                          </div>
                        ))}
                      </div>

                      {String(order.adminNotes || '') && (
                        <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(255,214,10,0.05)', borderRadius: '6px' }}>
                          <p style={{ fontSize: '9px', color: '#888' }}>Admin Notes: {String(order.adminNotes)}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
