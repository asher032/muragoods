'use client';

import { useState, useEffect, useMemo } from 'react';
import { products as staticProducts, type Product, type CartItem, dwclOnlyProducts, deliveryZones, type ZoneKey } from '@/app/lib/muragoods-data';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useProducts } from '@/app/hooks/useProducts';

const categories = ["All", "Musubi & Churros", "Coffee Jelly & Cookies"];

export default function MenuPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("All");
  const [location, setLocation] = useState<ZoneKey>("DWCL");
  const [cart, setCart] = useState<Record<string, { quantity: number; variantId?: string }>>({});
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [restrictionMessage, setRestrictionMessage] = useState("");
  const { products } = useProducts();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      setIsLoggedIn(true);
    }

    try {
      const savedCart = localStorage.getItem('cart');
      if (savedCart) {
        setCart(JSON.parse(savedCart));
      }
    } catch {
      setCart({});
    }
  }, []);

  const filteredProducts = useMemo(() => {
    if (activeCategory === "All") return products;
    return products.filter(p => p.category === activeCategory);
  }, [activeCategory, products]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([, data]) => data.quantity > 0)
      .map(([cartKey, data]) => {
        const productId = cartKey.split('__')[0];
        const product = products.find(p => p.id === productId) || staticProducts.find(p => p.id === productId);
        if (!product) return null;
        const variantId = cartKey.split('__')[1] || data.variantId || product.variants[0].id;
        const variant = product.variants.find(v => v.id === variantId);
        return {
          ...product,
          quantity: data.quantity,
          selectedVariant: variant || product.variants[0],
        } as CartItem;
      })
      .filter((item): item is CartItem => item !== null);
  }, [cart, products]);

  const isDwcl = location === "DWCL";

  const isProductAvailable = (product: Product) => {
    if (product.inventory === "Out of Stock") {
      return false;
    }
    if (!isDwcl && dwclOnlyProducts.includes(product.id)) {
      return false;
    }
    return true;
  };

  const addToCart = (product: Product, variantId?: string) => {
    if (!isProductAvailable(product)) {
      setRestrictionMessage("This item is only available for DWCL pickup.");
      setTimeout(() => setRestrictionMessage(""), 3000);
      return;
    }

    const actualVariantId = variantId || product.variants[0].id;
    const cartKey = `${product.id}__${actualVariantId}`;

    setCart(prev => {
      const next = {
        ...prev,
        [cartKey]: {
          quantity: (prev[cartKey]?.quantity || 0) + 1,
          variantId: actualVariantId,
        }
      };
      localStorage.setItem('cart', JSON.stringify(next));
      return next;
    });
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
    if (!isProductAvailable(product)) {
      setRestrictionMessage("This item is only available for DWCL pickup.");
      setTimeout(() => setRestrictionMessage(""), 3000);
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
    <main className="min-h-screen" style={{ backgroundImage: 'url(/images/background3.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b-4 border-black shadow-lg transition-all">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-10 w-10 rounded-full border-4 border-black overflow-hidden shadow-[4px_4px_0px_0px_#000] transition-transform group-hover:scale-105">
              <Image src="/images/muragoods-logo.png" alt="Muragoods Logo" fill className="object-cover" />
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
              className="mario-btn hover:scale-105 transition-transform"
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
            <h1 className="text-4xl sm:text-5xl font-black text-white uppercase tracking-tighter" style={{ textShadow: '5px 5px 0px #000' }}>Choose Your Power-Up</h1>
            <p className="mt-2 text-lg font-black text-yellow-300" style={{ textShadow: '2px 2px 0px #000' }}>Pick your favorites from our legendary selection.</p>
          </div>

          {restrictionMessage && (
            <div className="mb-6 rounded-xl border-4 border-rose-400 bg-rose-50 p-4 text-sm font-black text-rose-600 uppercase shadow-lg">
              {restrictionMessage}
            </div>
          )}

          <div className="flex flex-wrap gap-3 mb-8">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`mario-btn ${activeCategory === cat ? 'mario-btn-yellow' : 'bg-white text-black hover:scale-105'} transition-all`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="mb-8">
            <label className="block text-sm font-black text-white uppercase mb-2">Select Delivery / Pickup Zone</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as ZoneKey)}
              className="w-full max-w-md rounded-xl border-4 border-black bg-white px-4 py-3 font-black text-black outline-none focus:border-yellow-300 focus:ring-4 focus:ring-yellow-200 transition-all shadow-md"
            >
              {deliveryZones.map(zone => (
                <option key={zone.code} value={zone.code}>{zone.label}</option>
              ))}
            </select>
            {!isDwcl && (
              <p className="mt-2 text-sm font-black text-yellow-300">Notice: Coffee Jelly and Cookies are available exclusively for DWCL pickup.</p>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filteredProducts.map((product) => {
              const available = isProductAvailable(product);
              return (
                <div
                  key={product.id}
                  className={`menu-card group ${!available ? 'opacity-60' : ''}`}
                >
                  <div className="h-48 bg-gradient-to-br from-blue-400 to-blue-500 p-4 border-b-4 border-black group-hover:from-blue-300 group-hover:to-blue-400 transition-all relative overflow-hidden">
                    <Image src={product.image} alt={product.name} fill className="object-contain p-2 transition-transform group-hover:scale-110 duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                    {!available && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                        <span className="bg-gradient-to-r from-yellow-300 to-yellow-400 text-black px-4 py-2 font-black text-sm uppercase border-4 border-black rotate-[-3deg] shadow-lg">
                          {product.inventory === "Out of Stock" ? 'Out of Stock' : 'DWCL Only'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-6 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-2xl font-black text-black uppercase">{product.name}</h3>
                      <span className="text-xs font-black uppercase tracking-wider text-rose-500 bg-rose-100 px-2 py-1 border-2 border-black shadow-sm">
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
                      className={`w-full mario-btn ${available ? 'mario-btn-yellow hover:scale-105' : 'bg-gray-300 text-gray-500 cursor-not-allowed'} transition-all`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedProduct(null)}>
          <div className="mario-card max-w-md w-full animate-bounce-in" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-rose-400 to-rose-500 p-6 border-b-4 border-black">
              <h2 className="text-2xl font-black text-white uppercase">Select Variant</h2>
              <p className="text-sm font-bold text-yellow-300">{selectedProduct.name}</p>
            </div>
            <div className="p-6 bg-white space-y-4">
              {selectedProduct.variants.map(variant => (
                <label
                  key={variant.id}
                  className={`flex items-center justify-between p-4 border-4 border-black rounded-xl cursor-pointer transition-all hover:shadow-md ${
                    selectedVariantId === variant.id ? 'bg-gradient-to-r from-yellow-300 to-yellow-400 shadow-lg' : 'bg-yellow-50 hover:bg-yellow-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="variant"
                      value={variant.id}
                      checked={selectedVariantId === variant.id}
                      onChange={(e) => setSelectedVariantId(e.target.value)}
                      className="w-5 h-5 accent-yellow-500"
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
                  className="flex-1 mario-btn bg-white text-black border-black hover:scale-105 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmVariant}
                  className="flex-1 mario-btn mario-btn-yellow hover:scale-105 transition-all"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLoginPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowLoginPrompt(false)}>
          <div className="mario-card max-w-md w-full animate-bounce-in" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-black to-gray-900 p-6 border-b-4 border-black">
              <h2 className="text-2xl font-black text-yellow-300 uppercase">Login Required</h2>
            </div>
            <div className="p-6 bg-white text-center">
              <p className="text-lg font-black text-black mb-6">You must sign in to add items to cart!</p>
              <div className="space-y-3">
                <Link href="/login" className="mario-btn w-full bg-rose-400 text-white hover:scale-105 transition-all">
                  LOG IN
                </Link>
                <Link href="/signup" className="mario-btn w-full mario-btn-yellow hover:scale-105 transition-all">
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
            className="mario-btn mario-btn-yellow text-lg shadow-2xl hover:scale-105 transition-all"
            style={{ borderRadius: '16px', padding: '16px 32px' }}
          >
            View Cart ({totalItems}) - ₱{totalPrice}
          </button>
        </div>
      )}
    </main>
  );
}
