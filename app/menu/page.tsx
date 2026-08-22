'use client';

import { useState, useEffect, useMemo } from 'react';
import { products as staticProducts, type Product, type CartItem, dwclOnlyProducts, deliveryZones, type ZoneKey } from '@/app/lib/muragoods-data';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useProducts } from '@/app/hooks/useProducts';
import { PixelDivider } from '@/app/components/PixelDivider';
import { NavBar } from '@/app/components/NavBar';

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
    } catch {
      setCart({});
    }
  }, []);

  const filteredProducts = useMemo(() => {
    if (activeCategory === 'All') return products;
    return products.filter((p) => p.category === activeCategory);
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

  const isDwcl = location === 'DWCL';

  const isProductAvailable = (product: Product) => {
    if (product.inventory === 'Out of Stock') return false;
    if (!isDwcl && dwclOnlyProducts.includes(product.id)) return false;
    return true;
  };

  const addToCart = (product: Product, variantId?: string) => {
    if (!isProductAvailable(product)) {
      setRestrictionMessage('This item is only available for DWCL pickup.');
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
      setRestrictionMessage('This item is only available for DWCL pickup.');
      setTimeout(() => setRestrictionMessage(''), 3000);
      return;
    }
    setSelectedProduct(product);
    setSelectedVariantId(product.variants[0].id);
  };

  const confirmVariant = () => {
    if (selectedProduct) addToCart(selectedProduct, selectedVariantId);
  };

  const getInventoryBadgeClass = (status: string) => {
    switch (status) {
      case 'In Stock': return 'deco-badge-emerald';
      case 'Pre-Order Only': return 'deco-badge-gold';
      case 'Out of Stock': return 'deco-badge-crimson';
      default: return 'deco-badge-cream';
    }
  };

  return (
    <main className="min-h-screen">
      <NavBar cartCount={totalItems} />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container">
          {/* Header */}
          <div className="mb-8">
            <h1
              className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase"
              style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}
            >
              Choose Your Power-Up
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]" style={{ fontFamily: 'var(--font-body)' }}>
              Pick your favorites from our legendary selection.
            </p>
          </div>

          {/* Restriction Alert */}
          {restrictionMessage && (
            <div className="mb-6 border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-4 text-sm text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
              ⚠ {restrictionMessage}
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-3 mb-8">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`deco-btn deco-btn-sm ${activeCategory === cat ? 'deco-btn-gold' : 'deco-btn-ghost'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Zone Selector */}
          <div className="mb-8">
            <label
              className="block text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-3"
              style={{ fontFamily: 'var(--font-arcade)' }}
            >
              Select Delivery / Pickup Zone
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as ZoneKey)}
              className="deco-select max-w-md"
            >
              {deliveryZones.map((zone) => (
                <option key={zone.code} value={zone.code}>
                  {zone.label}
                </option>
              ))}
            </select>
            {!isDwcl && (
              <p className="mt-2 text-sm text-[var(--gold-bright)]">
                Notice: Coffee Jelly and Cookies are available exclusively for DWCL pickup.
              </p>
            )}
          </div>

          <PixelDivider variant="questionBlocks" />

          {/* Delivery Options Notice */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.08)] rounded-xl p-4 text-center">
              <span className="text-xl">🎓</span>
              <p className="text-[9px] text-[var(--gold-bright)] uppercase mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>DWCL Pickup</p>
              <p className="text-[8px] text-[var(--pewter)] mt-1">Free · All items</p>
            </div>
            <div className="border-2 border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.1)] rounded-xl p-4 text-center">
              <span className="text-xl">📍</span>
              <p className="text-[9px] text-[var(--emerald-bright)] uppercase mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>Daraga / Legazpi</p>
              <p className="text-[8px] text-[var(--pewter)] mt-1">₱30 delivery · Free 200+</p>
            </div>
            <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.08)] rounded-xl p-4 text-center">
              <span className="text-xl">📬</span>
              <p className="text-[9px] text-[var(--gold-bright)] uppercase mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>Custom Delivery</p>
              <p className="text-[8px] text-[var(--pewter)] mt-1">Within the day · Mon-Fri · Sun</p>
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filteredProducts.map((product) => {
              const available = isProductAvailable(product);
              return (
                <div key={product.id} className={`power-card group ${!available ? 'opacity-50' : ''}`}>
                  {/* Image Area */}
                  <div className="relative h-48 bg-[var(--charcoal-light)] border-b-2 border-[rgba(212,175,55,0.2)] overflow-hidden">
                    <Image src={product.image} alt={product.name} fill className="object-contain p-3 transition-transform group-hover:scale-110 duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--obsidian)] via-transparent to-transparent opacity-40" />

                    {/* Inventory overlay */}
                    {!available && (
                      <div className="absolute inset-0 bg-[rgba(10,10,10,0.8)] flex items-center justify-center z-20">
                        <span
                          className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.2)] text-[var(--crimson)] px-4 py-2 uppercase"
                          style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px' }}
                        >
                          {product.inventory === 'Out of Stock' ? 'OUT OF STOCK' : 'DWCL ONLY'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <h3
                        className="text-[11px] text-[var(--cream)] uppercase leading-tight"
                        style={{ fontFamily: 'var(--font-arcade)' }}
                      >
                        {product.name}
                      </h3>
                      <span className={`deco-badge ${getInventoryBadgeClass(product.inventory)} shrink-0`} style={{ fontSize: '7px', padding: '3px 8px' }}>
                        {product.inventory}
                      </span>
                    </div>

                    <p className="text-sm text-[var(--pewter)] mb-4 leading-relaxed line-clamp-2">
                      {product.description}
                    </p>

                    {/* Variants & Prices */}
                    <div className="space-y-2 mb-5">
                      {product.variants.map((variant) => (
                        <div key={variant.id} className="flex items-center justify-between text-sm">
                          <span className="text-[var(--cream-muted)]">{variant.name}</span>
                          <span className="coin-price text-xs">₱{variant.price}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => openVariantModal(product)}
                      disabled={!available}
                      className={`w-full deco-btn ${available ? 'deco-btn-gold' : 'deco-btn-dark opacity-50 cursor-not-allowed'}`}
                      style={{ minHeight: '48px' }}
                    >
                      {available ? '+ ADD TO CART' : 'NOT AVAILABLE'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Divider: Brick Row ─────────────────────────────── */}
      <div className="px-4 sm:px-8">
        <div className="deco-container">
          <PixelDivider variant="brickRow" />
        </div>
      </div>

      {/* ─── Variant Selection Modal ─────────────────────────── */}
      {selectedProduct && (
        <div className="deco-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="deco-modal bounce-in" onClick={(e) => e.stopPropagation()}>
            <div className="deco-modal-header">
              <h2
                className="text-sm text-[var(--gold-bright)] uppercase"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Select Variant
              </h2>
              <p className="mt-1 text-sm text-[var(--pewter)]">{selectedProduct.name}</p>
            </div>

            <div className="deco-modal-body space-y-3">
              {selectedProduct.variants.map((variant) => (
                <label
                  key={variant.id}
                  className={`flex items-center justify-between p-4 border-2 cursor-pointer transition-all ${
                    selectedVariantId === variant.id
                      ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.1)]'
                      : 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] hover:border-[rgba(242,240,228,0.25)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="variant"
                      value={variant.id}
                      checked={selectedVariantId === variant.id}
                      onChange={(e) => setSelectedVariantId(e.target.value)}
                      className="accent-[var(--gold)]"
                    />
                    <span className="text-sm text-[var(--cream)]">{variant.name}</span>
                  </div>
                  <span className="coin-price text-sm">₱{variant.price}</span>
                </label>
              ))}
            </div>

            <div className="deco-modal-footer flex gap-3">
              <button type="button" onClick={() => setSelectedProduct(null)} className="deco-btn flex-1">
                Cancel
              </button>
              <button type="button" onClick={confirmVariant} className="deco-btn deco-btn-gold flex-1">
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Login Prompt Modal ──────────────────────────────── */}
      {showLoginPrompt && (
        <div className="deco-overlay" onClick={() => setShowLoginPrompt(false)}>
          <div className="deco-modal bounce-in" onClick={(e) => e.stopPropagation()}>
            <div className="deco-modal-header">
              <h2
                className="text-sm text-[var(--gold-bright)] uppercase"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Login Required
              </h2>
            </div>
            <div className="deco-modal-body text-center">
              <p className="text-sm text-[var(--cream)] mb-6" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
                You must sign in to add items to cart!
              </p>
              <div className="space-y-3">
                <Link href="/login" className="deco-btn deco-btn-crimson w-full" onClick={() => setShowLoginPrompt(false)}>
                  LOG IN
                </Link>
                <Link href="/signup" className="deco-btn deco-btn-gold w-full" onClick={() => setShowLoginPrompt(false)}>
                  CREATE ACCOUNT
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Floating Cart Button ────────────────────────────── */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            onClick={handleCheckout}
            className="deco-btn deco-btn-gold deco-btn-lg pulse-glow"
          >
            🪙 Cart ({totalItems}) — ₱{totalPrice}
          </button>
        </div>
      )}
    </main>
  );
}
