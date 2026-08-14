'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { products, type Product, type CartItem, dwclOnlyProducts } from '@/app/lib/muragoods-data';
import { useRouter } from 'next/navigation';

const categories = ["All", "Musubi & Churros", "Coffee Jelly & Cookies"];

export default function MenuPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("All");
  const [cart, setCart] = useState<Record<string, { quantity: number; variantId?: string }>>({});
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoggedIn(true);
    }
  }, []);

  const filteredProducts = useMemo(() => {
    if (activeCategory === "All") return products;
    return products.filter(p => p.category === activeCategory);
  }, [activeCategory]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([, data]) => data.quantity > 0)
      .map(([productId, data]) => {
        const product = products.find(p => p.id === productId)!;
        const variant = product.variants.find(v => v.id === (data.variantId || product.variants[0].id));
        return {
          ...product,
          quantity: data.quantity,
          selectedVariant: variant,
        } as CartItem;
      });
  }, [cart]);

  const isDwcl = true;

  const addToCart = (product: Product, variantId?: string) => {
    const key = product.id;
    setCart(prev => ({
      ...prev,
      [key]: {
        quantity: (prev[key]?.quantity || 0) + 1,
        variantId: variantId || prev[key]?.variantId || product.variants[0].id,
      }
    }));
    setSelectedProduct(null);
    setSelectedVariantId("");
  };

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cartItems.reduce((sum, item) => sum + (item.selectedVariant?.price || 0) * item.quantity, 0);

  const handleCheckout = () => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true);
      return;
    }
    if (cartItems.length === 0) return;
    router.push('/checkout');
  };

  const openVariantModal = (product: Product) => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true);
      return;
    }
    setSelectedProduct(product);
    setSelectedVariantId(product.variants[0].id);
  };

  const confirmVariant = () => {
    if (selectedProduct) {
      addToCart(selectedProduct, selectedVariantId);
    }
  };

  return (
    <main className="min-h-screen" style={{ background: 'linear-gradient(180deg, #E60012 0%, #c2000e 100%)' }}>
      <nav className="sticky top-0 z-50 bg-white border-b-4 border-black shadow-[0_4px_0px_0px_#000]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-full border-4 border-black bg-rose-400 flex items-center justify-center shadow-[4px_4px_0px_0px_#000] logo-badge">
              <span className="text-lg">🍙</span>
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-rose-500">Muragoods</p>
              <p className="text-xs font-bold uppercase tracking-widest text-black">Menu</p>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-3 text-xs font-black uppercase">
            <Link href="/menu" className="mario-btn mario-btn-blue">Menu</Link>
            <Link href="/orders" className="mario-btn mario-btn-yellow">Orders</Link>
            <button
              onClick={() => {
                if (!isLoggedIn) {
                  router.push('/login');
                  return;
                }
                router.push('/checkout');
              }}
              className="mario-btn"
            >
              Cart ({totalItems})
            </button>
            {isLoggedIn ? (
              <button onClick={() => { localStorage.removeItem('user'); window.location.reload(); }} className="mario-btn bg-black text-white">Logout</button>
            ) : (
              <Link href="/login" className="mario-btn bg-black text-white">Login</Link>
            )}
          </div>
        </div>
      </nav>

      <section className="px-4 py-12 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-5xl font-black text-white uppercase tracking-tighter" style={{ textShadow: '6px 6px 0px #000' }}>Choose Your Power-Up</h1>
            <p className="mt-2 text-lg font-black text-yellow-300" style={{ textShadow: '2px 2px 0px #000' }}>Pick your favorites from our legendary selection.</p>
          </div>

          <div className="flex flex-wrap gap-4 mb-8">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`mario-btn ${activeCategory === cat ? 'mario-btn-yellow' : 'bg-white text-black'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const available = isDwcl || !dwclOnlyProducts.includes(product.id);
              return (
                <div
                  key={product.id}
                  className={`menu-card group ${!available ? 'opacity-60' : ''}`}
                >
                  <div className="h-48 bg-blue-400 p-6 flex items-center justify-center text-8xl border-b-4 border-black group-hover:bg-blue-300 transition-colors relative overflow-hidden">
                    <span className="coin-float relative z-10">{product.icon}</span>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                    {!available && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                        <span className="bg-yellow-400 text-black px-4 py-2 font-black text-sm uppercase border-4 border-black rotate-[-3deg]">
                          DWCL Only
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-6 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-2xl font-black text-black uppercase">{product.name}</h3>
                      <span className="text-xs font-black uppercase tracking-wider text-rose-500 bg-rose-100 px-2 py-1 border-2 border-black">
                        {product.inventory}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-700 h-12 overflow-hidden mb-4">{product.description}</p>

                    <div className="space-y-2 mb-4">
                      {product.variants.map(variant => (
                        <div key={variant.id} className="flex items-center justify-between text-sm">
                          <span className="font-bold text-black">{variant.name}</span>
                          <span className="font-black text-rose-500">₱{variant.price}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => openVariantModal(product)}
                      disabled={!available}
                      className={`w-full mario-btn ${available ? 'mario-btn-yellow' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
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

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedProduct(null)}>
          <div className="mario-card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-rose-400 p-6 border-b-4 border-black">
              <h2 className="text-2xl font-black text-white uppercase">Select Variant</h2>
              <p className="text-sm font-bold text-yellow-300">{selectedProduct.name}</p>
            </div>
            <div className="p-6 bg-white space-y-4">
              {selectedProduct.variants.map(variant => (
                <label
                  key={variant.id}
                  className={`flex items-center justify-between p-4 border-4 border-black rounded-lg cursor-pointer transition-colors ${
                    selectedVariantId === variant.id ? 'bg-yellow-400' : 'bg-yellow-50 hover:bg-yellow-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="variant"
                      value={variant.id}
                      checked={selectedVariantId === variant.id}
                      onChange={(e) => setSelectedVariantId(e.target.value)}
                      className="w-5 h-5"
                    />
                    <span className="font-black text-black">{variant.name}</span>
                  </div>
                  <span className="font-black text-rose-500 text-lg">₱{variant.price}</span>
                </label>
              ))}
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="flex-1 mario-btn bg-white text-black border-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmVariant}
                  className="flex-1 mario-btn mario-btn-yellow"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLoginPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowLoginPrompt(false)}>
          <div className="mario-card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-black p-6 border-b-4 border-black">
              <h2 className="text-2xl font-black text-yellow-300 uppercase">Login Required</h2>
            </div>
            <div className="p-6 bg-white text-center">
              <p className="text-lg font-black text-black mb-6">You must sign in to add items to cart!</p>
              <div className="space-y-3">
                <Link href="/login" className="mario-btn w-full bg-rose-400 text-white">
                  LOG IN
                </Link>
                <Link href="/signup" className="mario-btn w-full mario-btn-yellow">
                  CREATE ACCOUNT
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {cartItems.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40">
          <button
            onClick={handleCheckout}
            className="mario-btn mario-btn-yellow text-lg shadow-2xl"
            style={{ borderRadius: '16px', padding: '16px 32px' }}
          >
            🛒 View Cart ({totalItems}) - ₱{totalPrice}
          </button>
        </div>
      )}
    </main>
  );
}
