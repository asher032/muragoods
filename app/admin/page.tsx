'use client';

import Image from 'next/image';
import { adminCredentials, adminEmails, products, type InventoryStatus, type Order, type OrderStatus, type Product } from '@/app/lib/muragoods-data';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { UsersCoinsPanel } from '@/app/components/UsersCoinsPanel';

const statusOptions = [
  'Pending Payment',
  'Payment Verified',
  'Preparing',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
] as const;

const inventoryCycle: InventoryStatus[] = ['In Stock', 'Out of Stock', 'Pre-Order Only'];

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<(Order & { userId: string; _id?: string })[]>([]);
  const [catalog, setCatalog] = useState<(Product & { dbInventory?: InventoryStatus })[]>(products);
  const [alert, setAlert] = useState<{ show: boolean; message: string; orderId?: string }>({ show: false, message: '' });
  const [previewReceipt, setPreviewReceipt] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const syncCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch('/api/products');
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        const dbMap = new Map<string, InventoryStatus>(result.data.map((p: { id: string; inventory: InventoryStatus }) => [p.id, p.inventory]));
        setCatalog(products.map(p => ({ ...p, inventory: (dbMap.get(p.id) as InventoryStatus) || p.inventory })));
      } else {
        setCatalog(products);
      }
    } catch {
      setCatalog(products);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?isAdmin=true');
      const result = await res.json();
      if (result.success) setOrders(result.data);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    syncCatalog();
    fetchOrders();

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/orders?isAdmin=true');
        const result = await res.json();
        if (result.success && result.data.length > orders.length) {
          const newOrder = result.data[0];
          setAlert({ show: true, message: `NEW ORDER! ${newOrder.customer} - ₱${newOrder.total}`, orderId: newOrder._id || newOrder.id });
          setOrders(result.data);
          setTimeout(() => setAlert({ show: false, message: '' }), 5000);
        }
      } catch (err) {
        console.error(err);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, orders.length, fetchOrders, syncCatalog]);

  const summary = useMemo(() => {
    const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
    const pending = orders.filter(o => o.status === 'Pending Payment').length;
    const preparing = orders.filter(o => o.status === 'Preparing').length;
    const delivered = orders.filter(o => o.status === 'Delivered').length;
    const cancelled = orders.filter(o => o.status === 'Cancelled').length;
    return { totalSales, pending, preparing, delivered, cancelled };
  }, [orders]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmails.includes(email)) { setError('UNAUTHORIZED! Only authorized admin accounts have access.'); return; }
    if ((email === adminCredentials.email && password === adminCredentials.password) || (email === 'mhaxthedog@gmail.com' && password === 'Jesusmaryosepcasiram')) {
      localStorage.setItem('user', JSON.stringify({ email, name: email.split('@')[0] }));
      setIsAuthenticated(true);
      setError('');
      fetchOrders();
    } else {
      setError('Invalid Password.');
    }
  };

  const handleStatusUpdate = async (orderId: string, nextStatus: string) => {
    try {
      const historyEntry = { status: nextStatus, timestamp: new Date().toISOString() };
      const updateData: Record<string, unknown> = { status: nextStatus, $push: { statusHistory: historyEntry } };

      // Award points when marking as Delivered
      if (nextStatus === 'Delivered') {
        const order = orders.find(o => (o._id || o.id) === orderId);
        if (order && order.userId && order.pointsEarned && order.pointsEarned > 0) {
          // Add coins to user's server-side balance
          await fetch('/api/admin/coins', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: order.userId,
              action: 'add',
              amount: order.pointsEarned,
              reason: `Order #${orderId.slice(-8).toUpperCase()} delivered`,
            }),
          }).catch(() => {});
        }
      }

      const res = await fetch(`/api/orders?id=${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      const result = await res.json();
      if (result.success) {
        setOrders(current => current.map(order => (order._id || order.id) === orderId ? { ...order, status: nextStatus as OrderStatus } : order));
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to remove this order?')) return;
    try {
      const res = await fetch(`/api/orders?id=${orderId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) setOrders(orders.filter(o => (o._id || o.id) !== orderId));
    } catch (err) { console.error(err); }
  };

  const handleUpdateInventory = async (productId: string) => {
    const product = catalog.find(p => p.id === productId);
    if (!product) return;
    const nextIndex = (inventoryCycle.indexOf(product.inventory) + 1) % inventoryCycle.length;
    const nextInventory = inventoryCycle[nextIndex];
    try {
      const res = await fetch(`/api/products?id=${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inventory: nextInventory }) });
      const result = await res.json();
      if (result.success) {
        setCatalog(current => current.map(p => p.id === productId ? { ...p, inventory: nextInventory } : p));
        setTimeout(syncCatalog, 500);
      }
    } catch (err) { console.error(err); }
  };

  // ─── Login Screen ──────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md border-2 border-[var(--gold)] bg-[var(--charcoal)] p-8 rounded-2xl">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative h-16 w-16 border-2 border-[var(--gold)] overflow-hidden rounded-full">
              <Image src="/images/muragoods-logo.png" alt="Muragoods Logo" fill className="object-cover" />
            </div>
            <p className="text-[11px] text-[var(--gold-bright)] uppercase tracking-[0.2em]" style={{ fontFamily: 'var(--font-arcade)' }}>
              Admin Portal
            </p>
          </div>
          <h1 className="text-xl text-center text-[var(--cream)] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>ADMIN LOGIN</h1>
          <p className="text-sm text-[var(--pewter)] text-center mb-6">Muragoods Secure Access</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block">
              <span className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Admin Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="deco-input rounded-xl" />
            </label>
            <label className="block">
              <span className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="deco-input rounded-xl" />
            </label>
            {error && (
              <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-3 text-sm text-[var(--crimson)] rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
                ⚠ {error}
              </div>
            )}
            <button type="submit" className="deco-btn deco-btn-crimson w-full deco-btn-lg mt-6 rounded-xl">ENTER DASHBOARD</button>
          </form>
        </div>
      </main>
    );
  }

  // ─── Dashboard ─────────────────────────────────────────────
  return (
    <main className="min-h-screen px-4 py-8 sm:px-8">
      <div className="deco-container">
        {/* Alert Banner */}
        {alert.show && (
          <div className="mb-8 border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] p-4 text-sm text-[var(--gold-bright)] animate-pulse rounded-xl" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>
            📢 {alert.message}
          </div>
        )}

        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 border-2 border-[var(--gold)] bg-[var(--charcoal)] p-6 md:flex-row md:items-center md:justify-between rounded-2xl">
          <div>
            <p className="text-[11px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>Admin</p>
            <h1 className="mt-2 text-xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Muragoods Dashboard</h1>
          </div>
          <div className="flex gap-3">
            <a href="/" className="deco-btn deco-btn-sm">Back to Shop</a>
            <a href="/admin/analytics" className="deco-btn deco-btn-sm deco-btn-gold">📊 Analytics</a>
            <a href="/admin/promo-codes" className="deco-btn deco-btn-sm deco-btn-gold">🎁 Promos</a>
            <a href="/admin/support" className="deco-btn deco-btn-sm deco-btn-gold">💬 Support</a>
            <a href="/admin/verification" className="deco-btn deco-btn-sm deco-btn-gold">📧 Verify</a>
            <button type="button" onClick={() => setIsAuthenticated(false)} className="deco-btn deco-btn-crimson">LOG OUT</button>
          </div>
        </header>

        {/* Summary Cards */}
        <section className="grid gap-4 md:grid-cols-5">
          {[
            { label: "Today's Sales", value: `₱${summary.totalSales}`, color: 'var(--gold-bright)' },
            { label: 'Pending', value: String(summary.pending), color: 'var(--gold)' },
            { label: 'Preparing', value: String(summary.preparing), color: 'var(--gold)' },
            { label: 'Delivered', value: String(summary.delivered), color: 'var(--emerald-bright)' },
            { label: 'Cancelled', value: String(summary.cancelled), color: 'var(--crimson)' },
          ].map(card => (
            <div key={card.label} className="power-card p-5 rounded-xl">
              <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>{card.label}</p>
              <p className="mt-3 text-xl" style={{ fontFamily: 'var(--font-arcade)', color: card.color }}>{card.value}</p>
            </div>
          ))}
        </section>

        {/* Main Content */}
        <section className="mt-8 grid gap-8 xl:grid-cols-[1.4fr_0.8fr]">
          {/* Orders Table */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-6 rounded-2xl">
            <h2 className="text-sm text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Live Order Feed</h2>
            <div className="mt-6 overflow-x-auto border border-[rgba(242,240,228,0.12)] rounded-xl">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--obsidian)]">
                  <tr>
                    {['Order', 'Customer', 'Zone', 'Pin', 'Details', 'Status', 'Action'].map(h => (
                      <th key={h} className="px-3 py-3 text-[9px] text-[var(--gold)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <tr key={order._id || order.id} className={`border-t border-[rgba(242,240,228,0.08)] transition-colors hover:bg-[var(--charcoal-light)] ${idx % 2 === 0 ? '' : 'bg-[rgba(212,175,55,0.02)]'}`}>
                      <td className="px-3 py-3 text-xs text-[var(--cream-muted)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>{(order._id || order.id).slice(-5)}</td>
                      <td className="px-3 py-3">
                        <div className="text-xs text-[var(--cream)]">{order.customer}</div>
                        <div className="text-[11px] text-[var(--pewter)] hidden sm:block">{order.address}</div>
                        <div className="text-[11px] text-[var(--gold)] hidden sm:block">{order.userId}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-[var(--cream-muted)]">{order.zone}</td>
                      <td className="px-3 py-3 text-[11px] text-[var(--pewter)]">{order.latitude}, {order.longitude}</td>
                      <td className="px-3 py-3">
                        <div className="text-xs text-[var(--gold-bright)]">₱{order.total}</div>
                        <div className="text-[11px] text-[var(--pewter)] hidden sm:block">{order.items.join(', ')}</div>
                        {order.gcashScreenshotUrl && (
                          <button onClick={() => setPreviewReceipt(order.gcashScreenshotUrl || '')} className="text-[11px] text-[var(--crimson)] underline hover:text-[var(--gold-bright)] transition-colors">
                            View Receipt
                          </button>
                        )}
                        {order.pointsEarned !== undefined && order.pointsEarned > 0 && (
                          <div className="text-[9px] text-[var(--gold-bright)]">🪙 +{order.pointsEarned} pts</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <select value={order.status} onChange={(e) => handleStatusUpdate(order._id || order.id, e.target.value)} className="deco-select text-[10px] py-1 px-2 rounded-lg">
                          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => handleDeleteOrder(order._id || order.id)} className="deco-btn deco-btn-sm deco-btn-crimson" style={{ minHeight: '28px', padding: '4px 10px', fontSize: '9px' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inventory Control */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-6 rounded-2xl">
            <h2 className="text-sm text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Inventory Control</h2>
            <div className="mt-6 space-y-3">
              {catalog.map(product => (
                <div key={product.id} className="flex flex-col sm:flex-row sm:items-center justify-between border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-4 gap-3 transition-all hover:border-[var(--gold)] rounded-xl">
                  <div>
                    <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>{product.name}</p>
                    <p className="text-[11px] text-[var(--gold)] uppercase mt-1">{product.inventory}</p>
                  </div>
                  <button type="button" onClick={() => handleUpdateInventory(product.id)} className="deco-btn deco-btn-sm deco-btn-dark w-full sm:w-auto rounded-lg">
                    Update
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Users & Coins Panel ──────────────────────────── */}
        <UsersCoinsPanel userName={email} />
      </div>

      {/* Receipt Preview Modal */}
      {previewReceipt && (
        <div className="deco-overlay" onClick={() => setPreviewReceipt('')}>
          <div className="deco-modal max-w-2xl bounce-in rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="deco-modal-header flex items-center justify-between rounded-t-2xl">
              <h3 className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Payment Receipt</h3>
              <button onClick={() => setPreviewReceipt('')} className="text-[var(--pewter)] text-lg hover:text-[var(--crimson)] transition-colors">✕</button>
            </div>
            <div className="p-4 bg-[var(--charcoal-light)] rounded-b-2xl">
              <img src={previewReceipt} alt="Payment Receipt" className="w-full h-auto border-2 border-[var(--gold)] rounded-xl" />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
