'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { products as staticProducts } from '@/app/lib/muragoods-data';
import { CircleX, ClipboardList, Link2, Lock, PiggyBank, Plus, TriangleAlert, Users } from 'lucide-react';
interface GroupItem {
  _id: string;
  userId: string;
  userName: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  price: number;
  quantity: number;
  addedAt: string;
}

interface GroupOrder {
  _id: string;
  code: string;
  hostUserId: string;
  hostName: string;
  title: string;
  items: GroupItem[];
  status: string;
  createdAt: string;
}

export default function GroupOrderPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [groupCode, setGroupCode] = useState('');
  const [groupOrder, setGroupOrder] = useState<GroupOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    setUser(JSON.parse(userStr));
  }, [router]);

  const fetchGroupOrder = useCallback(async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/group-order?action=get&code=${encodeURIComponent(code)}`);
      const result = await res.json();
      if (result.success) {
        setGroupOrder(result.data);
      } else {
        setError(result.error || 'Group order not found');
      }
    } catch {
      setError('Failed to load group order');
    }
    setLoading(false);
  }, []);

  const handleCreate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/group-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          hostUserId: user.email,
          hostName: user.name,
          title: title || `${user.name}'s Group Order`,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setGroupOrder(result.data);
        setGroupCode(result.data.code);
        setMode('join');
      } else {
        setError(result.error || 'Failed to create');
      }
    } catch {
      setError('Failed to create group order');
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!groupCode.trim()) { setError('Enter a group code'); return; }
    await fetchGroupOrder(groupCode.trim().toUpperCase());
  };

  const handleAddItem = async () => {
    if (!user || !groupOrder || !selectedProduct) return;
    const product = staticProducts.find(p => p.id === selectedProduct);
    if (!product) return;
    const variant = product.variants.find(v => v.id === selectedVariant) || product.variants[0];

    setLoading(true);
    try {
      const res = await fetch('/api/group-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_item',
          code: groupOrder.code,
          item: {
            userId: user.email,
            userName: user.name,
            productId: product.id,
            productName: product.name,
            variantId: variant.id,
            variantName: variant.name,
            price: variant.price,
            quantity,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        setGroupOrder(result.data);
        setShowAddItem(false);
        setSelectedProduct('');
        setQuantity(1);
      }
    } catch { /* empty */ }
    setLoading(false);
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!groupOrder) return;
    try {
      const res = await fetch('/api/group-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_item', code: groupOrder.code, itemId }),
      });
      const result = await res.json();
      if (result.success) setGroupOrder(result.data);
    } catch { /* empty */ }
  };

  const handleClose = async () => {
    if (!groupOrder || !user) return;
    if (!confirm('Close this group order? No one else can add items.')) return;
    try {
      const res = await fetch('/api/group-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', code: groupOrder.code, hostUserId: user.email }),
      });
      const result = await res.json();
      if (result.success) setGroupOrder(result.data);
    } catch { /* empty */ }
  };

  // Calculate per-person totals
  const personTotals = groupOrder?.items.reduce((acc, item) => {
    if (!acc[item.userName]) acc[item.userName] = { name: item.userName, total: 0, items: 0 };
    acc[item.userName].total += item.price * item.quantity;
    acc[item.userName].items += item.quantity;
    return acc;
  }, {} as Record<string, { name: string; total: number; items: number }>) || {};

  const grandTotal = groupOrder?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) || 0;
  const selectedProductData = staticProducts.find(p => p.id === selectedProduct);

  if (!user) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Group Order" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              <Users className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Group Order
            </h1>
            <p className="mt-2 text-sm text-[var(--gold)]">Order together, pay separately!</p>
          </div>

          {error && (
            <div className="mb-4 border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-3 rounded-xl text-center">
              <p className="text-[9px] text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}><TriangleAlert color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {error}</p>
            </div>
          )}

          {/* Home Mode */}
          {mode === 'home' && !groupOrder && (
            <div className="space-y-4">
              <button onClick={() => setMode('create')} className="deco-btn w-full rounded-xl p-6 text-center">
                <span className="text-2xl"><Plus className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
                <p className="text-[10px] text-[var(--cream)] mt-2 uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Create Group Order</p>
                <p className="text-xs text-[var(--pewter)] mt-1">Start a shared cart for your group</p>
              </button>
              <button onClick={() => setMode('join')} className="deco-btn w-full rounded-xl p-6 text-center">
                <span className="text-2xl"><Link2 className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
                <p className="text-[10px] text-[var(--cream)] mt-2 uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Join Group Order</p>
                <p className="text-xs text-[var(--pewter)] mt-1">Enter a code to join an existing order</p>
              </button>
            </div>
          )}

          {/* Create Mode */}
          {mode === 'create' && !groupOrder && (
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6 space-y-4">
              <h2 className="text-[10px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Create Group Order</h2>
              <label className="block">
                <span className="text-[9px] text-[var(--pewter)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Title (optional)</span>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={`${user.name}'s Group Order`} className="deco-input rounded-xl" />
              </label>
              <div className="flex gap-3">
                <button onClick={handleCreate} disabled={loading} className="deco-btn deco-btn-gold rounded-xl flex-1 disabled:opacity-50">
                  {loading ? 'Creating...' : 'Create'}
                </button>
                <button onClick={() => setMode('home')} className="deco-btn deco-btn-dark rounded-xl">Cancel</button>
              </div>
            </div>
          )}

          {/* Join Mode */}
          {mode === 'join' && !groupOrder && (
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-6 space-y-4">
              <h2 className="text-[10px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Join Group Order</h2>
              <label className="block">
                <span className="text-[9px] text-[var(--pewter)] uppercase block mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>6-Digit Code</span>
                <input type="text" value={groupCode} onChange={e => setGroupCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} className="deco-input rounded-xl text-center text-lg tracking-[0.3em]" style={{ fontFamily: 'var(--font-arcade)' }} />
              </label>
              <div className="flex gap-3">
                <button onClick={handleJoin} disabled={loading || groupCode.length < 6} className="deco-btn deco-btn-gold rounded-xl flex-1 disabled:opacity-50">
                  {loading ? 'Joining...' : 'Join'}
                </button>
                <button onClick={() => { setMode('home'); setGroupCode(''); }} className="deco-btn deco-btn-dark rounded-xl">Cancel</button>
              </div>
            </div>
          )}

          {/* Group Order Active */}
          {groupOrder && (
            <div className="space-y-4">
              {/* Share Code */}
              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-5 text-center">
                <p className="text-[9px] text-[var(--pewter)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Share this code with friends</p>
                <p className="text-3xl text-[var(--gold-bright)] mt-2 tracking-[0.4em]" style={{ fontFamily: 'var(--font-arcade)' }}>{groupOrder.code}</p>
                <p className="text-[8px] text-[var(--pewter)] mt-1">Status: {groupOrder.status === 'open' ? 'Open' : 'Closed'}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(groupOrder.code); alert('Code copied!'); }}
                  className="deco-btn deco-btn-sm deco-btn-gold rounded-lg mt-3"
                >
                  <ClipboardList className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Copy Code
                </button>
              </div>

              {/* Items */}
              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[10px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
                    Items ({groupOrder.items.length})
                  </h2>
                  {groupOrder.status === 'open' && (
                    <button onClick={() => setShowAddItem(!showAddItem)} className="deco-btn deco-btn-sm deco-btn-gold rounded-lg">
                      + Add Item
                    </button>
                  )}
                </div>

                {/* Add Item Form */}
                {showAddItem && (
                  <div className="mb-4 border border-[var(--gold)] bg-[var(--charcoal-light)] rounded-xl p-4 space-y-3">
                    <select value={selectedProduct} onChange={e => { setSelectedProduct(e.target.value); setSelectedVariant(''); }} className="deco-select rounded-lg w-full">
                      <option value="">Select item...</option>
                      {staticProducts.map(p => <option key={p.id} value={p.id}>{p.name} (from ₱{Math.min(...p.variants.map(v => v.price))})</option>)}
                    </select>
                    {selectedProductData && (
                      <select value={selectedVariant} onChange={e => setSelectedVariant(e.target.value)} className="deco-select rounded-lg w-full">
                        {selectedProductData.variants.map(v => <option key={v.id} value={v.id}>{v.name} — ₱{v.price}</option>)}
                      </select>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>Qty:</span>
                      <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 border border-[var(--crimson)] rounded-lg text-[var(--crimson)]">−</button>
                      <span className="text-sm text-[var(--cream)] w-6 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>{quantity}</span>
                      <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 border border-[var(--gold)] rounded-lg text-[var(--gold)]">+</button>
                    </div>
                    <button onClick={handleAddItem} disabled={!selectedProduct || loading} className="deco-btn deco-btn-sm deco-btn-gold rounded-lg w-full disabled:opacity-50">
                      Add to Group
                    </button>
                  </div>
                )}

                {/* Item List */}
                {groupOrder.items.length === 0 ? (
                  <p className="text-xs text-[var(--pewter)] text-center py-6">No items yet. Be the first to add!</p>
                ) : (
                  <div className="space-y-2">
                    {groupOrder.items.map(item => (
                      <div key={item._id} className="flex items-center justify-between p-3 bg-[var(--charcoal-light)] rounded-xl border border-[rgba(242,240,228,0.08)]">
                        <div>
                          <p className="text-[10px] text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{item.productName}</p>
                          <p className="text-[9px] text-[var(--pewter)]">{item.variantName} × {item.quantity}</p>
                          <p className="text-[8px] text-[var(--gold)]">by {item.userName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="coin-price text-sm">₱{item.price * item.quantity}</span>
                          {item.userId === user.email && groupOrder.status === 'open' && (
                            <button onClick={() => handleRemoveItem(item._id)} className="text-[var(--crimson)] text-xs hover:text-[var(--gold)]"><CircleX color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Split Bill */}
              {Object.keys(personTotals).length > 0 && (
                <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-5">
                  <h2 className="text-[10px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}><PiggyBank className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Split Bill</h2>
                  <div className="space-y-2">
                    {Object.values(personTotals).map(person => (
                      <div key={person.name} className="flex items-center justify-between p-3 bg-[var(--charcoal-light)] rounded-xl">
                        <div>
                          <p className="text-sm text-[var(--cream)]">{person.name}</p>
                          <p className="text-[9px] text-[var(--pewter)]">{person.items} item{person.items !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="coin-price text-base">₱{person.total}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-3 border-t-2 border-[var(--gold)] mt-2">
                      <span className="text-[10px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Grand Total</span>
                      <span className="coin-price text-lg">₱{grandTotal}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                {groupOrder.hostUserId === user.email && groupOrder.status === 'open' && (
                  <button onClick={handleClose} className="deco-btn deco-btn-sm deco-btn-crimson rounded-xl flex-1">
                    <Lock className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Close Group Order
                  </button>
                )}
                <button onClick={() => { setGroupOrder(null); setGroupCode(''); setMode('home'); }} className="deco-btn deco-btn-sm deco-btn-dark rounded-xl flex-1">
                  ← Leave
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
