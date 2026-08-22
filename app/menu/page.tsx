'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { products as staticProducts, type Product, type CartItem, deliveryZones, type ZoneKey } from '@/app/lib/muragoods-data';
import { useProducts } from '@/app/hooks/useProducts';
import { NavBar } from '@/app/components/NavBar';

const dwclOnlyProducts = ['cookies', 'coffee-jelly'];
const categories = ['All', 'Musubi & Churros', 'Coffee Jelly & Cookies'];

export default function MenuPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState('All');
  const [location, setLocation] = useState<ZoneKey>('DWCL');
  const [cart, setCart] = useState<Record<string, { quantity: number; variantId?: string }>>({});
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [restrictionMessage, setRestrictionMessage] = useState('');
  const { products } = useProducts();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) setIsLoggedIn(true);
    try {
      const savedCart = localStorage.getItem('cart');
      if (savedCart) setCart(JSON.parse(savedCart));
    } catch { setCart({}); }
  }, []);

  const isDwcl = location === 'DWCL';

  const filteredProducts = useMemo(() => {
    return activeCategory === 'All' ? [...products] : products.filter((p) => p.category === activeCategory);
  }, [activeCategory, products]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([, data]) => data.quantity > 0)
      .map(([cartKey, data]) => {
        const productId = cartKey.split('__')[0];
        const product = products.find((p) => p.id === productId) || staticProducts.find((p) => p.id === productId);
        if (!product) return null;
        const variantId = cartKey.split('__')[1] || data.variantId || product.variants[0].id;
        const variant = product.variants.find((v) => v.id === variantId);
        return { ...product, quantity: data.quantity, selectedVariant: variant || product.variants[0] } as CartItem;
      })
      .filter((item): item is CartItem => item !== null);
  }, [cart, products]);

  const isProductAvailable = (product: Product) => {
    if (product.inventory === 'Out of Stock') return false;
    if (!isDwcl && dwclOnlyProducts.includes(product.id)) return false;
    return true;
  };

  const addToCart = (product: Product, variantId?: string) => {
    if (!isProductAvailable(product)) {
      setRestrictionMessage('This item is only available for DWCL campus pickup!');
      setTimeout(() => setRestrictionMessage(''), 3000);
      return;
    }
    const actualVariantId = variantId || product.variants[0].id;
    const cartKey = `${product.id}__${actualVariantId}`;
    setCart((prev) => {
      const next = { ...prev, [cartKey]: { quantity: (prev[cartKey]?.quantity || 0) + 1, variantId: actualVariantId } };
      localStorage.setItem('cart', JSON.stringify(next));
      return next;
    });
    setSelectedProduct(null);
    setSelectedVariantId('');
  };

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cartItems.reduce((sum, item) => sum + (item.selectedVariant?.price || 0) * item.quantity, 0);

  const handleCheckout = () => {
    if (!isLoggedIn) { setShowLoginPrompt(true); return; }
    if (cartItems.length === 0) return;
    router.push('/checkout');
  };

  const openVariantModal = (product: Product) => {
    if (!isLoggedIn) { setShowLoginPrompt(true); return; }
    if (!isProductAvailable(product)) {
      setRestrictionMessage('This item is only available for DWCL campus pickup!');
      setTimeout(() => setRestrictionMessage(''), 3000);
      return;
    }
    setSelectedProduct(product);
    setSelectedVariantId(product.variants[0].id);
  };

  const confirmVariant = () => {
    if (selectedProduct) addToCart(selectedProduct, selectedVariantId);
  };

  return (
    <main style={{ minHeight: '100vh', background: '#1c1c1c' }}>
      <NavBar cartCount={totalItems} />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-arcade)', letterSpacing: '0.5px' }}>
            MENU
          </h1>
          <p style={{ color: '#bbb', fontSize: '12px', marginTop: '6px' }}>Pick your favorites from our legendary selection.</p>
        </div>

        {/* Restriction Message */}
        {restrictionMessage && (
          <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.25)', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', color: '#e63946', fontSize: '11px', fontWeight: 600 }}>
            ⚠ {restrictionMessage}
          </div>
        )}

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '8px 16px', borderRadius: '5px', border: activeCategory === cat ? '1px solid #ffd60a' : '1px solid #2e2e2e',
                background: activeCategory === cat ? 'rgba(255,214,10,0.08)' : '#21262c', color: '#fff', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-arcade)'
              }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Zone Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#fff', marginBottom: '6px', display: 'block' }}>Delivery / Pickup Zone</label>
          <div className="select-wrapper">
            <select value={location} onChange={(e) => setLocation(e.target.value as ZoneKey)} className="menu-select">
              {deliveryZones.map((zone) => (
                <option key={zone.code} value={zone.code}>{zone.label}</option>
              ))}
            </select>
          </div>
          {!isDwcl && (
            <div style={{ marginTop: '8px', background: 'rgba(255,214,10,0.06)', border: '1px solid rgba(255,214,10,0.2)', borderRadius: '6px', padding: '8px 12px', fontSize: '11px', color: '#ffd60a', fontWeight: 600 }}>
              ⚠ Cookies & Coffee Jelly are DWCL pickup only!
            </div>
          )}
        </div>

        {/* Delivery Info Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '24px' }}>
          <div style={{ background: '#21262c', border: '1px solid #2e2e2e', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '20px' }}>🎓</span>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#fff', marginTop: '6px' }}>DWCL Pickup</p>
            <p style={{ fontSize: '10px', color: '#bbb', marginTop: '2px' }}>Free · All items</p>
          </div>
          <div style={{ background: '#21262c', border: '1px solid #2e2e2e', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '20px' }}>📍</span>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#fff', marginTop: '6px' }}>Daraga / Legazpi</p>
            <p style={{ fontSize: '10px', color: '#bbb', marginTop: '2px' }}>₱30 delivery · Free 200+</p>
          </div>
          <div style={{ background: '#21262c', border: '1px solid #2e2e2e', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
            <span style={{ fontSize: '20px' }}>📬</span>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#fff', marginTop: '6px' }}>Custom Delivery</p>
            <p style={{ fontSize: '10px', color: '#bbb', marginTop: '2px' }}>Within the day · Mon-Fri · Sun</p>
          </div>
        </div>

        {/* Product Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
          {filteredProducts.map((product) => {
            const available = isProductAvailable(product);
            return (
              <div key={product.id} className="product-card" style={{ opacity: available ? 1 : 0.5 }}>
                {/* Image */}
                <div style={{ position: 'relative', height: '180px', background: '#0d1117', borderBottom: '1px solid #2e2e2e', overflow: 'hidden' }}>
                  <Image src={product.image} alt={product.name} fill className="object-contain p-4" style={{ transition: 'transform 0.3s' }} />
                  {!available && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ padding: '6px 14px', background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '5px', color: '#e63946', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-arcade)' }}>
                        {product.inventory === 'Out of Stock' ? 'OUT OF STOCK' : 'DWCL ONLY'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <h3 style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>{product.name}</h3>
                    <span style={{
                      fontSize: '9px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                      background: product.inventory === 'In Stock' ? 'rgba(6,214,160,0.1)' : 'rgba(251,133,0,0.1)',
                      color: product.inventory === 'In Stock' ? '#06d6a0' : '#fb8500',
                      border: `1px solid ${product.inventory === 'In Stock' ? 'rgba(6,214,160,0.25)' : 'rgba(251,133,0,0.25)'}`
                    }}>
                      {product.inventory}
                    </span>
                  </div>
                  <p style={{ color: '#bbb', fontSize: '11px', marginBottom: '10px' }}>{product.description}</p>

                  {/* Variants */}
                  <div style={{ marginBottom: '12px' }}>
                    {product.variants.map((variant) => (
                      <div key={variant.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '11px' }}>
                        <span style={{ color: '#bbb' }}>{variant.name}</span>
                        <span style={{ color: '#fff', fontWeight: 700 }}>₱{variant.price}</span>
                      </div>
                    ))}
                  </div>

                  {/* Add Button */}
                  <button
                    type="button"
                    onClick={() => openVariantModal(product)}
                    disabled={!available}
                    style={{
                      width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #2e2e2e',
                      background: available ? '#555' : '#333', color: '#fff', fontSize: '11px', fontWeight: 600,
                      cursor: available ? 'pointer' : 'not-allowed', transition: 'all 0.2s', fontFamily: 'var(--font-arcade)',
                      opacity: available ? 1 : 0.4
                    }}>
                    {available ? '+ ADD TO CART' : 'NOT AVAILABLE'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Variant Modal ─────────────────────────────── */}
      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">SELECT VARIANT</div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '12px', color: '#bbb', marginBottom: '12px' }}>{selectedProduct.name}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedProduct.variants.map((variant) => (
                  <label key={variant.id} className="variant-option" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px',
                    background: selectedVariantId === variant.id ? 'rgba(255,214,10,0.06)' : '#222',
                    border: selectedVariantId === variant.id ? '1px solid #ffd60a' : '1px solid #2e2e2e',
                    borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input type="radio" name="variant" value={variant.id} checked={selectedVariantId === variant.id} onChange={(e) => setSelectedVariantId(e.target.value)} style={{ accentColor: '#ffd60a' }} />
                      <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>{variant.name}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: 700 }}>₱{variant.price}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button type="button" onClick={() => setSelectedProduct(null)} style={{ flex: 1, padding: '10px', background: '#333', border: '1px solid #2e2e2e', borderRadius: '5px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={confirmVariant} style={{ flex: 1, padding: '10px', background: '#555', border: '1px solid #2e2e2e', borderRadius: '5px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Add to Cart</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Login Prompt ─────────────────────────────── */}
      {showLoginPrompt && (
        <div className="modal-overlay" onClick={() => setShowLoginPrompt(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">LOGIN REQUIRED</div>
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: '#bbb', marginBottom: '16px' }}>Sign in to add items to your cart!</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Link href="/login" style={{ display: 'block', padding: '10px', background: '#555', border: '1px solid #2e2e2e', borderRadius: '5px', color: '#fff', fontSize: '11px', fontWeight: 600, textDecoration: 'none', textAlign: 'center', fontFamily: 'var(--font-arcade)' }} onClick={() => setShowLoginPrompt(false)}>LOG IN</Link>
                <Link href="/signup" style={{ display: 'block', padding: '10px', background: 'rgba(6,214,160,0.15)', border: '1px solid rgba(6,214,160,0.3)', borderRadius: '5px', color: '#06d6a0', fontSize: '11px', fontWeight: 600, textDecoration: 'none', textAlign: 'center', fontFamily: 'var(--font-arcade)' }} onClick={() => setShowLoginPrompt(false)}>CREATE ACCOUNT</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Floating Cart Button ─────────────────────── */}
      {cartItems.length > 0 && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 40 }}>
          <button onClick={handleCheckout} style={{
            padding: '12px 24px', borderRadius: '8px', border: '1px solid #2e2e2e',
            background: '#555', color: '#fff', fontSize: '12px', fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontFamily: 'var(--font-arcade)',
            transition: 'all 0.2s'
          }}>
            🛒 Cart ({totalItems}) — ₱{totalPrice}
          </button>
        </div>
      )}

      <style jsx>{`
        .select-wrapper {
          position: relative;
          width: 200px;
        }
        .select-wrapper::after {
          content: '▾';
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #bbb;
          font-size: 12px;
          pointer-events: none;
        }
        .menu-select {
          width: 100%;
          height: 36px;
          padding: 0 30px 0 12px;
          border-radius: 5px;
          border: 1px solid #2e2e2e;
          background-color: #0d1117;
          color: #fff;
          font-size: 12px;
          font-family: var(--font-body);
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          outline: none;
          transition: all 0.3s cubic-bezier(0.15, 0.83, 0.66, 1);
        }
        .menu-select:focus {
          border: 1px solid transparent;
          box-shadow: 0px 0px 0px 2px #555555;
          background-color: #1a1f24;
        }
        .menu-select option {
          background: #1c1c1c;
          color: #fff;
        }
        .product-card {
          background: #1c1c1c;
          border-radius: 8px;
          border: 1px solid #2e2e2e;
          overflow: hidden;
          transition: all 0.2s;
        }
        .product-card:hover {
          border-color: #555;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
        }
        .modal-card {
          background: #1c1c1c;
          border-radius: 12px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0px 187px 75px rgba(0,0,0,0.01), 0px 105px 63px rgba(0,0,0,0.05), 0px 47px 47px rgba(0,0,0,0.09), 0px 12px 26px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .modal-title {
          width: 100%;
          height: 40px;
          display: flex;
          align-items: center;
          padding-left: 20px;
          border-bottom: 1px solid #2e2e2e;
          font-weight: 700;
          font-size: 11px;
          color: #ffffff;
          font-family: var(--font-arcade);
        }
      `}</style>
    </main>
  );
}
