'use client';

import { useState } from 'react';
import { NavBar } from '@/app/components/NavBar';
import Link from 'next/link';
import { getPaymentStatusColor, getTopUpStatusColor } from '@/app/lib/game-catalog';

const TIMELINE_STEPS = [
  { key: 'created', label: 'Order Created' },
  { key: 'paid', label: 'Payment Confirmed' },
  { key: 'processing', label: 'Top-Up Processing' },
  { key: 'completed', label: 'Completed' },
];

function getTimelineIndex(paymentStatus: string, topUpStatus: string): number {
  if (topUpStatus === 'completed') return 3;
  if (topUpStatus === 'processing' || paymentStatus === 'paid') return 2;
  if (paymentStatus === 'processing') return 1;
  return 0;
}

export default function TrackOrderPage() {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) { setError('Enter an Order ID or Transaction ID'); return; }
    setLoading(true);
    setError('');
    setOrder(null);

    try {
      const isOrderId = query.startsWith('TU-');
      const isTxnId = query.startsWith('TXN-');
      const param = isOrderId ? 'orderId' : isTxnId ? 'transactionId' : 'orderId';
      const res = await fetch(`/api/topup?${param}=${encodeURIComponent(query.trim())}`);
      const result = await res.json();
      if (result.success && result.data) {
        setOrder(result.data);
      } else {
        setError('Order not found. Check your ID and try again.');
      }
    } catch {
      setError('Failed to search. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const accountDetails = (order?.accountDetails || {}) as Record<string, string>;
  const paymentStatus = (order?.paymentStatus as string) || 'pending';
  const topUpStatus = (order?.topUpStatus as string) || 'pending';
  const timelineIndex = getTimelineIndex(paymentStatus, topUpStatus);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Track Order" />
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '20px 16px' }}>
        <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a', marginBottom: '16px' }}>TRACK YOUR ORDER</h2>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter Order ID (TU-...) or Transaction ID (TXN-...)"
            className="input_field"
            style={{ flex: 1 }}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{
              padding: '10px 16px', borderRadius: '8px',
              background: 'rgba(255,214,10,0.15)', border: '1px solid rgba(255,214,10,0.3)',
              color: '#ffd60a', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-arcade)',
            }}
          >
            {loading ? '...' : 'SEARCH'}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '11px', color: '#e63946' }}>
            ⚠ {error}
          </div>
        )}

        {order && (
          <div className="page-enter">
            {/* Timeline */}
            <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid #2e2e2e' }}>
              {TIMELINE_STEPS.map((s, i) => {
                const isDone = i <= timelineIndex;
                const isActive = i === timelineIndex;
                return (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: i < TIMELINE_STEPS.length - 1 ? '14px' : 0 }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? 'rgba(6,214,160,0.15)' : '#222',
                      border: isDone ? '1px solid rgba(6,214,160,0.4)' : '1px solid #333',
                      fontSize: '10px', flexShrink: 0,
                    }}>
                      {isDone ? '✓' : '○'}
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: isActive ? 700 : 400, color: isDone ? '#06d6a0' : '#555' }}>{s.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Details */}
            <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #2e2e2e' }}>
              {[
                ['Game', `${order.gameIcon} ${order.gameName}`],
                ['Account', Object.entries(accountDetails).filter(([,v]) => v).map(([k, v]) => `${k}: ${v}`).join(' / ')],
                ['Package', order.packageName],
                ['Amount', `₱${order.finalAmount}`],
                ['Transaction ID', order.transactionId],
                ['Payment Method', order.paymentMethod],
                ['Payment Status', <span key="ps" style={{ color: getPaymentStatusColor(paymentStatus), fontWeight: 600 }}>{paymentStatus}</span>],
                ['Top-Up Status', <span key="ts" style={{ color: getTopUpStatusColor(topUpStatus), fontWeight: 600 }}>{topUpStatus}</span>],
                ['Created', new Date(order.createdAt as string).toLocaleString()],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
                  <span style={{ fontSize: '10px', color: '#888' }}>{String(label)}</span>
                  <span style={{ fontSize: '10px', color: '#fff' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Link href="/topup" style={{ fontSize: '11px', color: '#888', textDecoration: 'none', fontFamily: 'var(--font-arcade)' }}>← NEW TOP-UP</Link>
        </div>
      </div>
    </main>
  );
}
