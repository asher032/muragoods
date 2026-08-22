'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { products as staticProducts, type CartItem, deliveryZones, dwclOnlyProducts, type ZoneKey } from '@/app/lib/muragoods-data';
import { useProducts } from '@/app/hooks/useProducts';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';

const LocationPicker = dynamic(() => import('@/app/components/LocationPicker'), { ssr: false });

const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

type PaymentMethod = 'GCash' | 'Cash on Delivery';

export default function CheckoutPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cart, setCart] = useState<Record<string, { quantity: number; variantId?: string }>>({});
  const [location, setLocation] = useState<ZoneKey>('DWCL');
  const [phone, setPhone] = useState('');
  const [deliveryService, setDeliveryService] = useState('Free Shipping');
  const [customOrderDate, setCustomOrderDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('GCash');
  const [gcashRef, setGcashRef] = useState('');
  const [gcashFile, setGcashFile] = useState<File | null>(null);
  const [mapAddress, setMapAddress] = useState('');
  const [latitude, setLatitude] = useState('13.1550');
  const [longitude, setLongitude] = useState('123.7450');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState('');
  const { products } = useProducts();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    setIsLoggedIn(true);
    const savedCart = localStorage.getItem('cart');
    if (savedCart) { try { setCart(JSON.parse(savedCart)); } catch { setCart({}); } }
  }, [router]);

  // Reset payment to GCash if zone changes to non-DWCL
  useEffect(() => {
    if (location !== 'DWCL' && paymentMethod === 'Cash on Delivery') {
      setPaymentMethod('GCash');
    }
  }, [location, paymentMethod]);

  const cartItems = Object.entries(cart)
    .filter(([, data]) => data.quantity > 0)
    .map(([cartKey, data]) => {
      const productId = cartKey.split('__')[0];
      const product = products.find(p => p.id === productId) || staticProducts.find(p => p.id === productId);
      if (!product) return null;
      const variantId = cartKey.split('__')[1] || data.variantId || product.variants[0].id;
      const variant = product.variants.find(v => v.id === variantId);
      return { ...product, quantity: data.quantity, selectedVariant: variant || product.variants[0] } as CartItem;
    })
    .filter((item): item is CartItem => item !== null);

  const isDwcl = location === 'DWCL';
  const isGcash = paymentMethod === 'GCash';
  const restrictedItems = cartItems.filter(item => dwclOnlyProducts.includes(item.id) && !isDwcl);
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + (item.selectedVariant?.price || 0) * item.quantity, 0);
  const shippingFee = location === 'DWCL' ? 0 : 30;
  const total = subtotal + shippingFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (cartItems.length === 0) { setError('Your cart is empty!'); return; }
    if (!isDwcl && totalItems < 2) { setError('Minimum 2 items required for delivery outside DWCL.'); return; }
    const phoneDigits = phone.replace(/[\s\-()+]/g, '');
    if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 15) { setError('Please enter a valid contact number (10-15 digits).'); return; }
    if (!isDwcl && !mapAddress) { setError('Please select your delivery location on the map'); return; }
    if (!customOrderDate) { setError('Please enter your preferred order date'); return; }

    // Only require GCash proof if GCash is selected
    if (isGcash) {
      if (!gcashRef.trim() || gcashRef.trim().length < 5) { setError('Please enter a valid GCash reference number.'); return; }
      if (!gcashFile) { setError('Payment proof is required. Please upload your GCash receipt.'); return; }
    }

    setIsSubmitting(true);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const formData = new FormData();
    formData.append('customer', user.name || user.email);
    formData.append('phone', phone);
    formData.append('zone', location);
    formData.append('address', mapAddress || 'DWCL Pickup');
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    formData.append('payment', paymentMethod);
    formData.append('deliveryDate', customOrderDate);
    formData.append('status', paymentMethod === 'Cash on Delivery' ? 'Pending Payment' : 'Pending Payment');
    formData.append('total', String(total));
    formData.append('items', JSON.stringify(cartItems.map(item => `${item.name} (${item.selectedVariant?.name}) x ${item.quantity}`)));
    formData.append('deliveryType', deliveryService);
    formData.append('userId', user.email);
    if (isGcash) {
      formData.append('gcashRefNumber', gcashRef);
      formData.append('gcashScreenshot', gcashFile!);
    }

    try {
      const res = await fetch('/api/orders', { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success) {
        localStorage.removeItem('cart');
        setCart({});
        setPlacedOrderId(result.data?.id || result.data?._id || '');
        setShowSuccessModal(true);
      } else {
        setError(result.error || 'Failed to place order.');
      }
    } catch {
      setError('Failed to place order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateCartQty = (cartKey: string, delta: number) => {
    setCart(prev => {
      const next = { ...prev };
      if (!next[cartKey]) return prev;
      next[cartKey] = { ...next[cartKey], quantity: next[cartKey].quantity + delta };
      if (next[cartKey].quantity <= 0) delete next[cartKey];
      localStorage.setItem('cart', JSON.stringify(next));
      return next;
    });
  };

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--obsidian)]">
        <p className="text-xl animate-bounce text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>WARPING...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Checkout" />
      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container">
          <PixelDivider variant="pipeSegment" />
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>Final Stage: Checkout</h1>
            <p className="mt-3 text-base text-[var(--gold)]">Review your items and complete your order.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error */}
            {error && (
              <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-4 text-sm text-[var(--crimson)] rounded-lg" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>⚠ {error}</div>
            )}

            {/* ─── Cart Items ──────────────────────────────── */}
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl overflow-hidden">
              <div className="border-b-2 border-[var(--gold)] bg-[var(--charcoal-light)] p-5">
                <h2 className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Your Cart</h2>
              </div>
              <div className="p-5 space-y-3">
                {cartItems.length === 0 ? (
                  <p className="text-center text-[var(--pewter)] py-8" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>CART IS EMPTY</p>
                ) : cartItems.map((item) => {
                  const cartKey = `${item.id}__${item.selectedVariant?.id || item.variants[0]?.id || ''}`;
                  return (
                    <div key={cartKey} className="flex items-center justify-between border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-4 rounded-lg hover:border-[var(--gold)] transition-all">
                      <div>
                        <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>{item.name}</p>
                        <p className="text-xs text-[var(--pewter)] mt-1">{item.selectedVariant?.name} · ₱{item.selectedVariant?.price || 0} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => updateCartQty(cartKey, -1)} className="flex h-8 w-8 items-center justify-center border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.15)] text-[var(--crimson)] hover:bg-[var(--crimson)] hover:text-white rounded-md transition-all">−</button>
                        <span className="w-6 text-center text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>{item.quantity}</span>
                        <button type="button" onClick={() => updateCartQty(cartKey, 1)} className="flex h-8 w-8 items-center justify-center border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.15)] text-[var(--gold)] hover:bg-[var(--gold)] hover:text-[var(--obsidian)] rounded-md transition-all">+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {cartItems.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* ─── Delivery Details ─────────────────────── */}
                <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl p-5 space-y-5">
                  <h2 className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Delivery Details</h2>

                  {restrictedItems.length > 0 && (
                    <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-3 text-xs text-[var(--crimson)] rounded-lg">⚠ Coffee Jelly & Cookies are only for DWCL pickup!</div>
                  )}
                  {!isDwcl && totalItems < 2 && (
                    <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.08)] p-3 text-xs text-[var(--gold-bright)] rounded-lg">⚠ Minimum 2 items for delivery outside DWCL.</div>
                  )}

                  {/* Zone */}
                  <div>
                    <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>Delivery Zone</label>
                    <select value={location} onChange={(e) => setLocation(e.target.value as ZoneKey)} className="deco-select rounded-lg">
                      {deliveryZones.map(zone => <option key={zone.code} value={zone.code}>{zone.label}</option>)}
                    </select>
                    <p className="text-xs text-[var(--pewter)] mt-1">{deliveryZones.find(z => z.code === location)?.note}</p>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>Contact Number *</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09XXXXXXXXX" className="deco-input rounded-lg" required />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>Preferred Order Date</label>
                    <input type="date" value={customOrderDate} onChange={(e) => setCustomOrderDate(e.target.value)} required min={tomorrow} className="deco-input rounded-lg" />
                  </div>

                  {/* Map */}
                  {!isDwcl ? (
                    <div>
                      <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>Delivery Location</label>
                      <LocationPicker initialLat={13.1550} initialLng={123.7450} onLocationSelect={(lat, lng, address) => { setMapAddress(address); setLatitude(String(lat)); setLongitude(String(lng)); }} />
                    </div>
                  ) : (
                    <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.05)] p-4 rounded-lg">
                      <p className="text-[10px] text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>DWCL Pickup</p>
                      <p className="text-xs text-[var(--pewter)] mt-1">No map needed for campus pickup.</p>
                    </div>
                  )}

                  {/* Order Type */}
                  <div>
                    <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>Order Type</label>
                    <select value={deliveryService} onChange={(e) => setDeliveryService(e.target.value)} className="deco-select rounded-lg">
                      <option value="Free Shipping">DWCL Pickup — Free</option>
                      <option value="Saturday Delivery">Saturday Delivery — Legazpi/Daraga</option>
                    </select>
                  </div>
                </div>

                {/* ─── Payment & Summary ────────────────────── */}
                <div className="space-y-5">
                  {/* Payment Method */}
                  <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl p-5">
                    <h2 className="text-sm text-[var(--gold-bright)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Payment Method</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setPaymentMethod('GCash')} className={`p-4 border-2 rounded-lg text-center transition-all ${isGcash ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.1)]' : 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] hover:border-[var(--gold)]'}`}>
                        <div className="text-lg mb-1">💳</div>
                        <p className="text-[9px] text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>GCash</p>
                        <p className="text-[8px] text-[var(--pewter)] mt-1">Ref + proof required</p>
                      </button>
                      <button type="button" onClick={() => isDwcl && setPaymentMethod('Cash on Delivery')} disabled={!isDwcl} className={`p-4 border-2 rounded-lg text-center transition-all ${!isDwcl ? 'border-[rgba(242,240,228,0.06)] bg-[var(--charcoal-light)] opacity-40 cursor-not-allowed' : paymentMethod === 'Cash on Delivery' ? 'border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.2)]' : 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] hover:border-[var(--emerald-bright)]'}`}>
                        <div className="text-lg mb-1">💵</div>
                        <p className="text-[9px] text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Cash on Delivery</p>
                        <p className="text-[8px] text-[var(--pewter)] mt-1">{isDwcl ? 'DWCL pickup only' : 'DWCL only'}</p>
                      </button>
                    </div>
                  </div>

                  {/* GCash Details (only if GCash selected) */}
                  {isGcash && (
                    <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.06)] rounded-xl p-5 space-y-4">
                      <p className="text-[9px] text-[var(--crimson)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>GCash Payment Details</p>
                      <p className="text-sm text-[var(--cream)]">Send amount to: <span className="text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>639466472599</span></p>
                      <div>
                        <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Reference Number *</label>
                        <input type="text" value={gcashRef} onChange={(e) => setGcashRef(e.target.value)} placeholder="GCash reference number" className="deco-input rounded-lg" required={isGcash} />
                      </div>
                      <div>
                        <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Upload Receipt *</label>
                        <input type="file" accept="image/*" onChange={(e) => setGcashFile(e.target.files?.[0] || null)} className="w-full text-xs text-[var(--cream)] border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-lg file:mr-3 file:border-0 file:border-r-2 file:border-[rgba(242,240,228,0.12)] file:bg-transparent file:text-[var(--gold)] file:font-bold file:uppercase file:text-xs file:px-3 file:py-1 file:cursor-pointer" required={isGcash} />
                      </div>
                    </div>
                  )}

                  {/* COD Info */}
                  {!isGcash && (
                    <div className="border-2 border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.15)] rounded-xl p-5">
                      <p className="text-[9px] text-[var(--emerald-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Cash on Delivery</p>
                      <p className="text-sm text-[var(--cream)] mt-2">Pay in cash when you pick up your order at the DWCL campus. No payment proof needed!</p>
                    </div>
                  )}

                  {/* Order Summary */}
                  <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-xl p-5">
                    <h2 className="text-sm text-[var(--gold-bright)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Order Summary</h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-[var(--cream-muted)]"><span>Subtotal</span><span className="coin-price">₱{subtotal}</span></div>
                      <div className="flex justify-between text-[var(--cream-muted)]"><span>Shipping</span><span className="coin-price">{shippingFee === 0 ? 'FREE' : `₱${shippingFee}`}</span></div>
                      <div className="flex justify-between text-[var(--gold-bright)] border-t-2 border-[var(--gold)] pt-3 mt-3" style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px' }}><span>TOTAL</span><span>₱{total}</span></div>
                    </div>
                    <div className="mt-4 space-y-1 text-xs text-[var(--pewter)]">
                      <p>Date: <span className="text-[var(--cream-muted)]">{customOrderDate || '—'}</span></p>
                      <p>Zone: <span className="text-[var(--cream-muted)]">{location}</span></p>
                      <p>Payment: <span className="text-[var(--cream-muted)]">{paymentMethod}</span></p>
                    </div>
                  </div>

                  <button type="submit" disabled={cartItems.length === 0 || isSubmitting} className="deco-btn deco-btn-crimson deco-btn-lg w-full rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSubmitting ? 'PLACING ORDER...' : 'PLACE ORDER'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </section>

      {/* ─── Success Modal ─────────────────────────────────── */}
      {showSuccessModal && (
        <div className="deco-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="deco-modal bounce-in rounded-2xl max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="deco-modal-header text-center rounded-t-2xl" style={{ background: 'linear-gradient(135deg, #1E3D2F, #27ae60)' }}>
              <h2 className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>ORDER PLACED!</h2>
            </div>
            <div className="deco-modal-body text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[var(--emerald)] to-[var(--emerald-bright)] flex items-center justify-center text-white text-2xl rounded-full border-2 border-[var(--gold)]">✓</div>
              <h3 className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
                {isGcash ? 'Message @muragoods_ on Instagram to confirm!' : 'Pay cash when you pick up!'}
              </h3>
              {isGcash && (
                <a href="https://www.instagram.com/muragoods_/" target="_blank" rel="noopener noreferrer" className="deco-btn deco-btn-gold w-full rounded-xl">
                  Open Instagram @muragoods_
                </a>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setShowSuccessModal(false); router.push(placedOrderId ? `/order/${placedOrderId}` : '/orders'); }} className="deco-btn flex-1 rounded-xl">
                  View Order
                </button>
                <button onClick={() => { setShowSuccessModal(false); router.push('/menu'); }} className="deco-btn deco-btn-gold flex-1 rounded-xl">
                  Continue Shopping
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
