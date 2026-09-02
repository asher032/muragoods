'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const TIMELINE_STEPS = [
  { key: 'created', label: 'Order Created', icon: '📋' },
  { key: 'paid', label: 'Payment Confirmed', icon: '💳' },
  { key: 'processing', label: 'Top-Up Processing', icon: '⏳' },
  { key: 'completed', label: 'Completed', icon: '✅' },
];

function getTimelineIndex(paymentStatus: string, topUpStatus: string): number {
  if (topUpStatus === 'completed') return 3;
  if (topUpStatus === 'processing') return 2;
  if (paymentStatus === 'paid') return 2;
  if (paymentStatus === 'processing') return 1;
  if (paymentStatus === 'pending') return 0;
  if (['failed', 'cancelled', 'expired'].includes(paymentStatus)) return 1;
  return 0;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) { setError('No order ID'); setLoading(false); return; }

    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/topup?orderId=${orderId}`);
        const result = await res.json();
        if (result.success) {
          setOrder(result.data);
        } else {
          setError(result.error || 'Order not found');
        }
      } catch {
        setError('Failed to load order');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
    // Poll for status updates every 10s
    const interval = setInterval(fetchOrder, 10000);
    return () => clearInterval(interval);
  }, [orderId]);

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--mario-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="custom-loader" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: '#ffd60a', fontSize: '12px', fontFamily: 'var(--font-arcade)' }}>LOADING...</p>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--mario-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '400px', textAlign: 'center' }}>
          <p style={{ color: '#e63946', fontSize: '13px', marginBottom: '16px' }}>⚠ {error || 'Order not found'}</p>
          <Link href="/topup" style={{ color: '#ffd60a', fontSize: '11px', fontFamily: 'var(--font-arcade)', textDecoration: 'none' }}>← Back to Top-Up</Link>
        </div>
      </main>
    );
  }

  const paymentStatus = order.paymentStatus as string;
  const topUpStatus = order.topUpStatus as string;
  const timelineIndex = getTimelineIndex(paymentStatus, topUpStatus);
  const isFailed = ['failed', 'cancelled', 'expired'].includes(paymentStatus);

  const accountDetails = (order.accountDetails || {}) as Record<string, string>;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)', padding: '20px 16px' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        {/* Status Header */}
        <div style={{
          textAlign: 'center', padding: '32px 20px', borderRadius: '16px',
          background: isFailed
            ? 'linear-gradient(135deg, rgba(230,57,70,0.08), rgba(230,57,70,0.02))'
            : topUpStatus === 'completed'
            ? 'linear-gradient(135deg, rgba(6,214,160,0.08), rgba(6,214,160,0.02))'
            : 'linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,214,10,0.02))',
          border: isFailed ? '1px solid rgba(230,57,70,0.25)' : topUpStatus === 'completed' ? '1px solid rgba(6,214,160,0.25)' : '1px solid rgba(255,214,10,0.25)',
          marginBottom: '20px',
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
            background: isFailed ? 'rgba(230,57,70,0.15)' : topUpStatus === 'completed' ? 'rgba(6,214,160,0.15)' : 'rgba(255,214,10,0.15)',
            border: isFailed ? '2px solid rgba(230,57,70,0.4)' : topUpStatus === 'completed' ? '2px solid rgba(6,214,160,0.4)' : '2px solid rgba(255,214,10,0.4)',
          }}>
            {isFailed ? '✕' : topUpStatus === 'completed' ? '✓' : '⏳'}
          </div>
          <h2 style={{
            fontFamily: 'var(--font-arcade)', fontSize: '14px',
            color: isFailed ? '#e63946' : topUpStatus === 'completed' ? '#06d6a0' : '#ffd60a',
            marginBottom: '8px',
          }}>
            {isFailed ? 'PAYMENT UNSUCCESSFUL' : topUpStatus === 'completed' ? 'TOP-UP COMPLETED!' : 'PAYMENT CONFIRMED'}
          </h2>
          <p style={{ fontSize: '11px', color: '#888' }}>
            {isFailed ? 'We couldn\'t complete your payment.' : topUpStatus === 'completed' ? 'Your game top-up has been delivered.' : 'Your payment was received. Top-up is being processed.'}
          </p>
        </div>

        {/* Timeline */}
        <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid #2e2e2e' }}>
          <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', marginBottom: '16px' }}>ORDER TIMELINE</p>
          {TIMELINE_STEPS.map((s, i) => {
            const isActive = i === timelineIndex;
            const isDone = i < timelineIndex || (isFailed && i === 1);
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: i < TIMELINE_STEPS.length - 1 ? '12px' : 0 }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isDone ? 'rgba(6,214,160,0.15)' : isActive ? 'rgba(255,214,10,0.15)' : '#222',
                  border: isDone ? '1px solid rgba(6,214,160,0.4)' : isActive ? '1px solid rgba(255,214,10,0.4)' : '1px solid #333',
                  fontSize: '12px', flexShrink: 0,
                }}>
                  {isDone ? '✓' : isActive ? (isFailed && i === 1 ? '✕' : '●') : '○'}
                </div>
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: isDone ? '#06d6a0' : isActive ? '#ffd60a' : '#555' }}>{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order Details */}
        <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #2e2e2e' }}>
          {[
            ['Game', `${order.gameIcon} ${order.gameName}`],
            ['Account', Object.entries(accountDetails).filter(([,v]) => v).map(([k, v]) => `${k}: ${v}`).join(' / ')],
            ['Package', order.packageName],
            ['Amount', `₱${order.finalAmount}`],
            ['Transaction ID', order.transactionId],
            ['Payment', order.paymentMethod],
            ['Payment Status', paymentStatus],
            ['Top-Up Status', topUpStatus],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
              <span style={{ fontSize: '10px', color: '#888' }}>{String(label)}</span>
              <span style={{ fontSize: '10px', color: '#fff', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{String(value)}</span>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {isFailed && (
            <Link href={`/topup?retry=${order.orderId}`} style={{
              flex: 1, padding: '12px', borderRadius: '10px', textAlign: 'center',
              background: 'rgba(255,214,10,0.1)', border: '1px solid rgba(255,214,10,0.2)',
              color: '#ffd60a', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-arcade)', textDecoration: 'none',
            }}>TRY AGAIN</Link>
          )}
          <Link href="/topup/track" style={{
            flex: 1, padding: '12px', borderRadius: '10px', textAlign: 'center',
            background: 'rgba(72,149,239,0.1)', border: '1px solid rgba(72,149,239,0.2)',
            color: '#4895ef', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-arcade)', textDecoration: 'none',
          }}>TRACK ORDER</Link>
          <Link href="/topup" style={{
            flex: 1, padding: '12px', borderRadius: '10px', textAlign: 'center',
            background: '#222', border: '1px solid #333',
            color: '#888', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-arcade)', textDecoration: 'none',
          }}>NEW TOP-UP</Link>
        </div>
      </div>
    </main>
  );
}

export default function TopUpSuccessPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: 'var(--mario-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="custom-loader" />
      </main>
    }>
      <SuccessContent />
    </Suspense>
  );
}
