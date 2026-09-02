'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');

  const [status, setStatus] = useState<'loading' | 'success' | 'failed' | 'pending'>('loading');
  const [orderDetails, setOrderDetails] = useState<{
    amount: number;
    referenceNumber: string;
    paymentMethod: string;
    paidAt: string;
  } | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus('failed');
      return;
    }

    const checkPayment = async () => {
      try {
        const res = await fetch(`/api/paymongo?session_id=${sessionId}`);
        const result = await res.json();

        if (result.success) {
          const { paymentStatus, amount, referenceNumber } = result.data;
          const paymentMethod = result.data.metadata?.paymentMethod || 'GCash';

          setOrderDetails({
            amount,
            referenceNumber,
            paymentMethod,
            paidAt: new Date().toLocaleString(),
          });

          if (paymentStatus === 'paid') {
            setStatus('success');
          } else if (paymentStatus === 'failed') {
            setStatus('failed');
          } else {
            setStatus('pending');
          }
        } else {
          setStatus('failed');
        }
      } catch {
        setStatus('failed');
      }
    };

    checkPayment();
  }, [sessionId]);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ maxWidth: '400px', width: '100%' }}>
        {status === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="custom-loader" style={{ margin: '0 auto 20px' }} />
            <p style={{ color: '#ffd60a', fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-arcade)' }}>
              CHECKING PAYMENT...
            </p>
            <p style={{ color: '#888', fontSize: '11px', marginTop: '8px' }}>
              Verifying your payment status
            </p>
          </div>
        )}

        {status === 'success' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(6,214,160,0.08), rgba(6,214,160,0.02))',
            border: '1px solid rgba(6,214,160,0.25)',
            borderRadius: '16px',
            padding: '32px 24px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(6,214,160,0.15)', border: '2px solid rgba(6,214,160,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: '28px', color: '#06d6a0',
            }}>✓</div>
            <h2 style={{ color: '#06d6a0', fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-arcade)', marginBottom: '8px' }}>
              PAYMENT SUCCESSFUL!
            </h2>
            <p style={{ color: '#ccc', fontSize: '12px', marginBottom: '20px' }}>
              Your order has been confirmed and is being prepared.
            </p>

            {orderDetails && (
              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', padding: '16px', marginBottom: '20px', textAlign: 'left',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#888', fontSize: '11px' }}>Amount Paid</span>
                  <span style={{ color: '#fff', fontSize: '12px', fontWeight: 600 }}>₱{orderDetails.amount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#888', fontSize: '11px' }}>Reference</span>
                  <span style={{ color: '#fff', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-arcade)' }}>
                    {orderDetails.referenceNumber}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#888', fontSize: '11px' }}>Method</span>
                  <span style={{ color: '#ffd60a', fontSize: '11px', fontWeight: 600 }}>{orderDetails.paymentMethod}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888', fontSize: '11px' }}>Paid At</span>
                  <span style={{ color: '#fff', fontSize: '11px' }}>{orderDetails.paidAt}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <Link href="/orders" style={{
                padding: '10px 20px', background: 'rgba(6,214,160,0.15)', border: '1px solid rgba(6,214,160,0.3)',
                borderRadius: '8px', color: '#06d6a0', fontSize: '11px', fontWeight: 600,
                textDecoration: 'none', fontFamily: 'var(--font-arcade)',
              }}>MY ORDERS</Link>
              <Link href="/menu" style={{
                padding: '10px 20px', background: 'rgba(255,214,10,0.1)', border: '1px solid rgba(255,214,10,0.2)',
                borderRadius: '8px', color: '#ffd60a', fontSize: '11px', fontWeight: 600,
                textDecoration: 'none', fontFamily: 'var(--font-arcade)',
              }}>ORDER MORE</Link>
            </div>
          </div>
        )}

        {status === 'pending' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,214,10,0.02))',
            border: '1px solid rgba(255,214,10,0.25)',
            borderRadius: '16px', padding: '32px 24px', textAlign: 'center',
          }}>
            <div className="custom-loader" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ color: '#ffd60a', fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-arcade)', marginBottom: '8px' }}>
              PAYMENT PENDING
            </h2>
            <p style={{ color: '#ccc', fontSize: '12px', marginBottom: '16px' }}>
              Your payment is being processed. This may take a moment.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px', background: 'rgba(255,214,10,0.1)', border: '1px solid rgba(255,214,10,0.2)',
                borderRadius: '8px', color: '#ffd60a', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-arcade)',
              }}
            >CHECK AGAIN</button>
          </div>
        )}

        {status === 'failed' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(230,57,70,0.08), rgba(230,57,70,0.02))',
            border: '1px solid rgba(230,57,70,0.25)',
            borderRadius: '16px', padding: '32px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(230,57,70,0.15)', border: '2px solid rgba(230,57,70,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: '28px', color: '#e63946',
            }}>✕</div>
            <h2 style={{ color: '#e63946', fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-arcade)', marginBottom: '8px' }}>
              PAYMENT FAILED
            </h2>
            <p style={{ color: '#ccc', fontSize: '12px', marginBottom: '20px' }}>
              {sessionId ? 'We couldn\'t verify your payment. Please try again.' : 'No session found. Please try checking out again.'}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <Link href="/checkout" style={{
                padding: '10px 20px', background: 'rgba(255,214,10,0.1)', border: '1px solid rgba(255,214,10,0.2)',
                borderRadius: '8px', color: '#ffd60a', fontSize: '11px', fontWeight: 600,
                textDecoration: 'none', fontFamily: 'var(--font-arcade)',
              }}>TRY AGAIN</Link>
              <Link href="/menu" style={{
                padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', color: '#888', fontSize: '11px', fontWeight: 600,
                textDecoration: 'none', fontFamily: 'var(--font-arcade)',
              }}>BACK TO MENU</Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: 'var(--mario-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="custom-loader" />
      </main>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
