'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { products as staticProducts, type Product, type CartItem, deliveryZones, type ZoneKey } from '@/app/lib/muragoods-data';
import { useProducts } from '@/app/hooks/useProducts';
import { NavBar } from '@/app/components/NavBar';
import { useFavorites, FavoriteButton } from '@/app/components/Favorites';

const dwclOnlyProducts = ['cookies', 'coffee-jelly'];
const categories = ['All', 'Musubi & Churros', 'Coffee Jelly & Cookies'];
const sortOptions = [
  { value: 'popular', label: '🔥 Popular' },
  { value: 'price-low', label: '💰 Price: Low → High' },
  { value: 'price-high', label: '💎 Price: High → Low' },
  { value: 'name', label: '🔤 Name A-Z' },
  { value: 'newest', label: '🆕 Newest' },
];

// Simulated ratings & popularity data
const productMeta: Record<string, { rating: number; reviews: number; popular: boolean; isNew: boolean; tags: string[] }> = {
  musubi: { rating: 4.8, reviews: 124, popular: true, isNew: false, tags: ['Bestseller', 'Student Favorite'] },
  churros: { rating: 4.6, reviews: 89, popular: true, isNew: false, tags: ['Crunchy', 'Sweet'] },
  'coffee-jelly': { rating: 4.7, reviews: 67, popular: false, isNew: true, tags: ['New!', 'Chilled'] },
  cookies: { rating: 4.5, reviews: 45, popular: false, isNew: true, tags: ['Fresh Baked'] },
};

// Combo deals
const comboDeals = [
  { id: 'combo3', name: 'Musubi + Churros', original: 110, combo: 95, items: ['musubi', 'churros'], emoji: '🍱🍩', desc: 'Power-up duo' },
];

function StarRating({ rating, reviews }: { rating: number; reviews: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ display: 'flex', gap: '1px' }}>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} style={{ fontSize: '10px', color: i < full ? '#ffd60a' : i === full && half ? '#ffd60a' : '#555' }}>
            {i < full ? '★' : i === full && half ? '★' : '☆'}
          </span>
        ))}
      </div>
      <span style={{ fontSize: '9px', color: 'var(--mario-text-muted)' }}>({reviews})</span>
    </div>
  );
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [showCombos, setShowCombos] = useState(true);
  const [showDetailModal, setShowDetailModal] = useState<Product | null>(null);
  const [quickAddQty, setQuickAddQty] = useState<Record<string, number>>({});
  const { products } = useProducts();
  const { isFavorite, toggleFavorite } = useFavorites();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) setIsLoggedIn(true);
    try {
      const savedCart = localStorage.getItem('cart');
      if (savedCart) setCart(JSON.parse(savedCart));
    } catch { setCart({}); }
    try {
      const rv = localStorage.getItem('recentlyViewed');
      if (rv) setRecentlyViewed(JSON.parse(rv));
    } catch { setRecentlyViewed([]); }
  }, []);

  const isDwcl = location === 'DWCL';

  const isProductAvailable = (product: Product) => {
    if (product.inventory === 'Out of Stock') return false;
    if (!isDwcl && dwclOnlyProducts.includes(product.id)) return false;
    return true;
  };

  const trackView = useCallback((productId: string) => {
    setRecentlyViewed(prev => {
      const updated = [productId, ...prev.filter(id => id !== productId)].slice(0, 10);
      localStorage.setItem('recentlyViewed', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const filteredProducts = useMemo(() => {
    let result = activeCategory === 'All' ? [...products] : products.filter(p => p.category === activeCategory);

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (productMeta[p.id]?.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort
    switch (sortBy) {
      case 'price-low':
        result.sort((a, b) => Math.min(...a.variants.map(v => v.price)) - Math.min(...b.variants.map(v => v.price)));
        break;
      case 'price-high':
        result.sort((a, b) => Math.max(...b.variants.map(v => v.price)) - Math.max(...a.variants.map(v => v.price)));
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'newest':
        result.sort((a, b) => (productMeta[b.id]?.isNew ? 1 : 0) - (productMeta[a.id]?.isNew ? 1 : 0));
        break;
      case 'popular':
      default:
        result.sort((a, b) => (productMeta[b.id]?.reviews || 0) - (productMeta[a.id]?.reviews || 0));
        break;
    }

    return result;
  }, [activeCategory, products, searchQuery, sortBy]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
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
  }, [cart, products]);

  const addToCart = (product: Product, variantId?: string, qty: number = 1) => {
    if (!isProductAvailable(product)) {
      setRestrictionMessage('This item is only available for DWCL campus pickup!');
      setTimeout(() => setRestrictionMessage(''), 3000);
      return;
    }
    const actualVariantId = variantId || product.variants[0].id;
    const cartKey = `${product.id}__${actualVariantId}`;
    setCart(prev => {
      const next = { ...prev, [cartKey]: { quantity: (prev[cartKey]?.quantity || 0) + qty, variantId: actualVariantId } };
      localStorage.setItem('cart', JSON.stringify(next));
      return next;
    });
    setSelectedProduct(null);
    setSelectedVariantId('');
    setQuickAddQty(prev => ({ ...prev, [product.id]: 1 }));
  };

  const quickAdd = (product: Product) => {
    if (!isLoggedIn) { setShowLoginPrompt(true); return; }
    if (!isProductAvailable(product)) {
      setRestrictionMessage('This item is only available for DWCL campus pickup!');
      setTimeout(() => setRestrictionMessage(''), 3000);
      return;
    }
    addToCart(product, product.variants[0].id, 1);
    trackView(product.id);
  };

  const updateQuickQty = (productId: string, delta: number) => {
    setQuickAddQty(prev => {
      const current = prev[productId] || 1;
      const next = Math.max(1, Math.min(10, current + delta));
      return { ...prev, [productId]: next };
    });
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
    trackView(product.id);
  };

  const openDetailModal = (product: Product) => {
    trackView(product.id);
    setShowDetailModal(product);
  };

  const confirmVariant = () => {
    if (selectedProduct) {
      const qty = quickAddQty[selectedProduct.id] || 1;
      addToCart(selectedProduct, selectedVariantId, qty);
    }
  };

  // Get cart quantity for a product
  const getCartQty = (productId: string) => {
    return Object.entries(cart)
      .filter(([key, data]) => key.startsWith(productId + '__') && data.quantity > 0)
      .reduce((sum, [, data]) => sum + data.quantity, 0);
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar cartCount={totalItems} />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ color: 'var(--mario-yellow)', fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-arcade)', letterSpacing: '0.5px' }}>MENU</h1>
            <p style={{ color: 'var(--mario-text-muted)', fontSize: '12px', marginTop: '4px' }}>Pick your favorites from our legendary selection.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>{filteredProducts.length} items</span>
          </div>
        </div>

        {/* ─── Search + Sort Bar ─────────────────────────── */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search menu..."
              className="deco-input"
              style={{ fontSize: '12px', paddingLeft: '12px' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--mario-text-muted)', cursor: 'pointer', fontSize: '14px' }}>
                ✕
              </button>
            )}
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{
            padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'var(--mario-bg-input)', color: 'var(--mario-text)', fontSize: '11px', cursor: 'pointer',
            fontFamily: 'var(--font-body)', minWidth: '160px',
          }}>
            {sortOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        {/* Restriction Message */}
        {restrictionMessage && (
          <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.25)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#e63946', fontSize: '11px', fontWeight: 600 }}>
            ⚠ {restrictionMessage}
          </div>
        )}

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '8px 16px', borderRadius: '8px',
                border: activeCategory === cat ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.08)',
                background: activeCategory === cat ? 'rgba(255,214,10,0.15)' : 'rgba(255,255,255,0.05)',
                color: activeCategory === cat ? 'var(--mario-yellow)' : 'var(--mario-text-muted)',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-arcade)',
              }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Zone Selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--mario-text)', marginBottom: '6px', display: 'block' }}>📍 Delivery / Pickup Zone</label>
          <select value={location} onChange={(e) => setLocation(e.target.value as ZoneKey)} style={{
            padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'var(--mario-bg-input)', color: 'var(--mario-text)', fontSize: '12px', cursor: 'pointer',
            fontFamily: 'var(--font-body)', width: '100%', maxWidth: '300px',
          }}>
            {deliveryZones.map(zone => <option key={zone.code} value={zone.code}>{zone.label}</option>)}
          </select>
          {!isDwcl && (
            <p style={{ marginTop: '6px', fontSize: '10px', color: 'var(--mario-orange)' }}>⚠ Cookies & Coffee Jelly are DWCL pickup only!</p>
          )}
        </div>

        {/* ─── Combo Deals ──────────────────────────────── */}
        {showCombos && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'var(--mario-orange)', textTransform: 'uppercase' }}>🔥 Combo Deals — Save More!</h2>
              <button onClick={() => setShowCombos(false)} style={{ background: 'none', border: 'none', color: 'var(--mario-text-muted)', cursor: 'pointer', fontSize: '12px' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {comboDeals.map(combo => (
                <div key={combo.id} style={{
                  background: 'rgba(251,133,0,0.06)', border: '1px solid rgba(251,133,0,0.2)', borderRadius: '12px',
                  padding: '14px', cursor: 'pointer', transition: 'all 0.2s',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(251,133,0,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(251,133,0,0.2)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                  onClick={() => {
                    if (!isLoggedIn) { setShowLoginPrompt(true); return; }
                    combo.items.forEach(productId => {
                      const product = products.find(p => p.id === productId);
                      if (product) addToCart(product, product.variants[0].id, 1);
                    });
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px' }}>{combo.emoji}</span>
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mario-text)' }}>{combo.name}</p>
                      <p style={{ fontSize: '9px', color: 'var(--mario-text-muted)' }}>{combo.desc}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--pewter)', textDecoration: 'line-through' }}>₱{combo.original}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--mario-orange)' }}>₱{combo.combo}</span>
                    <span style={{ fontSize: '8px', padding: '2px 6px', background: 'rgba(230,57,70,0.15)', color: 'var(--mario-red)', borderRadius: '4px', fontFamily: 'var(--font-arcade)' }}>
                      SAVE ₱{combo.original - combo.combo}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Recently Viewed ──────────────────────────── */}
        {recentlyViewed.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-text-muted)', marginBottom: '10px', textTransform: 'uppercase' }}>👁️ Recently Viewed</h2>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
              {recentlyViewed.slice(0, 5).map(id => {
                const p = products.find(pr => pr.id === id);
                if (!p) return null;
                return (
                  <div key={id} onClick={() => openDetailModal(p)} style={{
                    minWidth: '120px', background: 'var(--mario-bg-card)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px', padding: '10px', cursor: 'pointer', textAlign: 'center', flexShrink: 0,
                  }}>
                    <div style={{ position: 'relative', width: '50px', height: '50px', margin: '0 auto 6px' }}>
                      <Image src={p.image} alt={p.name} fill className="object-contain" />
                    </div>
                    <p style={{ fontSize: '9px', color: 'var(--mario-text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                    <p style={{ fontSize: '9px', color: 'var(--mario-yellow)', fontWeight: 700 }}>₱{Math.min(...p.variants.map(v => v.price))}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Product Grid ──────────────────────────────── */}
        {filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <p style={{ fontSize: '36px', marginBottom: '12px' }}>🔍</p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: 'var(--mario-text)' }}>No items found</p>
            <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginTop: '6px' }}>Try a different search or category</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
            {filteredProducts.map((product) => {
              const available = isProductAvailable(product);
              const meta = productMeta[product.id];
              const cartQty = getCartQty(product.id);
              return (
                <div key={product.id} className="product-card" style={{ opacity: available ? 1 : 0.5 }}>
                  {/* Image — clickable for detail */}
                  <div
                    onClick={() => available && openDetailModal(product)}
                    style={{ position: 'relative', height: '180px', background: 'var(--mario-bg)', borderBottom: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', cursor: available ? 'pointer' : 'default' }}
                  >
                    <Image src={product.image} alt={product.name} fill className="object-contain p-4" style={{ transition: 'transform 0.3s' }} />

                    {/* Badges */}
                    <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {meta?.popular && (
                        <span style={{ padding: '3px 8px', background: 'rgba(230,57,70,0.9)', borderRadius: '4px', color: '#fff', fontSize: '8px', fontWeight: 700, fontFamily: 'var(--font-arcade)' }}>
                          🔥 POPULAR
                        </span>
                      )}
                      {meta?.isNew && (
                        <span style={{ padding: '3px 8px', background: 'rgba(6,214,160,0.9)', borderRadius: '4px', color: '#0f0f1a', fontSize: '8px', fontWeight: 700, fontFamily: 'var(--font-arcade)' }}>
                          ✨ NEW
                        </span>
                      )}
                    </div>

                    {/* Favorite */}
                    <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                      <FavoriteButton
                        item={{ id: product.id, name: product.name, image: product.image }}
                        isFav={isFavorite(product.id)}
                        onToggle={() => toggleFavorite({ id: product.id, name: product.name, image: product.image })}
                      />
                    </div>

                    {/* Cart quantity badge */}
                    {cartQty > 0 && (
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', padding: '3px 8px', background: 'var(--mario-green)', borderRadius: '6px', color: '#0f0f1a', fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-arcade)' }}>
                        🛒 {cartQty}
                      </div>
                    )}

                    {!available && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ padding: '6px 14px', background: 'rgba(230,57,70,0.15)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '5px', color: 'var(--mario-red)', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-arcade)' }}>
                          {product.inventory === 'Out of Stock' ? 'OUT OF STOCK' : 'DWCL ONLY'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <h3 style={{ color: 'var(--mario-text)', fontSize: '13px', fontWeight: 700 }}>{product.name}</h3>
                      <span style={{
                        fontSize: '8px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                        background: product.inventory === 'In Stock' ? 'rgba(6,214,160,0.1)' : 'rgba(251,133,0,0.1)',
                        color: product.inventory === 'In Stock' ? 'var(--mario-green)' : 'var(--mario-orange)',
                        border: `1px solid ${product.inventory === 'In Stock' ? 'rgba(6,214,160,0.25)' : 'rgba(251,133,0,0.25)'}`,
                      }}>
                        {product.inventory}
                      </span>
                    </div>

                    {/* Rating */}
                    {meta && <StarRating rating={meta.rating} reviews={meta.reviews} />}

                    <p style={{ color: 'var(--mario-text-muted)', fontSize: '11px', margin: '6px 0' }}>{product.description}</p>

                    {/* Tags */}
                    {meta?.tags && (
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {meta.tags.map(tag => (
                          <span key={tag} style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--mario-text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Price range */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontFamily: 'var(--font-arcade)', color: 'var(--mario-yellow)', fontSize: '13px', fontWeight: 700 }}>
                        ₱{Math.min(...product.variants.map(v => v.price))}
                        {product.variants.length > 1 && <span style={{ fontSize: '9px', color: 'var(--mario-text-muted)', fontFamily: 'var(--font-body)' }}> — ₱{Math.max(...product.variants.map(v => v.price))}</span>}
                      </span>
                    </div>

                    {/* Quick Add with Quantity */}
                    {available ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden' }}>
                          <button onClick={() => updateQuickQty(product.id, -1)} style={{ width: '32px', height: '34px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--mario-red)', fontSize: '14px', cursor: 'pointer', fontWeight: 700 }}>−</button>
                          <span style={{ width: '28px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: 'var(--mario-text)' }}>{quickAddQty[product.id] || 1}</span>
                          <button onClick={() => updateQuickQty(product.id, 1)} style={{ width: '32px', height: '34px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--mario-green)', fontSize: '14px', cursor: 'pointer', fontWeight: 700 }}>+</button>
                        </div>
                        {product.variants.length > 1 ? (
                          <button
                            onClick={() => openVariantModal(product)}
                            style={{
                              flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--mario-yellow-dark, rgba(255,214,10,0.3))',
                              background: 'rgba(255,214,10,0.12)', color: 'var(--mario-yellow)', fontSize: '10px', fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'var(--font-arcade)', boxShadow: '0 2px 0 rgba(255,214,10,0.2)',
                              transition: 'all 0.15s',
                            }}>
                            🛒 CHOOSE & ADD
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (!isLoggedIn) { setShowLoginPrompt(true); return; }
                              addToCart(product, product.variants[0].id, quickAddQty[product.id] || 1);
                            }}
                            style={{
                              flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--mario-green-dark)',
                              background: 'rgba(6,214,160,0.15)', color: 'var(--mario-green)', fontSize: '10px', fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'var(--font-arcade)', boxShadow: '0 2px 0 var(--mario-green-dark)',
                              transition: 'all 0.15s',
                            }}>
                            🛒 ADD
                          </button>
                        )}
                      </div>
                    ) : (
                      <button disabled style={{
                        width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.03)', color: 'var(--mario-text-muted)', fontSize: '10px', fontWeight: 600,
                        cursor: 'not-allowed', fontFamily: 'var(--font-arcade)', opacity: 0.4,
                      }}>
                        NOT AVAILABLE
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Product Detail Modal ──────────────────────── */}
      {showDetailModal && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(null)}>
          <div className="modal-card" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ justifyContent: 'space-between', paddingRight: '16px' }}>
              <span>{showDetailModal.name.toUpperCase()}</span>
              <button onClick={() => setShowDetailModal(null)} style={{ background: 'none', border: 'none', color: 'var(--mario-text-muted)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ padding: '20px' }}>
              {/* Big image */}
              <div style={{ position: 'relative', width: '100%', height: '200px', background: 'var(--mario-bg)', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden' }}>
                <Image src={showDetailModal.image} alt={showDetailModal.name} fill className="object-contain p-4" />
              </div>

              {/* Rating + Tags */}
              {productMeta[showDetailModal.id] && (
                <div style={{ marginBottom: '12px' }}>
                  <StarRating rating={productMeta[showDetailModal.id].rating} reviews={productMeta[showDetailModal.id].reviews} />
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {productMeta[showDetailModal.id].tags.map(tag => (
                      <span key={tag} style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(255,214,10,0.08)', color: 'var(--mario-yellow)', border: '1px solid rgba(255,214,10,0.2)' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              <p style={{ fontSize: '13px', color: 'var(--mario-text)', lineHeight: 1.5, marginBottom: '16px' }}>{showDetailModal.description}</p>

              {/* All variants with prices */}
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--mario-text-muted)', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'var(--font-arcade)' }}>Available Options</p>
                {showDetailModal.variants.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--mario-text)' }}>{v.name}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--mario-yellow)' }}>₱{v.price}</span>
                  </div>
                ))}
              </div>

              {/* Add to cart */}
              <button
                onClick={() => {
                  if (!isLoggedIn) { setShowLoginPrompt(true); setShowDetailModal(null); return; }
                  addToCart(showDetailModal, showDetailModal.variants[0].id, quickAddQty[showDetailModal.id] || 1);
                  setShowDetailModal(null);
                }}
                disabled={!isProductAvailable(showDetailModal)}
                style={{
                  width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--mario-green-dark)',
                  background: isProductAvailable(showDetailModal) ? 'var(--mario-green)' : 'rgba(255,255,255,0.05)',
                  color: isProductAvailable(showDetailModal) ? '#0f0f1a' : 'var(--mario-text-muted)',
                  fontSize: '12px', fontWeight: 700, cursor: isProductAvailable(showDetailModal) ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-arcade)', boxShadow: '0 3px 0 var(--mario-green-dark)',
                }}>
                {isProductAvailable(showDetailModal) ? `+ ADD TO CART — ₱${showDetailModal.variants[0].price}` : 'NOT AVAILABLE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Variant Modal ─────────────────────────────── */}
      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">SELECT VARIANT</div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginBottom: '12px' }}>{selectedProduct.name}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedProduct.variants.map((variant) => (
                  <label key={variant.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px',
                    background: selectedVariantId === variant.id ? 'rgba(255,214,10,0.08)' : 'var(--mario-bg-input)',
                    border: selectedVariantId === variant.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input type="radio" name="variant" value={variant.id} checked={selectedVariantId === variant.id} onChange={(e) => setSelectedVariantId(e.target.value)} style={{ accentColor: 'var(--mario-yellow)' }} />
                      <span style={{ fontSize: '12px', color: 'var(--mario-text)', fontWeight: 600 }}>{variant.name}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--mario-yellow)', fontWeight: 700 }}>₱{variant.price}</span>
                  </label>
                ))}
              </div>

              {/* Quantity in modal */}
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>Quantity:</span>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden' }}>
                  <button type="button" onClick={() => updateQuickQty(selectedProduct.id, -1)} style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--mario-red)', fontSize: '14px', cursor: 'pointer', fontWeight: 700 }}>−</button>
                  <span style={{ width: '36px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--mario-text)' }}>{quickAddQty[selectedProduct.id] || 1}</span>
                  <button type="button" onClick={() => updateQuickQty(selectedProduct.id, 1)} style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--mario-green)', fontSize: '14px', cursor: 'pointer', fontWeight: 700 }}>+</button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button type="button" onClick={() => setSelectedProduct(null)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--mario-text-muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={confirmVariant} style={{ flex: 1, padding: '10px', background: 'rgba(6,214,160,0.15)', border: '1px solid rgba(6,214,160,0.3)', borderRadius: '8px', color: 'var(--mario-green)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-arcade)' }}>
                  Add {quickAddQty[selectedProduct.id] || 1}x
                </button>
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
              <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginBottom: '16px' }}>Sign in to add items to your cart!</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Link href="/login" style={{ display: 'block', padding: '10px', background: 'rgba(255,214,10,0.15)', border: '1px solid rgba(255,214,10,0.3)', borderRadius: '8px', color: 'var(--mario-yellow)', fontSize: '11px', fontWeight: 600, textDecoration: 'none', textAlign: 'center', fontFamily: 'var(--font-arcade)' }} onClick={() => setShowLoginPrompt(false)}>LOG IN</Link>
                <Link href="/signup" style={{ display: 'block', padding: '10px', background: 'rgba(6,214,160,0.15)', border: '1px solid rgba(6,214,160,0.3)', borderRadius: '8px', color: 'var(--mario-green)', fontSize: '11px', fontWeight: 600, textDecoration: 'none', textAlign: 'center', fontFamily: 'var(--font-arcade)' }} onClick={() => setShowLoginPrompt(false)}>CREATE ACCOUNT</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Floating Cart Button ─────────────────────── */}
      {cartItems.length > 0 && (
        <div style={{ position: 'fixed', bottom: '72px', right: '24px', zIndex: 40 }}>
          <button onClick={handleCheckout} style={{
            padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--mario-green-dark)',
            background: 'var(--mario-green)', color: '#0f0f1a', fontSize: '12px', fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 0 var(--mario-green-dark), 0 8px 32px rgba(0,0,0,0.3)', fontFamily: 'var(--font-arcade)',
            transition: 'all 0.15s',
          }}>
            🛒 Cart ({totalItems}) — ₱{totalPrice}
          </button>
        </div>
      )}

      <style jsx>{`
        .product-card {
          background: var(--mario-bg-card);
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          overflow: hidden;
          transition: all 0.2s;
          backdrop-filter: blur(16px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        }
        .product-card:hover {
          border-color: rgba(255,214,10,0.3);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 20px rgba(255,214,10,0.1);
          transform: translateY(-2px);
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
          backdrop-filter: blur(4px);
        }
        .modal-card {
          background: var(--mario-bg-card);
          border-radius: 16px;
          width: 100%;
          max-width: 400px;
          border: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(16px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.3);
          overflow: hidden;
          max-height: 90vh;
          overflow-y: auto;
        }
        .modal-title {
          width: 100%;
          height: 42px;
          display: flex;
          align-items: center;
          padding-left: 20px;
          border-bottom: 1px solid rgba(255,214,10,0.15);
          background: rgba(255,214,10,0.06);
          font-weight: 700;
          font-size: 11px;
          color: var(--mario-yellow);
          font-family: var(--font-arcade);
        }
      `}</style>
    </main>
  );
}
