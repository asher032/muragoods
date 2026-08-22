'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { NavBar } from '@/app/components/NavBar';

const Receipt = dynamic(() => import('@/app/components/Receipt'), { ssr: false });

interface OrderData {
  _id: string;
  customer: string;
  phone: string;
  zone: string;
  address: string;
  payment: string;
  deliveryDate: string;
  deliveryTimeSlot?: string;
  deliveryType: string;
  status: string;
  total: number;
  items: string[];
  pointsEarned: number;
  createdAt: string;
}

export default function ReceiptPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const [order, setOrder] = useState<OrderData | null>(null);
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
          const found = result.data.find((o: any) => o._id === orderId || o.id === orderId);
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
      }
      setLoading(false);
    }

    if (orderId) fetchOrder();
  }, [orderId, router]);

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
        <NavBar pageLabel="Receipt" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <p style={{ color: 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '12px' }} className="animate-pulse">
            LOADING RECEIPT...
          </p>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
        <NavBar pageLabel="Receipt" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--mario-red)', fontSize: '14px', marginBottom: '8px' }}>⚠ {error || 'Order not found'}</p>
            <button onClick={() => router.push('/orders')} style={{ padding: '8px 20px', background: 'rgba(255,214,10,0.15)', border: '1px solid rgba(255,214,10,0.3)', borderRadius: '6px', color: 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>
              Back to Orders
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Parse items from the order
  const parseItems = (items: string[]) => {
    return items.map(itemStr => {
      // Format: "Musubi (Regular) x 2"
      const match = itemStr.match(/^(.+?)\s*\((.+?)\)\s*x\s*(\d+)$/);
      if (match) {
        return {
          name: match[1].trim(),
          variant: match[2].trim(),
          quantity: parseInt(match[3]),
          price: 0, // Will calculate from total
        };
      }
      // Fallback
      return {
        name: itemStr,
        variant: 'Standard',
        quantity: 1,
        price: 0,
      };
    });
  };

  const parsedItems = parseItems(order.items || []);
  // Estimate item prices from total
  const itemCount = parsedItems.reduce((sum, item) => sum + item.quantity, 0);
  const avgPrice = order.total / Math.max(itemCount, 1);
  parsedItems.forEach(item => {
    item.price = Math.round(avgPrice);
  });

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Receipt" />

      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h1 style={{ color: 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '16px', marginBottom: '4px' }}>
            🧾 ORDER RECEIPT
          </h1>
          <p style={{ color: 'var(--mario-text-muted)', fontSize: '11px' }}>
            Order #{orderId.slice(-8).toUpperCase()}
          </p>
        </div>

        {/* Receipt */}
        <Receipt
          orderId={orderId}
          customerName={order.customer}
          items={parsedItems}
          subtotal={order.total}
          shippingFee={0}
          discount={0}
          promoDiscount={0}
          total={order.total}
          paymentMethod={order.payment}
          deliveryDate={order.deliveryDate}
          deliveryTimeSlot={order.deliveryTimeSlot}
          deliveryService={order.deliveryType}
          zone={order.zone}
          address={order.address}
          pointsEarned={order.pointsEarned || 0}
          createdAt={order.createdAt}
        />

        {/* Back Button */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            onClick={() => router.push(`/order/${orderId}`)}
            style={{
              padding: '10px 24px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: 'var(--mario-text-muted)',
              fontFamily: 'var(--font-arcade)',
              fontSize: '10px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ← Back to Order Details
          </button>
        </div>
      </div>
    </main>
  );
}
