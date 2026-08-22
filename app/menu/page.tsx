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
  const isDaraga = location === 'Daraga';

  const filteredProducts = useMemo(() => {
    let result = activeCategory === 'All' ? [...products] : products.filter((p) => p.category === activeCategory);
    return result;
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
    <main className="mario-bg min-h-screen">
      <NavBar cartCount={totalItems} />
      <section className="px-4 py-10 sm:px-8">
        <div className="mario-container">
          <div className="mb-8">
            <h1 className="mario-title text-2xl sm:text-3xl lg:text-4xl">
              Choose Your Power-Up
            </h1>
            <p className="mario-subtitle mt-3">Pick your favorites from our legendary selection.</p>
          </div>

          {restrictionMessage && (
            <div className="mb-6 mario-card border-mario-red bg-mario-red/10 p-4 text-sm text-mario-red font-arcade text-xs">
              ⚠ {restrictionMessage}
            </div>
          )}

          {/* Category Tabs — no search bar */}
          <div className="flex flex-wrap gap-3 mb-8">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`mario-btn text-xs ${activeCategory === cat ? 'mario-btn-primary' : 'mario-btn-secondary'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Zone Selector */}
          <div className="mb-8">
            <label className="mario-label">Select Delivery / Pickup Zone</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as ZoneKey)}
              className="mario-select max-w-md"
            >
              {deliveryZones.map((zone) => (
                <option key={zone.code} value={zone.code}>{zone.label}</option>
              ))}
            </select>
            {!isDwcl && (
              <div className="mt-3 mario-card border-mario-orange bg-mario-orange/10 p-3">
                <p className="mario-text-sm text-mario-orange font-arcade">⚠ Cookies & Coffee Jelly are DWCL pickup only!</p>
              </div>
            )}
          </div>

          {/* Delivery Info */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="mario-card border-mario-green p-4 text-center">
              <span className="text-2xl">🎓</span>
              <p className="mario-label text-mario-green mt-2">DWCL Pickup</p>
              <p className="mario-text-xs text-mario-brown mt-1">Free · All items</p>
            </div>
            <div className="mario-card border-mario-blue p-4 text-center">
              <span className="text-2xl">📍</span>
              <p className="mario-label text-mario-blue mt-2">Daraga / Legazpi</p>
              <p className="mario-text-xs text-mario-brown mt-1">₱30 delivery · Free 200+</p>
            </div>
            <div className="mario-card border-mario-orange p-4 text-center">
              <span className="text-2xl">📬</span>
              <p className="mario-label text-mario-orange mt-2">Custom Delivery</p>
              <p className="mario-text-xs text-mario-brown mt-1">Within the day · Mon-Fri · Sun</p>
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filteredProducts.map((product) => {
              const available = isProductAvailable(product);
              return (
                <div key={product.id} className={`mario-card group ${!available ? 'opacity-50' : ''}`}>
                  <div className="relative h-48 bg-mario-sky-light border-b-4 border-mario-wood overflow-hidden rounded-t-lg">
                    <Image src={product.image} alt={product.name} fill className="object-contain p-3 transition-transform group-hover:scale-110 duration-300" />
                    {!available && (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                        <span className="mario-btn mario-btn-red text-xs">
                          {product.inventory === 'Out of Stock' ? 'OUT OF STOCK' : 'DWCL ONLY'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <h3 className="mario-text-sm font-arcade">{product.name}</h3>
                      <span className={`mario-badge ${product.inventory === 'In Stock' ? 'mario-badge-green' : 'mario-badge-orange'}`}>
                        {product.inventory}
                      </span>
                    </div>
                    <p className="mario-text-xs text-mario-brown mb-4">{product.description}</p>
                    <div className="space-y-2 mb-5">
                      {product.variants.map((variant) => (
                        <div key={variant.id} className="flex items-center justify-between text-sm">
                          <span className="mario-text-xs">{variant.name}</span>
                          <span className="mario-price">₱{variant.price}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => openVariantModal(product)}
                      disabled={!available}
                      className={`w-full mario-btn ${available ? 'mario-btn-primary' : 'mario-btn-secondary opacity-50 cursor-not-allowed'}`}
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

      {/* Variant Modal */}
      {selectedProduct && (
        <div className="mario-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="mario-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mario-modal-header">
              <h2 className="mario-text-sm font-arcade">Select Variant</h2>
              <p className="mario-text-xs text-mario-brown mt-1">{selectedProduct.name}</p>
            </div>
            <div className="mario-modal-body space-y-3">
              {selectedProduct.variants.map((variant) => (
                <label
                  key={variant.id}
                  className={`flex items-center justify-between p-4 mario-card cursor-pointer ${
                    selectedVariantId === variant.id
                      ? 'border-mario-yellow bg-mario-yellow/10'
                      : 'border-mario-wood-light hover:border-mario-wood'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input type="radio" name="variant" value={variant.id} checked={selectedVariantId === variant.id} onChange={(e) => setSelectedVariantId(e.target.value)} className="accent-mario-yellow" />
                    <span className="mario-text-xs">{variant.name}</span>
                  </div>
                  <span className="mario-price">₱{variant.price}</span>
                </label>
              ))}
            </div>
            <div className="mario-modal-footer flex gap-3">
              <button type="button" onClick={() => setSelectedProduct(null)} className="mario-btn mario-btn-secondary flex-1">Cancel</button>
              <button type="button" onClick={confirmVariant} className="mario-btn mario-btn-primary flex-1">Add to Cart</button>
            </div>
          </div>
        </div>
      )}

      {/* Login Prompt */}
      {showLoginPrompt && (
        <div className="mario-overlay" onClick={() => setShowLoginPrompt(false)}>
          <div className="mario-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mario-modal-header">
              <h2 className="mario-text-sm font-arcade">Login Required</h2>
            </div>
            <div className="mario-modal-body text-center">
              <p className="mario-text-xs text-mario-brown mb-6">You must sign in to add items to cart!</p>
              <div className="space-y-3">
                <Link href="/login" className="mario-btn mario-btn-red w-full" onClick={() => setShowLoginPrompt(false)}>LOG IN</Link>
                <Link href="/signup" className="mario-btn mario-btn-primary w-full" onClick={() => setShowLoginPrompt(false)}>CREATE ACCOUNT</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Cart */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40">
          <button onClick={handleCheckout} className="mario-btn mario-btn-primary mario-btn-lg mario-pulse">
            🛒 Cart ({totalItems}) — ₱{totalPrice}
          </button>
        </div>
      )}
    </main>
  );
}
