'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { products as staticProducts, type CartItem, deliveryZones, dwclOnlyProducts, type ZoneKey, type Product } from '@/app/lib/muragoods-data';
import { useProducts } from '@/app/hooks/useProducts';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';

const LocationPicker = dynamic(() => import('@/app/components/LocationPicker'), { ssr: false });

const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

export default function CheckoutPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cart, setCart] = useState<Record<string, { quantity: number; variantId?: string }>>({});
  const [location, setLocation] = useState<ZoneKey>('DWCL');
  const [phone, setPhone] = useState('');
  const [deliveryService, setDeliveryService] = useState('Free Shipping');
  const [customOrderDate, setCustomOrderDate] = useState('');
  const [gcashRef, setGcashRef] = useState('');
  const [gcashFile, setGcashFile] = useState<File | null>(null);
  const [mapAddress, setMapAddress] = useState('');
  const [latitude, setLatitude] = useState('13.1550');
  const [longitude, setLongitude] = useState('123.7450');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const { products } = useProducts();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    setIsLoggedIn(true);

    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      try { setCart(JSON.parse(savedCart)); } catch { setCart({}); }
    }
  }, [router]);

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
    if (!gcashRef.trim() || gcashRef.trim().length < 5) { setError('Please enter a valid GCash reference number.'); return; }
    if (!gcashFile) { setError('Payment proof is required. Please upload your GCash receipt.'); return; }

    setIsSubmitting(true);
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const formData = new FormData();
    formData.append('customer', user.name || user.email);
    formData.append('phone', phone);
    formData.append('zone', location);
    formData.append('address', mapAddress || 'DWCL Pickup');
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    formData.append('payment', 'GCash');
    formData.append('deliveryDate', customOrderDate);
    formData.append('status', 'Pending Payment');
    formData.append('total', String(total));
    formData.append('items', JSON.stringify(cartItems.map(item => `${item.name} (${item.selectedVariant?.name}) x ${item.quantity}`)));
    formData.append('deliveryType', deliveryService);
    formData.append('userId', user.email);
    formData.append('gcashRefNumber', gcashRef);
    formData.append('gcashScreenshot', gcashFile);

    try {
      const res = await fetch('/api/orders', { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success) {
        localStorage.removeItem('cart');
        setCart({});
        setShowInstagramModal(true);
      } else {
        setError(result.error || 'Failed to place order. Please try again.');
      }
    } catch {
      setError('Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addToCartFromCheckout = (cartKey: string) => {
    setCart(prev => {
      const next = {
        ...prev,
        [cartKey]: {
          ...(prev[cartKey] || { variantId: cartKey.split('__')[1] || (products.find(p => p.id === cartKey.split('__')[0])?.variants[0].id || staticProducts.find(p => p.id === cartKey.split('__')[0])?.variants[0].id) }),
          quantity: (prev[cartKey]?.quantity || 0) + 1,
        }
      };
      localStorage.setItem('cart', JSON.stringify(next));
      return next;
    });
  };

  const removeFromCart = (cartKey: string) => {
    setCart(prev => {
      const next = { ...prev };
      if (!next[cartKey]) return prev;
      if (next[cartKey].quantity <= 1) { delete next[cartKey]; }
      else { next[cartKey] = { ...next[cartKey], quantity: next[cartKey].quantity - 1 }; }
      localStorage.setItem('cart', JSON.stringify(next));
      return next;
    });
  };

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[var(--obsidian)]">
        <p className="text-3xl animate-bounce text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
          WARPING...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Checkout" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container">
          <PixelDivider variant="pipeSegment" />

          {/* Header */}
          <div className="mb-8">
            <h1
              className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase"
              style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}
            >
              Final Stage: Checkout
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">
              Review your items and complete your order.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            {/* ─── Cart & Form Panel ────────────────────────── */}
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)]">
              {/* Panel Header */}
              <div className="border-b-2 border-[var(--gold)] bg-[var(--charcoal-light)] p-5 sm:p-6">
                <h2
                  className="text-sm text-[var(--gold-bright)] uppercase"
                  style={{ fontFamily: 'var(--font-arcade)' }}
                >
                  Your Cart
                </h2>
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                {/* Error */}
                {error && (
                  <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-4 text-sm text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                    ⚠ {error}
                  </div>
                )}

                {restrictedItems.length > 0 && (
                  <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-4 text-sm text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                    ⚠ Coffee Jelly & Cookies are only available for DWCL pickup!
                  </div>
                )}

                {!isDwcl && totalItems < 2 && (
                  <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.08)] p-4 text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                    ⚠ Minimum 2 items required for delivery outside DWCL.
                  </div>
                )}

                {cartItems.length === 0 ? (
                  <div className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-10 text-center">
                    <p className="text-sm text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                      CART IS EMPTY
                    </p>
                    <p className="mt-2 text-sm text-[var(--pewter-light)]">Add some legendary items!</p>
                  </div>
                ) : (
                  <>
                    {/* Cart Items */}
                    <div className="space-y-3">
                      {cartItems.map((item) => {
                        const cartKey = `${item.id}__${item.selectedVariant?.id || item.variants[0]?.id || ''}`;
                        return (
                          <div
                            key={cartKey}
                            className="flex items-center justify-between border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-4 transition-all hover:border-[var(--gold)]"
                          >
                            <div>
                              <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
                                {item.name}
                              </p>
                              <p className="text-xs text-[var(--pewter)] mt-1">
                                {item.selectedVariant?.name} · ₱{item.selectedVariant?.price || 0} each
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => removeFromCart(cartKey)}
                                className="flex h-8 w-8 items-center justify-center border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.15)] text-[var(--crimson)] hover:bg-[var(--crimson)] hover:text-white transition-all"
                              >
                                −
                              </button>
                              <span
                                className="w-6 text-center text-[var(--cream)]"
                                style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}
                              >
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => addToCartFromCheckout(cartKey)}
                                className="flex h-8 w-8 items-center justify-center border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.15)] text-[var(--gold)] hover:bg-[var(--gold)] hover:text-[var(--obsidian)] transition-all"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Zone */}
                    <div>
                      <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                        Delivery Zone
                      </label>
                      <select value={location} onChange={(e) => setLocation(e.target.value as ZoneKey)} className="deco-select">
                        {deliveryZones.map(zone => (
                          <option key={zone.code} value={zone.code}>{zone.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-[var(--pewter)] mt-2">{deliveryZones.find(z => z.code === location)?.note}</p>
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                        Contact Number *
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Enter valid contact number"
                        className="deco-input"
                        required
                      />
                      <p className="text-xs text-[var(--pewter)] mt-1">Required for delivery confirmation calls</p>
                    </div>

                    {/* Order Date */}
                    <div>
                      <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                        Preferred Order Date
                      </label>
                      <input
                        type="date"
                        value={customOrderDate}
                        onChange={(e) => setCustomOrderDate(e.target.value)}
                        required
                        min={tomorrow}
                        className="deco-input"
                      />
                      <p className="text-xs text-[var(--pewter)] mt-1">Select a valid future date</p>
                    </div>

                    {/* Map (non-DWCL) */}
                    {!isDwcl && (
                      <div>
                        <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                          Delivery Location
                        </label>
                        <LocationPicker
                          initialLat={13.1550}
                          initialLng={123.7450}
                          onLocationSelect={(lat, lng, address) => {
                            setMapAddress(address);
                            setLatitude(String(lat));
                            setLongitude(String(lng));
                          }}
                        />
                        <p className="text-xs text-[var(--pewter)] mt-2">Tap the map to set your delivery location.</p>
                      </div>
                    )}

                    {isDwcl && (
                      <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.05)] p-4">
                        <p className="text-[10px] text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
                          DWCL Pickup
                        </p>
                        <p className="text-xs text-[var(--pewter)] mt-1">No map needed. Proceed to next steps.</p>
                      </div>
                    )}

                    {/* Order Type */}
                    <div>
                      <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                        Order Type
                      </label>
                      <select value={deliveryService} onChange={(e) => setDeliveryService(e.target.value)} className="deco-select">
                        <option value="Free Shipping">DWCL Pickup — Free</option>
                        <option value="Saturday Delivery">Saturday Delivery — Legazpi/Daraga</option>
                      </select>
                    </div>

                    {/* Payment */}
                    <div>
                      <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                        Payment Method
                      </label>
                      <div className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-4">
                        <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>GCash</p>
                        <p className="text-xs text-[var(--pewter)] mt-1">Proof of payment required upon checkout.</p>
                      </div>
                    </div>

                    {/* GCash Details */}
                    <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.06)] p-5 space-y-4">
                      <p className="text-[9px] text-[var(--crimson)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
                        GCash Payment Details
                      </p>
                      <p className="text-sm text-[var(--cream)]">
                        Send amount to: <span className="text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>639466472599</span> (Muragoods)
                      </p>

                      <div>
                        <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>
                          GCash Reference Number *
                        </label>
                        <input
                          type="text"
                          value={gcashRef}
                          onChange={(e) => setGcashRef(e.target.value)}
                          placeholder="Enter valid GCash reference number"
                          className="deco-input"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>
                          Upload Payment Receipt *
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setGcashFile(e.target.files?.[0] || null)}
                          className="w-full text-xs text-[var(--cream)] border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 file:mr-3 file:border-0 file:border-r-2 file:border-[rgba(242,240,228,0.12)] file:bg-transparent file:text-[var(--gold)] file:font-bold file:uppercase file:text-xs file:px-3 file:py-1 file:cursor-pointer hover:file:text-[var(--gold-bright)]"
                          required
                        />
                        <p className="text-xs text-[var(--pewter)] mt-1">Required. Without proof, order may be delayed.</p>
                      </div>
                    </div>

                    {/* Custom Orders */}
                    <div className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-4">
                      <p className="text-[9px] text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
                        Custom Order / Inquiries
                      </p>
                      <p className="text-xs text-[var(--pewter)] mt-1">For bulk or special requests, message us directly:</p>
                      <p className="text-sm text-[var(--cream)] mt-1">Instagram: @muragoods_</p>
                      <p className="text-sm text-[var(--cream)]">Contact: 639466472599</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ─── Order Summary Panel ──────────────────────── */}
            <aside className="border-2 border-[var(--gold)] bg-[var(--charcoal)]">
              {/* Panel Header */}
              <div className="border-b-2 border-[var(--gold)] bg-[var(--charcoal-light)] p-5 sm:p-6">
                <h3
                  className="text-sm text-[var(--gold-bright)] uppercase"
                  style={{ fontFamily: 'var(--font-arcade)' }}
                >
                  Order Summary
                </h3>
              </div>

              <div className="p-5 sm:p-6 flex flex-col h-full">
                {/* Totals */}
                <div className="space-y-3 text-sm border-b-2 border-[rgba(242,240,228,0.12)] pb-5 mb-5">
                  <div className="flex justify-between text-[var(--cream-muted)]">
                    <span>Subtotal:</span>
                    <span className="coin-price">₱{subtotal}</span>
                  </div>
                  <div className="flex justify-between text-[var(--cream-muted)]">
                    <span>Shipping:</span>
                    <span className="coin-price">₱{shippingFee}</span>
                  </div>
                  <div className="flex justify-between text-lg border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] p-3 text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>
                    <span>TOTAL:</span>
                    <span>₱{total}</span>
                  </div>
                </div>

                {/* Order Details */}
                <div className="space-y-2 text-xs text-[var(--pewter)] mb-6">
                  <p>Order Date: <span className="text-[var(--cream-muted)]">{customOrderDate || 'Not selected'}</span></p>
                  <p>Service: <span className="text-[var(--cream-muted)]">{deliveryService}</span></p>
                  {!isDwcl && <p>Location: <span className="text-[var(--cream-muted)]">{mapAddress || 'Not selected'}</span></p>}
                  <p>Payment: <span className="text-[var(--cream-muted)]">GCash</span></p>
                  <p>Phone: <span className="text-[var(--cream-muted)]">{phone || 'Not provided'}</span></p>
                </div>

                {/* Place Order Button */}
                <button
                  type="submit"
                  disabled={cartItems.length === 0 || isSubmitting}
                  className="deco-btn deco-btn-crimson deco-btn-lg w-full mt-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'PLACING ORDER...' : 'PLACE ORDER'}
                </button>
              </div>
            </aside>
          </form>
        </div>
      </section>

      {/* ─── Instagram Success Modal ─────────────────────────── */}
      {showInstagramModal && (
        <div className="deco-overlay" onClick={() => setShowInstagramModal(false)}>
          <div className="deco-modal bounce-in" onClick={(e) => e.stopPropagation()}>
            <div className="deco-modal-header text-center" style={{ background: 'linear-gradient(135deg, #6c3483, var(--crimson))' }}>
              <h2
                className="text-sm text-[var(--gold-bright)] uppercase"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                ORDER PLACED!
              </h2>
            </div>
            <div className="deco-modal-body text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[#6c3483] to-[var(--crimson)] flex items-center justify-center text-white text-lg border-2 border-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                IG
              </div>
              <h3
                className="text-sm text-[var(--cream)]"
                style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}
              >
                Message @muragoods_ on Instagram
              </h3>
              <p className="text-sm text-[var(--pewter)]">Confirm your order and get updates!</p>
              <a
                href="https://www.instagram.com/muragoods_/"
                target="_blank"
                rel="noopener noreferrer"
                className="deco-btn deco-btn-gold w-full"
              >
                Open Instagram @muragoods_
              </a>
              <button
                onClick={() => { setShowInstagramModal(false); router.push('/orders'); }}
                className="deco-btn w-full"
              >
                View My Orders
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
