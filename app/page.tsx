"use client";

import { products, deliveryZones, type Product } from "@/app/lib/muragoods-data";
import { useMemo, useState } from "react";

const productCardColors: Record<string, string> = {
  musubi: "from-amber-100 via-yellow-200 to-orange-200",
  churros: "from-orange-200 via-amber-100 to-yellow-200",
  "coffee-jelly": "from-pink-200 via-rose-100 to-fuchsia-200",
  cookies: "from-yellow-100 via-amber-100 to-pink-200",
};

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
    <main className="min-h-screen bg-[#fffaf2] text-slate-900">
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_#fffef8,_#f7f0d8_22%,_#c2f2d4_58%,_#d7f3ff_100%)] px-4 pb-12 pt-7 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <nav className="mb-6 flex flex-col gap-4 rounded-full border border-white/50 bg-white/55 px-4 py-3 shadow-[0_10px_25px_rgba(49,57,72,0.06)] backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-2xl font-black text-white ring-4 ring-yellow-200">
                M
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-500">Muragoods</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Mínura-ng Pagkain</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
              <a href="#menu" className="rounded-full px-3 py-2 transition hover:bg-orange-100">Menu</a>
              <a href="#shipping" className="rounded-full px-3 py-2 transition hover:bg-orange-100">Delivery</a>
              <a href="#checkout" className="rounded-full px-3 py-2 transition hover:bg-orange-100">Checkout</a>
              <a href="/account/orders" className="rounded-full bg-orange-500 px-4 py-2 text-white transition hover:bg-orange-400">Orders</a>
            </div>
          </nav>

          <div className="rounded-[36px] border border-white/60 bg-white/30 p-4 shadow-[0_30px_100px_rgba(88,116,51,0.12)] backdrop-blur md:p-8">
            <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="mb-5 inline-flex rounded-full border border-orange-200 bg-orange-100/80 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-orange-700">
                  Fresh • Fast • Local
                </div>
                <h1 className="max-w-xl text-5xl font-black leading-[0.92] tracking-[-0.06em] text-slate-900 sm:text-6xl md:text-7xl">
                  Welcome to <span className="text-orange-500">Muragoods</span>
                </h1>
                <p className="mt-5 max-w-xl text-base text-slate-700 md:text-lg">
                  Fresh Musubi, Hot Churros, Coffee Jelly & Cookies | FREE Shipping to DWCL |
                  ₱30 Saturday Delivery to Legazpi & Daraga!
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href="#menu" className="rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-700">
                    Order Now
                  </a>
                  <a href="#checkout" className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-800 transition hover:border-slate-400">
                    Checkout
                  </a>
                </div>
              </div>

              <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,_#e7f4ff_0%,_#d3f2c6_40%,_#f8f0d6_100%)] p-6 shadow-inner">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.5),_transparent_55%)]" />
                <div className="relative w-full max-w-md rounded-[30px] border border-white/60 bg-white/40 p-6 shadow-[0_22px_50px_rgba(44,60,21,0.12)] backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">Popular</span>
                    <span className="rounded-full bg-amber-300 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-900">Fresh Today</span>
                  </div>
                  <div className="mt-6 rounded-[24px] bg-gradient-to-br from-orange-200 via-yellow-100 to-amber-200 p-5">
                    <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full bg-white/60 text-5xl shadow-inner">
                      🍡
                    </div>
                  </div>
                  <div className="mt-5 flex items-end justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Best seller</p>
                      <h3 className="mt-2 text-3xl font-black text-slate-900">Musubi</h3>
                    </div>
                    <p className="text-2xl font-black text-orange-500">₱55</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="menu" className="px-4 py-12 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-500">Menu</p>
              <h2 className="mt-2 text-4xl font-black text-slate-900">Our favorites</h2>
            </div>
            <span className="hidden rounded-full border border-emerald-200 bg-emerald-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 sm:inline-flex">
              Local delivery available
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {products.map((product) => (
              <article
                key={product.id}
                className="overflow-hidden rounded-[28px] border border-orange-100 bg-white shadow-[0_20px_55px_rgba(96,59,18,0.08)]"
              >
                <div className={`h-36 bg-gradient-to-br ${productCardColors[product.id] ?? "from-orange-100 to-amber-100"} p-6`}>
                  <div className="flex h-full items-center justify-center rounded-[20px] bg-white/40 text-5xl shadow-inner">
                    {product.id === "musubi" ? "🍙" : product.id === "churros" ? "🌭" : product.id === "coffee-jelly" ? "☕" : "🍪"}
                  </div>
                </div>

                <div className="p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-2xl font-black text-slate-900">{product.name}</h3>
                    <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">
                      {product.badge}
                    </span>
                  </div>

                  <p className="text-sm leading-6 text-slate-600">{product.description}</p>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-2xl font-black text-slate-900">₱{product.price}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
                    >
                      Add to cart
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="shipping" className="bg-slate-900 px-4 py-12 text-white sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">Delivery rules</p>
            <h2 className="mt-2 text-4xl font-black">Choose your location</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <label className="block text-sm font-medium text-slate-300">
                Delivery area
                <select
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-800 px-4 py-3 text-white outline-none focus:border-orange-400"
                >
                  {deliveryZones.map((zone) => (
                    <option key={zone.code} value={zone.code}>
                      {zone.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-5 rounded-2xl bg-orange-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-200">Zone info</p>
                <p className="mt-3 text-lg font-bold">{zoneInfo.label}</p>
                <p className="mt-2 text-sm text-slate-200">{zoneInfo.note}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                { title: "DWCL", detail: "FREE Shipping • All items allowed" },
                { title: "Legazpi / Daraga", detail: "₱30 Saturday Delivery • Musubi & Churros only" },
                { title: "Outside", detail: "Contact Muragoods social media for custom orders" },
              ].map((card) => (
                <div key={card.title} className="rounded-[26px] border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">{card.title}</p>
                  <p className="mt-4 text-base font-semibold text-white">{card.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="checkout" className="px-4 py-12 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(94,62,17,0.07)]">
              <h2 className="text-3xl font-black text-slate-900">Checkout</h2>

              {restrictedItems.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                  Coffee Jelly and Cookies are available for DWCL Campus delivery only.
                </div>
              ) : null}

              {cartItems.length === 0 ? (
                <div className="mt-6 rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                  Your cart is empty. Add something delicious first.
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                      <div>
                        <p className="text-lg font-black text-slate-900">{item.name}</p>
                        <p className="text-sm text-slate-500">Qty {item.quantity} • ₱{item.price} each</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-lg font-bold text-slate-700"
                        >
                          −
                        </button>
                        <span className="w-6 text-center font-bold text-slate-800">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => addToCart(item)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className="rounded-[30px] bg-[linear-gradient(180deg,_#fff4d9_0%,_#fffaf4_100%)] p-6 shadow-[0_20px_60px_rgba(94,62,17,0.07)]">
              <h3 className="text-2xl font-black text-slate-900">Order Summary</h3>

              <div className="mt-5 space-y-3 text-sm text-slate-700">
                <div className="flex justify-between"><span>Subtotal</span><span>₱{subtotal}</span></div>
                <div className="flex justify-between"><span>Shipping</span><span>₱{shippingFee}</span></div>
                <div className="flex justify-between font-black text-slate-900"><span>Total</span><span>₱{total}</span></div>
              </div>

              <div className="mt-6 space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Payment method
                  <select className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-orange-400">
                    <option>GCash</option>
                    <option>Cash on Delivery</option>
                  </select>
                </label>

                <div className="rounded-2xl bg-white p-4 text-sm text-slate-600">
                  <p className="font-bold text-slate-900">GCash option</p>
                  <p className="mt-2">Number: 0917-123-4567</p>
                  <p>Name: Muragoods</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-orange-500">Upload proof of payment</p>
                </div>
              </div>

              <button
                type="button"
                className="mt-6 w-full rounded-full bg-orange-500 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-orange-400"
              >
                Place Order
              </button>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
