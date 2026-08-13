"use client";

import { products, deliveryZones, type Product } from "@/app/lib/muragoods-data";
import { useMemo, useState } from "react";

export default function Home() {
  const [location, setLocation] = useState("DWCL");
  const [cart, setCart] = useState<Record<string, number>>({});

  const zoneInfo = useMemo(
    () => deliveryZones.find((zone) => zone.code === location) ?? deliveryZones[0],
    [location],
  );

  const cartItems = useMemo(
    () =>
      products.filter((product) => cart[product.id]).map((product) => ({
        ...product,
        quantity: cart[product.id],
      })),
    [cart],
  );

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingFee = location === "DWCL" ? 0 : 30;
  const total = subtotal + shippingFee;

  const addToCart = (product: Product) => {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
  };

  const removeFromCart = (productId: string) => {
    setCart((current) => {
      const next = { ...current };
      if (!next[productId]) return current;
      if (next[productId] <= 1) {
        delete next[productId];
      } else {
        next[productId] -= 1;
      }
      return next;
    });
  };

  const restrictedItems = ["coffee-jelly", "cookies"].filter(
    (id) => cart[id] && location !== "DWCL",
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-red-600 to-red-700">
      <section className="relative px-4 pb-12 pt-7 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <nav className="mb-8 flex flex-col gap-4 rounded-lg bg-black/90 px-6 py-4 shadow-2xl md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-yellow-300 bg-red-600 text-3xl font-black text-white shadow-lg">
                M
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-yellow-300">Muragoods</p>
                <p className="text-xs font-bold uppercase tracking-widest text-white">Mario's Food</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase">
              <a href="#menu" className="mario-btn">Menu</a>
              <a href="#shipping" className="mario-btn">Delivery</a>
              <a href="#checkout" className="mario-btn">Checkout</a>
              <a href="/login" className="mario-btn">Login</a>
              <a href="/signup" className="mario-btn bg-yellow-400 text-black hover:bg-yellow-300">Sign Up</a>
              <a href="/account/orders" className="mario-btn border-yellow-300 bg-transparent text-yellow-300">Orders</a>
            </div>
          </nav>

          <div className="diagonal-stripes relative rounded-lg p-6 shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ background: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0l40 40M40 0L0 40\' stroke=\'white\' stroke-width=\'2\'/%3E%3C/svg%3E")' }} />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="text-white">
                <div className="mb-5 inline-flex rounded-full border-4 border-yellow-300 bg-yellow-400 px-6 py-3 text-sm font-black uppercase tracking-wider text-black shadow-lg">
                  🎮 Fresh • Fast • Mario 🎮
                </div>
                <h1 className="max-w-xl text-5xl font-black leading-tight tracking-tight text-yellow-300 sm:text-6xl md:text-7xl drop-shadow-lg">
                  MURAGOODS
                </h1>
                <p className="mt-5 max-w-xl text-lg font-bold text-white drop-shadow">
                  🍙 Musubi • 🌭 Churros • ☕ Coffee Jelly • 🍪 Cookies
                </p>
                <p className="mt-3 max-w-xl text-base font-semibold text-yellow-200">
                  FREE Shipping to DWCL | ₱30 Saturday Delivery to Legazpi & Daraga!
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <a href="#menu" className="mario-btn bg-yellow-400 text-black hover:bg-yellow-300 border-black">
                    🎯 Order Now
                  </a>
                  <a href="#checkout" className="mario-btn border-yellow-400 text-yellow-300 hover:bg-red-700">
                    🛒 Checkout
                  </a>
                </div>
              </div>

              <div className="flex min-h-[420px] items-center justify-center">
                <div className="mario-card">
                  <div className="flex items-center justify-between bg-red-600 p-6">
                    <span className="rounded-full bg-yellow-400 px-4 py-2 text-xs font-black uppercase text-black shadow-lg">⭐ Popular</span>
                    <span className="rounded-full bg-yellow-400 px-4 py-2 text-xs font-black uppercase text-black shadow-lg">🔥 Fresh</span>
                  </div>
                  <div className="bg-white p-8">
                    <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-yellow-100 to-yellow-200 text-6xl shadow-lg">
                      🍙
                    </div>
                  </div>
                  <div className="bg-black px-6 py-6 text-white">
                    <p className="text-xs font-black uppercase tracking-widest text-yellow-300">Best seller</p>
                    <h3 className="mt-3 text-3xl font-black text-white">MUSUBI</h3>
                    <p className="mt-3 text-2xl font-black text-yellow-300">₱55</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="menu" className="px-4 py-12 sm:px-8 bg-red-600">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="text-sm font-black uppercase tracking-widest text-yellow-300">🎮 Menu</p>
            <h2 className="mt-3 text-5xl font-black text-white drop-shadow-lg">OUR DELICIOUS ITEMS</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {products.map((product) => (
              <div key={product.id} className="mario-card hover:scale-105 transition transform">
                <div className="h-40 bg-black/80 p-6 flex items-center justify-center text-6xl shadow-inner">
                  {product.id === "musubi" ? "🍙" : product.id === "churros" ? "🌭" : product.id === "coffee-jelly" ? "☕" : "🍪"}
                </div>

                <div className="p-6 bg-white">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-2xl font-black text-black">{product.name}</h3>
                    <span className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-black uppercase text-black">
                      {product.badge}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-slate-700">{product.description}</p>

                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-3xl font-black text-red-600">₱{product.price}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      className="mario-btn bg-black text-yellow-300 hover:bg-slate-900"
                    >
                      + Cart
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="shipping" className="diagonal-stripes px-4 py-12 text-white sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="text-sm font-black uppercase tracking-widest text-yellow-300">📍 Delivery Rules</p>
            <h2 className="mt-3 text-5xl font-black text-yellow-300 drop-shadow-lg">CHOOSE YOUR ZONE</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="mario-card bg-black">
              <div className="p-6 bg-red-600 border-b-4 border-black">
                <label className="block text-sm font-black text-yellow-300 uppercase tracking-widest">
                  Select Delivery Zone
                  <select
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    className="mt-3 w-full rounded-lg border-4 border-black bg-white px-4 py-3 text-black font-black uppercase outline-none focus:border-yellow-300"
                  >
                    {deliveryZones.map((zone) => (
                      <option key={zone.code} value={zone.code}>
                        {zone.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-5 rounded-lg bg-yellow-300 p-4 border-4 border-black">
                  <p className="text-xs font-black uppercase tracking-widest text-black">📍 Current Zone</p>
                  <p className="mt-3 text-lg font-black text-black">{zoneInfo.label}</p>
                  <p className="mt-2 text-sm font-bold text-black">{zoneInfo.note}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                { title: "🏫 DWCL", detail: "FREE Shipping • All Items" },
                { title: "🏘️ Legazpi/Daraga", detail: "₱30 Saturday • Musubi & Churros" },
                { title: "🌍 Outside", detail: "Custom Orders Available" },
              ].map((card) => (
                <div key={card.title} className="mario-card">
                  <div className="bg-red-600 p-4 border-b-4 border-black">
                    <p className="text-sm font-black text-yellow-300 uppercase tracking-widest">{card.title}</p>
                  </div>
                  <div className="bg-white p-4">
                    <p className="text-sm font-black text-black">{card.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="checkout" className="px-4 py-12 sm:px-8 bg-gradient-to-b from-red-600 to-red-700">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="mario-card">
              <div className="bg-black p-6 border-b-4 border-yellow-300">
                <h2 className="text-3xl font-black text-yellow-300 uppercase tracking-widest">🛒 Your Cart</h2>
              </div>

              <div className="bg-white p-6">
                {restrictedItems.length > 0 ? (
                  <div className="mb-4 rounded-lg border-4 border-red-600 bg-red-50 p-4 text-sm font-black text-red-700 uppercase">
                    ⚠️ Coffee Jelly & Cookies: DWCL Only!
                  </div>
                ) : null}

                {cartItems.length === 0 ? (
                  <div className="rounded-lg bg-yellow-100 p-8 text-center font-black text-slate-700 border-4 border-black">
                    🛒 Cart is empty. Add delicious items!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cartItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border-4 border-black p-4 bg-yellow-50">
                        <div>
                          <p className="text-lg font-black text-black">{item.name}</p>
                          <p className="text-sm font-bold text-slate-700">Qty {item.quantity} • ₱{item.price} each</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-black bg-red-600 text-lg font-black text-white hover:bg-red-500"
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-black text-black">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-black bg-black text-lg font-black text-yellow-300 hover:bg-slate-900"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <aside className="mario-card">
              <div className="bg-black p-6 border-b-4 border-yellow-300">
                <h3 className="text-2xl font-black text-yellow-300 uppercase tracking-widest">💰 Order Total</h3>
              </div>

              <div className="bg-white p-6">
                <div className="space-y-4 text-base font-black text-black border-b-4 border-black pb-4">
                  <div className="flex justify-between"><span>Subtotal:</span><span className="text-red-600">₱{subtotal}</span></div>
                  <div className="flex justify-between"><span>Shipping:</span><span className="text-red-600">₱{shippingFee}</span></div>
                  <div className="flex justify-between text-2xl bg-yellow-300 p-3 rounded-lg"><span>TOTAL:</span><span>₱{total}</span></div>
                </div>

                <div className="mt-6 space-y-4">
                  <label className="block text-sm font-black text-black uppercase">
                    Payment Method
                    <select className="mt-2 w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-red-600">
                      <option>💳 GCash</option>
                      <option>🪙 Cash on Delivery</option>
                    </select>
                  </label>

                  <div className="rounded-lg bg-yellow-100 p-4 border-4 border-black text-sm text-black">
                    <p className="font-black text-red-600 uppercase">💳 GCash Payment</p>
                    <p className="mt-3 font-bold">Number: 0917-123-4567</p>
                    <p className="font-bold">Name: Muragoods</p>
                    <p className="mt-3 text-xs font-black uppercase tracking-widest text-red-600">📸 Upload proof of payment</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="mario-btn mt-6 w-full bg-black text-yellow-300 hover:bg-slate-900 uppercase font-black text-lg tracking-widest"
                >
                  🎮 PLACE ORDER
                </button>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
