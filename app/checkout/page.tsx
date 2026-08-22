'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { products as staticProducts, type CartItem, deliveryZones, dwclOnlyProducts, type ZoneKey, calculatePoints, deliveryServiceOptions } from '@/app/lib/muragoods-data';
import { useProducts } from '@/app/hooks/useProducts';
import { useCoins } from '@/app/hooks/useCoins';
import { NavBar } from '@/app/components/NavBar';

const LocationPicker = dynamic(() => import('@/app/components/LocationPicker'), { ssr: false });

const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const timeSlotOptions = [
  { value: 'morning', label: 'Morning', time: '9:00 AM – 12:00 PM', icon: '🌅' },
  { value: 'afternoon', label: 'Afternoon', time: '12:00 PM – 5:00 PM', icon: '☀️' },
  { value: 'evening', label: 'Evening', time: '5:00 PM – 8:00 PM', icon: '🌙' },
];

type PaymentMethod = 'GCash' | 'Cash on Delivery';

export default function CheckoutPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cart, setCart] = useState<Record<string, { quantity: number; variantId?: string }>>({});
  const [location, setLocation] = useState<ZoneKey>('DWCL');
  const [phone, setPhone] = useState('');
  const [deliveryService, setDeliveryService] = useState('DWCL Pickup — Free');
  const [customOrderDate, setCustomOrderDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
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
  const [discountCode, setDiscountCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState<{ code: string; type: string; value: number; label: string } | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; type: string; value: number; description: string; minOrder: number } | null>(null);
  const [promoError, setPromoError] = useState('');
  const { products } = useProducts();
  const { addCoins } = useCoins();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    setIsLoggedIn(true);
    const savedCart = localStorage.getItem('cart');
    if (savedCart) { try { setCart(JSON.parse(savedCart)); } catch { setCart({}); } }
  }, [router]);

  useEffect(() => {
    if (location !== 'DWCL' && location !== 'Daraga' && paymentMethod === 'Cash on Delivery') {
      setPaymentMethod('GCash');
    }
  }, [location, paymentMethod]);

  useEffect(() => {
    const options = deliveryServiceOptions[location] || deliveryServiceOptions.DWCL;
    if (options.length > 0) setDeliveryService(options[0]);
  }, [location]);

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
  const isCustom = location === 'Custom';
  const isDaraga = location === 'Daraga';
  const isGcash = paymentMethod === 'GCash';
  const restrictedItems = cartItems.filter(item => dwclOnlyProducts.includes(item.id) && !isDwcl && !isDaraga);
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + (item.selectedVariant?.price || 0) * item.quantity, 0);
  const zoneData = deliveryZones.find(z => z.code === location);
  const baseFee = isCustom ? 0 : (zoneData?.fee || 0);
  const shippingFee = isDaraga && subtotal >= 200 ? 0 : baseFee;
  const discountAmount = discountApplied ? (discountApplied.type === 'free_musubi' ? 40 : Math.round(subtotal * discountApplied.value / 100)) : 0;
  const promoDiscountAmount = promoApplied ? (promoApplied.type === 'fixed' ? Math.min(promoApplied.value, subtotal) : Math.round(subtotal * promoApplied.value / 100)) : 0;
  const total = Math.max(0, subtotal + shippingFee - discountAmount - promoDiscountAmount);
  const pointsEarned = calculatePoints(total);
  const currentDeliveryOptions = deliveryServiceOptions[location] || deliveryServiceOptions.DWCL;

  const validCodes: Record<string, { type: string; value: number; label: string }> = {
    MYSTERY10: { type: 'percent', value: 10, label: '10% OFF' },
    MYSTERY15: { type: 'percent', value: 15, label: '15% OFF' },
    MYSTERY20: { type: 'percent', value: 20, label: '20% OFF' },
    FREEMUSUBI: { type: 'free_musubi', value: 40, label: 'Free Musubi' },
  };

  const handleApplyCode = () => {
    setDiscountError('');
    const code = discountCode.trim().toUpperCase();
    if (!code) { setDiscountError('Please enter a code.'); return; }
    if (discountApplied) { setDiscountError('A code is already applied. Remove it first.'); return; }
    const codeData = validCodes[code];
    if (!codeData) { setDiscountError('Invalid discount code.'); return; }
    const savedCodes = JSON.parse(localStorage.getItem('muragoods_discount_codes') || '[]') as { code: string; label: string; wonAt: string }[];
    const hasCode = savedCodes.some((c) => c.code === code);
    if (!hasCode) { setDiscountError('You haven\'t won this code yet. Open a Mystery Box to earn discount codes!'); return; }
    setDiscountApplied({ code, type: codeData.type, value: codeData.value, label: codeData.label });
    setDiscountCode('');
  };

  const handleRemoveCode = () => { setDiscountApplied(null); setDiscountError(''); };

  const handleApplyPromo = async () => {
    setPromoError('');
    const code = promoCode.trim().toUpperCase();
    if (!code) { setPromoError('Please enter a promo code.'); return; }
    if (promoApplied) { setPromoError('A promo code is already applied. Remove it first.'); return; }
    if (discountApplied) { setPromoError('Remove the discount code first.'); return; }
    try {
      const res = await fetch(`/api/promo-codes?code=${encodeURIComponent(code)}`);
      const result = await res.json();
      if (!result.success) { setPromoError(result.error || 'Invalid promo code'); return; }
      const data = result.data;
      if (data.minOrder && subtotal < data.minOrder) { setPromoError(`Minimum order of ₱${data.minOrder} required for this code`); return; }
      setPromoApplied(data);
      setPromoCode('');
    } catch { setPromoError('Failed to validate promo code'); }
  };

  const handleRemovePromo = () => { setPromoApplied(null); setPromoError(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (cartItems.length === 0) { setError('Your cart is empty!'); return; }
    if (!isDwcl && !isDaraga && totalItems < 2) { setError('Minimum 2 items required for custom delivery.'); return; }
    const phoneDigits = phone.replace(/[\s\-()+]/g, '');
    if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 15) { setError('Please enter a valid contact number (10-15 digits).'); return; }
    if (!isDwcl && !isCustom && !mapAddress) { setError('Please select your delivery location on the map'); return; }
    if (!customOrderDate) { setError('Please enter your preferred order date'); return; }
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
    formData.append('status', 'Pending Payment');
    formData.append('total', String(total));
    formData.append('items', JSON.stringify(cartItems.map(item => `${item.name} (${item.selectedVariant?.name}) x ${item.quantity}`)));
    formData.append('deliveryType', deliveryService);
    formData.append('deliveryTimeSlot', timeSlot || '');
    formData.append('userId', user.email);
    formData.append('pointsEarned', String(pointsEarned));
    if (discountApplied) { formData.append('discountCode', discountApplied.code); formData.append('discountAmount', String(discountAmount)); }
    if (promoApplied) { formData.append('promoCode', promoApplied.code); formData.append('promoDiscount', String(promoDiscountAmount)); }
    if (isGcash) { formData.append('gcashRefNumber', gcashRef); formData.append('gcashScreenshot', gcashFile!); }
    try {
      const res = await fetch('/api/orders', { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success) {
        localStorage.removeItem('cart');
        setCart({});
        addCoins(pointsEarned, `Order #${result.data?.id?.slice(-8) || 'placed'}`);
        setPlacedOrderId(result.data?.id || result.data?._id || '');
        setShowSuccessModal(true);
      } else { setError(result.error || 'Failed to place order.'); }
    } catch { setError('Failed to place order.'); } finally { setIsSubmitting(false); }
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
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--mario-bg)' }}>
        <p className="text-sm animate-pulse" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--mario-yellow)' }}>LOADING...</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Checkout" />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 16px' }}>
        {error && (
          <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#e63946', fontSize: '12px', fontWeight: 600 }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* ─── Cart Items Card ───────────────────────────── */}
          <div className="checkout-card" style={{ marginBottom: '0' }}>
            <div className="checkout-title">YOUR CART</div>
            <div style={{ padding: '20px' }}>
              {cartItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <p style={{ color: 'var(--mario-text)', fontSize: '13px', fontWeight: 600 }}>Your cart is empty</p>
                  <p style={{ color: 'var(--mario-text-muted)', fontSize: '11px', marginTop: '8px' }}>Add items from the menu to get started</p>
                  <Link href="/menu" style={{ display: 'inline-block', marginTop: '16px', padding: '8px 20px', background: 'rgba(255,214,10,0.15)', border: '1px solid rgba(255,214,10,0.3)', borderRadius: '5px', color: 'var(--mario-yellow)', fontSize: '11px', fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-arcade)' }}>Go to Menu</Link>
                </div>
              ) : (
                <div className="cart-items">
                  {cartItems.map((item) => {
                    const cartKey = `${item.id}__${item.selectedVariant?.id || item.variants[0]?.id || ''}`;
                    return (
                      <div key={cartKey} className="cart-item">
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{item.name}</p>
                          <p style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>{item.selectedVariant?.name} · ₱{item.selectedVariant?.price || 0} each</p>
                        </div>
                        <div className="qty-controls">
                          <button type="button" onClick={() => updateCartQty(cartKey, -1)} className="qty-btn qty-btn-minus">−</button>
                          <span className="qty-value">{item.quantity}</span>
                          <button type="button" onClick={() => updateCartQty(cartKey, 1)} className="qty-btn qty-btn-plus">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {cartItems.length > 0 && (
            <>
              {/* ─── Delivery Details Card ──────────────────── */}
              <div className="checkout-card" style={{ marginTop: '12px' }}>
                <div className="checkout-title">DELIVERY DETAILS</div>
                <div className="cart-steps">
                  {restrictedItems.length > 0 && (
                    <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.25)', borderRadius: '6px', padding: '10px 12px', fontSize: '11px', color: '#e63946', marginBottom: '8px' }}>
                      ⚠ Coffee Jelly & Cookies are only for DWCL pickup!
                    </div>
                  )}
                  {!isDwcl && !isCustom && totalItems < 2 && (
                    <div style={{ background: 'rgba(255,214,10,0.08)', border: '1px solid rgba(255,214,10,0.25)', borderRadius: '6px', padding: '10px 12px', fontSize: '11px', color: '#ffd60a', marginBottom: '8px' }}>
                      ⚠ Minimum 2 items for delivery outside DWCL.
                    </div>
                  )}

                  {isDaraga && (
                    <div style={{ background: 'rgba(6,214,160,0.08)', border: '1px solid rgba(6,214,160,0.25)', borderRadius: '6px', padding: '10px 12px', fontSize: '11px', color: '#06d6a0', marginBottom: '8px' }}>
                      📍 Daraga/Legazpi: ₱30 delivery fee. {subtotal >= 200 ? '✨ FREE SHIPPING UNLOCKED!' : `Add ₱${200 - subtotal} more for free shipping!`}
                    </div>
                  )}

                  {isCustom && (
                    <div style={{ background: 'rgba(255,214,10,0.06)', border: '1px solid rgba(255,214,10,0.2)', borderRadius: '6px', padding: '12px', marginBottom: '8px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: '#ffd60a', marginBottom: '6px' }}>📬 Custom Delivery</p>
                      <p style={{ fontSize: '11px', color: '#bbb' }}>Fee and schedule discussed via Instagram DM.</p>
                      <a href="https://www.instagram.com/muragoods_/" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '8px', padding: '6px 14px', background: '#555', borderRadius: '5px', color: '#fff', fontSize: '10px', fontWeight: 600, textDecoration: 'none' }}>
                        💬 Message @muragoods_
                      </a>
                    </div>
                  )}

                  <div className="step">
                    <span>Delivery Zone</span>
                    <select value={location} onChange={(e) => setLocation(e.target.value as ZoneKey)} className="input_field" style={{ cursor: 'pointer' }}>
                      {deliveryZones.map(zone => <option key={zone.code} value={zone.code}>{zone.label}</option>)}
                    </select>
                    <p>{zoneData?.note}</p>
                  </div>

                  <div className="step">
                    <span>Contact Number *</span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09XXXXXXXXX" className="input_field" required />
                  </div>

                  <div className="step">
                    <span>Preferred Order Date *</span>
                    <input type="date" value={customOrderDate} onChange={(e) => setCustomOrderDate(e.target.value)} required min={tomorrow} className="input_field" />
                  </div>

                  {!isDwcl && (
                    <div className="step">
                      <span>Preferred Time Slot</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {timeSlotOptions.map(slot => (
                          <button key={slot.value} type="button" onClick={() => setTimeSlot(slot.value)}
                            style={{
                              padding: '12px 8px', borderRadius: '8px', border: timeSlot === slot.value ? '1px solid #ffd60a' : '1px solid #2e2e2e',
                              background: timeSlot === slot.value ? 'rgba(255,214,10,0.08)' : '#333', color: '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
                            }}>
                            <span style={{ fontSize: '16px' }}>{slot.icon}</span>
                            <p style={{ fontSize: '10px', fontWeight: 600, marginTop: '4px' }}>{slot.label}</p>
                            <p style={{ fontSize: '9px', color: '#bbb', marginTop: '2px' }}>{slot.time}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="step">
                    <span>Delivery Service</span>
                    <select value={deliveryService} onChange={(e) => setDeliveryService(e.target.value)} className="input_field" style={{ cursor: 'pointer' }}>
                      {currentDeliveryOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  {isDwcl && (
                    <div style={{ background: 'rgba(255,214,10,0.06)', border: '1px solid rgba(255,214,10,0.2)', borderRadius: '6px', padding: '12px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: '#ffd60a' }}>DWCL Pickup</p>
                      <p style={{ fontSize: '11px', color: '#bbb', marginTop: '4px' }}>No map needed for campus pickup.</p>
                    </div>
                  )}

                  {!isDwcl && (
                    <div className="step">
                      <span>Delivery Location — Pin & Confirm</span>
                      <LocationPicker initialLat={13.1550} initialLng={123.7450} onLocationSelect={(lat, lng, address) => { setMapAddress(address); setLatitude(String(lat)); setLongitude(String(lng)); }} />
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Payment Method Card ────────────────────── */}
              <div className="checkout-card" style={{ marginTop: '12px' }}>
                <div className="checkout-title">PAYMENT</div>
                <div className="cart-steps">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button type="button" onClick={() => setPaymentMethod('GCash')}
                      style={{
                        padding: '16px 12px', borderRadius: '8px', border: isGcash ? '1px solid #ffd60a' : '1px solid #2e2e2e',
                        background: isGcash ? 'rgba(255,214,10,0.08)' : '#333', color: '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
                      }}>
                      <div style={{ fontSize: '20px', marginBottom: '6px' }}>💳</div>
                      <p style={{ fontSize: '11px', fontWeight: 600 }}>GCash</p>
                      <p style={{ fontSize: '9px', color: '#bbb', marginTop: '4px' }}>Ref + proof required</p>
                    </button>
                    <button type="button" onClick={() => (isDwcl || isDaraga) && setPaymentMethod('Cash on Delivery')} disabled={!isDwcl && !isDaraga}
                      style={{
                        padding: '16px 12px', borderRadius: '8px',
                        border: !isDwcl && !isDaraga ? '1px solid #2e2e2e' : paymentMethod === 'Cash on Delivery' ? '1px solid #06d6a0' : '1px solid #2e2e2e',
                        background: !isDwcl && !isDaraga ? '#2a2a2a' : paymentMethod === 'Cash on Delivery' ? 'rgba(6,214,160,0.08)' : '#333',
                        color: !isDwcl && !isDaraga ? '#555' : '#fff', cursor: !isDwcl && !isDaraga ? 'not-allowed' : 'pointer', textAlign: 'center', transition: 'all 0.2s', opacity: !isDwcl && !isDaraga ? 0.4 : 1
                      }}>
                      <div style={{ fontSize: '20px', marginBottom: '6px' }}>💵</div>
                      <p style={{ fontSize: '11px', fontWeight: 600 }}>Cash on Delivery</p>
                      <p style={{ fontSize: '9px', color: '#bbb', marginTop: '4px' }}>{isDwcl ? 'DWCL pickup' : isDaraga ? 'Daraga/Legazpi' : 'Unavailable'}</p>
                    </button>
                  </div>

                  {isGcash && (
                    <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid #2e2e2e', borderRadius: '8px', padding: '16px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: '#ffd60a', marginBottom: '8px' }}>💳 GCash Payment Details</p>
                      <p style={{ fontSize: '12px', color: '#fff', marginBottom: '12px' }}>Send amount to: <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a' }}>639466472599</span></p>
                      <div style={{ marginBottom: '12px' }}>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>Reference Number *</p>
                        <input type="text" value={gcashRef} onChange={(e) => setGcashRef(e.target.value)} placeholder="GCash reference number" className="input_field" required={isGcash} />
                      </div>
                      <div>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>Upload Receipt *</p>
                        <input type="file" accept="image/*" onChange={(e) => setGcashFile(e.target.files?.[0] || null)} className="input_file" required={isGcash} />
                      </div>
                    </div>
                  )}

                  {!isGcash && (
                    <div style={{ marginTop: '12px', background: 'rgba(6,214,160,0.06)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: '8px', padding: '16px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: '#06d6a0' }}>💵 Cash on Delivery</p>
                      <p style={{ fontSize: '12px', color: '#fff', marginTop: '6px' }}>{isDwcl ? 'Pay in cash when you pick up your order. No payment proof needed!' : 'Pay in cash when delivered. No payment proof needed!'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Codes Card ─────────────────────────────── */}
              <div className="checkout-card" style={{ marginTop: '12px' }}>
                <div className="checkout-title">CODES & PROMOS</div>
                <div className="cart-steps">
                  {/* Discount Code */}
                  <div className="step">
                    <span>🎁 Discount Code</span>
                    {discountApplied ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(6,214,160,0.08)', border: '1px solid rgba(6,214,160,0.25)', borderRadius: '6px', padding: '10px 12px' }}>
                        <div>
                          <p style={{ fontSize: '10px', color: '#06d6a0', fontWeight: 600 }}>✓ {discountApplied.code} — {discountApplied.label}</p>
                          <p style={{ fontSize: '11px', color: '#fff', marginTop: '2px' }}>You save ₱{discountAmount}!</p>
                        </div>
                        <button type="button" onClick={handleRemoveCode} style={{ padding: '4px 10px', background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '4px', color: '#e63946', fontSize: '9px', fontWeight: 600, cursor: 'pointer' }}>Remove</button>
                      </div>
                    ) : (
                      <div className="promo-form">
                        <input type="text" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="e.g. MYSTERY10" className="input_field" style={{ flex: 1 }} />
                        <button type="button" onClick={handleApplyCode} className="promo-btn">Apply</button>
                      </div>
                    )}
                    {discountError && <p style={{ fontSize: '9px', color: '#e63946', marginTop: '4px' }}>⚠ {discountError}</p>}
                  </div>

                  {/* Promo Code */}
                  <div className="step">
                    <span>🏷️ Promo Code</span>
                    {promoApplied ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(6,214,160,0.08)', border: '1px solid rgba(6,214,160,0.25)', borderRadius: '6px', padding: '10px 12px' }}>
                        <div>
                          <p style={{ fontSize: '10px', color: '#06d6a0', fontWeight: 600 }}>✓ {promoApplied.code} — {promoApplied.type === 'percent' ? `${promoApplied.value}% OFF` : `₱${promoApplied.value} OFF`}</p>
                          <p style={{ fontSize: '11px', color: '#fff', marginTop: '2px' }}>You save ₱{promoDiscountAmount}!</p>
                        </div>
                        <button type="button" onClick={handleRemovePromo} style={{ padding: '4px 10px', background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '4px', color: '#e63946', fontSize: '9px', fontWeight: 600, cursor: 'pointer' }}>Remove</button>
                      </div>
                    ) : (
                      <div className="promo-form">
                        <input type="text" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Enter promo code" className="input_field" style={{ flex: 1 }} />
                        <button type="button" onClick={handleApplyPromo} className="promo-btn">Apply</button>
                      </div>
                    )}
                    {promoError && <p style={{ fontSize: '9px', color: '#e63946', marginTop: '4px' }}>⚠ {promoError}</p>}
                  </div>
                </div>
              </div>

              {/* ─── Order Summary & Checkout Footer ────────── */}
              <div className="checkout-card" style={{ marginTop: '12px', borderRadius: '19px 19px 0 0' }}>
                <div className="checkout-title">ORDER SUMMARY</div>
                <div className="payments" style={{ padding: '20px' }}>
                  <div className="details">
                    <span>Subtotal</span><span>₱{subtotal}</span>
                    <span>Shipping ({location})</span><span>{isCustom ? 'TBD' : shippingFee === 0 ? 'FREE' : `₱${shippingFee}`}</span>
                    {discountApplied && <><span>Discount ({discountApplied.code})</span><span style={{ color: '#06d6a0' }}>-₱{discountAmount}</span></>}
                    {promoApplied && <><span>Promo ({promoApplied.code})</span><span style={{ color: '#06d6a0' }}>-₱{promoDiscountAmount}</span></>}
                    <hr />
                    <span style={{ fontWeight: 900, fontSize: '14px' }}>Total</span><span style={{ fontWeight: 900, fontSize: '14px' }}>₱{total}</span>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '11px', color: '#bbb' }}>
                    <p>Date: <span style={{ color: '#fff' }}>{customOrderDate || '—'}</span></p>
                    <p>Zone: <span style={{ color: '#fff' }}>{location}</span></p>
                    <p>Payment: <span style={{ color: '#fff' }}>{paymentMethod}</span></p>
                    <p>Service: <span style={{ color: '#fff' }}>{deliveryService}</span></p>
                    {timeSlot && <p>Time: <span style={{ color: '#fff' }}>{timeSlotOptions.find(s => s.value === timeSlot)?.label}</span></p>}
                  </div>
                  {pointsEarned > 0 && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #2e2e2e' }}>
                      <p style={{ fontSize: '11px', color: '#ffd60a', fontWeight: 600 }}>🪙 You&apos;ll earn {pointsEarned} coins!</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Checkout Footer ────────────────────────── */}
              <div className="checkout-footer">
                <div className="price">₱{total}</div>
                <button type="submit" disabled={cartItems.length === 0 || isSubmitting} className="checkout-btn" style={{ opacity: cartItems.length === 0 || isSubmitting ? 0.5 : 1 }}>
                  {isSubmitting ? 'PLACING...' : 'CHECKOUT →'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      {/* ─── Success Modal ─────────────────────────────── */}
      {showSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="checkout-title" style={{ borderRadius: '19px 19px 0 0' }}>ORDER PLACED!</div>
            <div style={{ padding: '30px 20px', textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(6,214,160,0.15)', border: '1px solid rgba(6,214,160,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '20px', color: '#06d6a0' }}>✓</div>
              <p style={{ color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                {isGcash ? 'Message @muragoods_ on Instagram to confirm!' : 'Pay cash when you pick up!'}
              </p>
              <p style={{ fontSize: '11px', color: '#ffd60a', marginBottom: '20px' }}>🪙 +{pointsEarned} coins added!</p>
              {isGcash && (
                <a href="https://www.instagram.com/muragoods_/" target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '10px', background: '#555', borderRadius: '5px', color: '#fff', fontSize: '11px', fontWeight: 600, textDecoration: 'none', marginBottom: '10px' }}>
                  Open Instagram @muragoods_
                </a>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setShowSuccessModal(false); router.push(placedOrderId ? `/order/${placedOrderId}` : '/orders'); }} style={{ flex: 1, padding: '10px', background: '#333', border: '1px solid #2e2e2e', borderRadius: '5px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>View Order</button>
                <button onClick={() => { setShowSuccessModal(false); router.push('/menu'); }} style={{ flex: 1, padding: '10px', background: '#555', border: '1px solid #2e2e2e', borderRadius: '5px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Continue Shopping</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .checkout-card {
          background: var(--mario-bg-card);
          border-radius: 19px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(255,255,255,0.05);
        }
        .checkout-title {
          width: 100%;
          height: 40px;
          display: flex;
          align-items: center;
          padding-left: 20px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          font-weight: 700;
          font-size: 11px;
          color: var(--mario-yellow);
          font-family: var(--font-arcade);
          letter-spacing: 0.5px;
        }
        .cart-steps {
          display: flex;
          flex-direction: column;
          padding: 20px;
          gap: 16px;
        }
        .step {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .step span {
          font-size: 13px;
          font-weight: 600;
          color: var(--mario-text);
          margin-bottom: 2px;
          display: block;
        }
        .step p {
          font-size: 11px;
          font-weight: 600;
          color: var(--mario-text-muted);
          margin: 0;
        }
        .input_field {
          width: 100%;
          height: 36px;
          padding: 0 0 0 12px;
          border-radius: 5px;
          outline: none;
          border: 1px solid rgba(255,255,255,0.1);
          background-color: var(--mario-bg-input);
          color: var(--mario-text);
          font-size: 12px;
          transition: all 0.3s cubic-bezier(0.15, 0.83, 0.66, 1);
          font-family: var(--font-body);
          backdrop-filter: blur(8px);
        }
        .input_field:focus {
          border: 1px solid var(--mario-yellow);
          box-shadow: 0 0 0 3px rgba(255,214,10,0.15);
          background-color: var(--mario-bg-input);
        }
        .input_file {
          width: 100%;
          padding: 8px 12px;
          border-radius: 5px;
          border: 1px solid rgba(255,255,255,0.1);
          background-color: var(--mario-bg-input);
          color: var(--mario-text);
          font-size: 11px;
        }
        .cart-items {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .cart-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          background: var(--mario-bg-input);
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .qty-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .qty-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 5px;
          border: 1px solid rgba(255,255,255,0.1);
          background: var(--mario-bg-input);
          color: var(--mario-text);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
        }
        .qty-btn:hover { background: rgba(255,255,255,0.1); }
        .qty-btn-minus { color: var(--mario-red); border-color: rgba(230,57,70,0.3); }
        .qty-btn-plus { color: var(--mario-green); border-color: rgba(6,214,160,0.3); }
        .qty-value {
          font-size: 12px;
          font-weight: 700;
          color: var(--mario-text);
          min-width: 20px;
          text-align: center;
        }
        .promo-form {
          display: grid;
          grid-template-columns: 1fr 80px;
          gap: 8px;
        }
        .promo-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 36px;
          background: rgba(255,214,10,0.15);
          border-radius: 5px;
          border: 1px solid rgba(255,214,10,0.3);
          font-weight: 600;
          font-size: 11px;
          color: var(--mario-yellow);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.15, 0.83, 0.66, 1);
          font-family: var(--font-arcade);
        }
        .promo-btn:hover { background: rgba(255,214,10,0.25); }
        .payments .details {
          display: grid;
          grid-template-columns: 10fr 1fr;
          gap: 5px;
        }
        .payments .details span:nth-child(odd) {
          font-size: 12px;
          font-weight: 600;
          color: var(--mario-text);
        }
        .payments .details span:nth-child(even) {
          font-size: 13px;
          font-weight: 600;
          color: var(--mario-text-muted);
          text-align: right;
        }
        .payments hr {
          height: 1px;
          background-color: rgba(255,255,255,0.08);
          border: none;
          margin: 8px 0;
          grid-column: 1 / -1;
        }
        .checkout-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 10px 10px 20px;
          background-color: rgba(255,255,255,0.03);
          border-radius: 0 0 19px 19px;
          margin-top: -1px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .price {
          font-size: 22px;
          color: var(--mario-yellow);
          font-weight: 900;
        }
        .checkout-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 150px;
          height: 36px;
          background: var(--mario-green);
          border-radius: 7px;
          border: 1px solid var(--mario-green-dark);
          color: #0f0f1a;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.15, 0.83, 0.66, 1);
          font-family: var(--font-arcade);
          box-shadow: 0 3px 0 var(--mario-green-dark);
        }
        .checkout-btn:hover { background-color: #0cf0b0; transform: translateY(-1px); }
        .checkout-btn:active { transform: translateY(1px); box-shadow: 0 1px 0 var(--mario-green-dark); }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
          backdrop-filter: blur(4px);
        }
        .modal-card {
          background: var(--mario-bg-card);
          border-radius: 19px;
          width: 100%;
          max-width: 400px;
          border: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(16px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15);
          overflow: hidden;
        }
      `}</style>
    </main>
  );
}
