'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';
import { Icon } from '@/app/components/Icon';

interface FulfillmentOrder {
  _id: string;
  orderId: string;
  transactionId: string;
  gameId: string;
  gameName: string;
  gameIcon: string;
  accountDetails: Record<string, string>;
  packageName: string;
  packageCurrency: string;
  packageAmount: number;
  amount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  topUpStatus: string;
  customerEmail: string;
  customerName: string;
  adminNotes?: string;
  createdAt: string;
  paidAt?: string;
  completedAt?: string;
}

type Filter = 'all' | 'awaiting' | 'completed_today' | 'failed';

export default function AdminFulfillmentPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('awaiting');
  const [selectedOrder, setSelectedOrder] = useState<FulfillmentOrder | null>(null);
  const [fulfilling, setFulfilling] = useState<string | null>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!['muragoods0@gmail.com', 'mhaxthedog@gmail.com'].includes(user.email)) {
      router.push('/');
      return;
    }
    loadOrders();
  }, []);

  const loadOrders = () => {
    setLoading(true);
    fetch('/api/admin/topup-orders')
      .then(r => r.json())
      .then(result => {
        if (result.success) setOrders(result.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const filteredOrders = useMemo(() => {
    const today = new Date().toDateString();
    switch (filter) {
      case 'awaiting':
        return orders.filter(o => o.paymentStatus === 'paid' && ['pending', 'pending_fulfillment'].includes(o.topUpStatus));
      case 'completed_today':
        return orders.filter(o => o.topUpStatus === 'completed' && o.completedAt && new Date(o.completedAt).toDateString() === today);
      case 'failed':
        return orders.filter(o => o.paymentStatus === 'failed' || o.topUpStatus === 'failed' || o.topUpStatus === 'manual_review');
      default:
        return orders;
    }
  }, [orders, filter]);

  const handleFulfill = async (orderId: string) => {
    setFulfilling(orderId);
    try {
      await fetch('/api/admin/topup-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action: 'fulfill' }),
      });
      setOrders(prev => prev.map(o =>
        o.orderId === orderId
          ? { ...o, topUpStatus: 'completed', completedAt: new Date().toISOString(), adminNotes: 'Manually fulfilled by admin' }
          : o
      ));
      setSelectedOrder(null);
    } catch (e) {
      console.error('Fulfill failed:', e);
    }
    setFulfilling(null);
  };

  const handleCannotFulfill = async (orderId: string, reason: string) => {
    setFulfilling(orderId);
    try {
      await fetch('/api/admin/topup-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action: 'fail', reason }),
      });
      setOrders(prev => prev.map(o =>
        o.orderId === orderId
          ? { ...o, topUpStatus: 'manual_review', adminNotes: `Cannot fulfill: ${reason}` }
          : o
      ));
      setSelectedOrder(null);
    } catch (e) {
      console.error('Mark failed:', e);
    }
    setFulfilling(null);
  };

  const awaitingCount = orders.filter(o => o.paymentStatus === 'paid' && ['pending', 'pending_fulfillment'].includes(o.topUpStatus)).length;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Admin — Fulfillment" />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: awaitingCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(6,214,160,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="box" size={22} color={awaitingCount > 0 ? '#f59e0b' : '#06d6a0'} />
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a' }}>FULFILL ORDERS</h1>
            <p style={{ fontSize: '10px', color: '#888' }}>
              {awaitingCount > 0 ? `${awaitingCount} order${awaitingCount !== 1 ? 's' : ''} awaiting fulfillment` : 'All orders fulfilled'}
            </p>
          </div>
          <button onClick={loadOrders} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: '8px', background: 'rgba(255,214,10,0.1)', border: '1px solid rgba(255,214,10,0.2)', color: '#ffd60a', fontSize: '10px', fontFamily: 'var(--font-arcade)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon name="check" size={12} color="#ffd60a" /> REFRESH
          </button>
        </div>

        {/* Stats Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px' }}>
          {[
            { label: 'Awaiting', value: orders.filter(o => o.paymentStatus === 'paid' && ['pending', 'pending_fulfillment'].includes(o.topUpStatus)).length, color: '#f59e0b', filter: 'awaiting' as Filter },
            { label: 'Completed Today', value: orders.filter(o => o.topUpStatus === 'completed' && o.completedAt && new Date(o.completedAt).toDateString() === new Date().toDateString()).length, color: '#06d6a0', filter: 'completed_today' as Filter },
            { label: 'Failed', value: orders.filter(o => o.paymentStatus === 'failed' || o.topUpStatus === 'failed' || o.topUpStatus === 'manual_review').length, color: '#e63946', filter: 'failed' as Filter },
            { label: 'All Orders', value: orders.length, color: '#888', filter: 'all' as Filter },
          ].map(s => (
            <button key={s.label} onClick={() => setFilter(s.filter)}
              style={{
                background: filter === s.filter ? `${s.color}15` : '#1a1a2e',
                border: `1px solid ${filter === s.filter ? `${s.color}44` : '#2e2e2e'}`,
                borderRadius: '10px', padding: '14px 10px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
              }}>
              <p style={{ fontSize: '18px', fontWeight: 900, color: s.color, fontFamily: 'var(--font-arcade)' }}>{s.value}</p>
              <p style={{ fontSize: '8px', color: '#888', marginTop: '4px' }}>{s.label}</p>
            </button>
          ))}
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {(['awaiting', 'all', 'completed_today', 'failed'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: 'none',
                background: filter === f ? 'rgba(255,214,10,0.15)' : '#1a1a2e',
                color: filter === f ? '#ffd60a' : '#888', fontSize: '9px', fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-arcade)',
              }}>
              {f === 'awaiting' ? '⏳ AWAITING' : f === 'completed_today' ? '✅ TODAY' : f === 'failed' ? '❌ FAILED' : '📋 ALL'}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="custom-loader" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: '#888', fontSize: '11px' }}>Loading orders...</p>
          </div>
        )}

        {/* Orders List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredOrders.map(order => {
            const isSelected = selectedOrder?.orderId === order.orderId;
            const isAwaiting = order.paymentStatus === 'paid' && ['pending', 'pending_fulfillment'].includes(order.topUpStatus);

            return (
              <div key={order.orderId}
                onClick={() => setSelectedOrder(isSelected ? null : order)}
                style={{
                  background: '#1a1a2e', borderRadius: '14px',
                  border: `1px solid ${isAwaiting ? 'rgba(245,158,11,0.3)' : '#2e2e2e'}`,
                  padding: '16px', cursor: 'pointer', transition: 'all 0.2s',
                }}>
                {/* Order Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${isAwaiting ? 'rgba(245,158,11,0.1)' : 'rgba(255,214,10,0.05)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                    {order.gameIcon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{order.gameName}</p>
                      {isAwaiting && (
                        <span style={{ fontSize: '7px', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, fontFamily: 'var(--font-arcade)' }}>
                          AWAITING
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>{order.packageName} · {order.packageAmount} {order.packageCurrency}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#ffd60a', fontFamily: 'var(--font-arcade)' }}>₱{order.finalAmount}</p>
                    <p style={{ fontSize: '8px', color: '#888', marginTop: '2px' }}>{order.paymentMethod}</p>
                  </div>
                </div>

                {/* Expanded Details */}
                {isSelected && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #2e2e2e' }}>
                    {/* Account Details — THE MOST IMPORTANT INFO */}
                    <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                      <p style={{ fontSize: '9px', color: '#f59e0b', fontFamily: 'var(--font-arcade)', marginBottom: '8px' }}>🎮 ACCOUNT DETAILS — TOP UP THIS</p>
                      {Object.entries(order.accountDetails).filter(([, v]) => v).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
                          <span style={{ fontSize: '10px', color: '#888', textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span>
                          <span style={{ fontSize: '12px', color: '#fff', fontWeight: 700, fontFamily: 'monospace' }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Order Info */}
                    {[
                      ['Order ID', order.orderId],
                      ['Transaction ID', order.transactionId],
                      ['Customer', order.customerEmail],
                      ['Amount Paid', `₱${order.finalAmount}`],
                      ['Payment', order.paymentMethod],
                      ['Ordered', new Date(order.createdAt).toLocaleString()],
                      ...(order.paidAt ? [['Paid At', new Date(order.paidAt).toLocaleString()]] : []),
                      ...(order.adminNotes ? [['Notes', order.adminNotes]] : []),
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '9px', color: '#888' }}>{String(label)}</span>
                        <span style={{ fontSize: '9px', color: '#ccc', fontWeight: 600, maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(value)}</span>
                      </div>
                    ))}

                    {/* Action Buttons — Only for awaiting orders */}
                    {isAwaiting && (
                      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleFulfill(order.orderId); }}
                          disabled={fulfilling === order.orderId}
                          style={{
                            flex: 1, padding: '12px', borderRadius: '10px',
                            background: fulfilling === order.orderId ? '#555' : 'linear-gradient(135deg, #06d6a0, #059669)',
                            border: 'none', color: '#fff', fontSize: '11px', fontWeight: 700,
                            fontFamily: 'var(--font-arcade)', cursor: fulfilling === order.orderId ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          }}>
                          <Icon name="check" size={14} color="#fff" />
                          {fulfilling === order.orderId ? 'FULFILLING...' : 'FULFILL ORDER'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCannotFulfill(order.orderId, 'Admin marked as unable to fulfill'); }}
                          disabled={fulfilling === order.orderId}
                          style={{
                            padding: '12px 16px', borderRadius: '10px',
                            background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)',
                            color: '#e63946', fontSize: '11px', fontWeight: 700,
                            fontFamily: 'var(--font-arcade)', cursor: 'pointer',
                          }}>
                          CAN&apos;T FULFILL
                        </button>
                      </div>
                    )}

                    {/* Already fulfilled */}
                    {order.topUpStatus === 'completed' && (
                      <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(6,214,160,0.08)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icon name="check" size={14} color="#06d6a0" />
                        <p style={{ fontSize: '10px', color: '#06d6a0', fontWeight: 600 }}>
                          Fulfilled{order.completedAt ? ` at ${new Date(order.completedAt).toLocaleString()}` : ''}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && filteredOrders.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <Icon name="checkSquare" size={28} color="#555" />
              <p style={{ color: '#888', fontSize: '12px', marginTop: '8px' }}>
                {filter === 'awaiting' ? 'No orders awaiting fulfillment — all caught up!' : 'No orders match this filter'}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
