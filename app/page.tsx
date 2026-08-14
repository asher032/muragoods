"use client";

import Link from "next/link";
import { products, deliveryZones, type Product } from "@/app/lib/muragoods-data";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

function CheckoutSection({ cartItems, restrictedItems, location, subtotal, shippingFee, total, removeFromCart, addToCart, clearCart }: {
  cartItems: Array<Product & { quantity: number }>;
  restrictedItems: string[];
  location: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  removeFromCart: (id: string) => void;
  addToCart: (product: Product) => void;
  clearCart: () => void;
}) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [deliveryService, setDeliveryService] = useState("Free Shipping");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("GCash");
  const [gcashRef, setGcashRef] = useState("");
  const [gcashFile, setGcashFile] = useState<File | null>(null);
  const [mapAddress, setMapAddress] = useState("");
  const [showGCashUpload, setShowGCashUpload] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.push("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoggedIn(true);
  }, [router]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isLoggedIn) {
      setError("❌ You must log in before checkout. Redirecting...");
      setTimeout(() => router.push("/login"), 2000);
      return;
    }

    if (cartItems.length === 0) {
      setError("❌ Your cart is empty!");
      return;
    }

    if (!mapAddress) {
      setError("❌ Please enter your delivery address");
      return;
    }

    if (!deliveryDate) {
      setError("❌ Please select a delivery date");
      return;
    }

    if (paymentMethod === "GCash") {
      if (!gcashRef) {
        setError("❌ Please enter GCash reference number");
        return;
      }
      if (!gcashFile) {
        setError("❌ Please upload GCash payment receipt");
        return;
      }
    }

    setIsSubmitting(true);
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    const formData = new FormData();
    formData.append("customer", user.name || user.email);
    formData.append("phone", "0917-000-0000");
    formData.append("zone", location);
    formData.append("address", mapAddress);
    formData.append("latitude", "13.1528");
    formData.append("longitude", "123.7384");
    formData.append("payment", paymentMethod);
    formData.append("deliveryDate", deliveryDate);
    formData.append("status", "Pending Payment");
    formData.append("total", String(total));
    formData.append("items", JSON.stringify(cartItems.map((item: Product & { quantity: number }) => `${item.name} x ${item.quantity}`)));
    formData.append("deliveryType", deliveryService);
    formData.append("userId", user.email);
    if (gcashRef) formData.append("gcashRefNumber", gcashRef);
    if (gcashFile) formData.append("gcashScreenshot", gcashFile);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (result.success) {
        alert(`✅ Order placed!\nDelivery: ${deliveryDate}\nTotal: ₱${total}`);
        setMapAddress("");
        setDeliveryDate("");
        setGcashRef("");
        setGcashFile(null);
        clearCart();
      } else {
        setError(result.error || "❌ Failed to place order. Please try again.");
      }
    } catch {
      setError("❌ Failed to place order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="mario-card">
          <div className="bg-black p-6 border-b-4 border-black">
            <h2 className="text-3xl font-black text-yellow-300 uppercase tracking-widest">🔐 LEVEL LOCKED</h2>
          </div>
          <div className="bg-white p-6 text-center">
            <div className="mx-auto w-20 h-20 bg-yellow-400 border-4 border-black flex items-center justify-center text-4xl mb-4 coin-float">❓</div>
            <p className="text-lg font-black text-black mb-4">⚠️ You must sign in to play!</p>
            <div className="space-y-4">
              <a href="/login" className="mario-btn w-full bg-rose-400 text-white uppercase font-black block">
                🔑 LOG IN
              </a>
              <a href="/signup" className="mario-btn mario-btn-yellow w-full uppercase font-black block">
                ✨ CREATE ACCOUNT
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleCheckout} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="mario-card">
        <div className="bg-rose-400 p-6 border-b-4 border-black">
          <h2 className="text-3xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <span className="coin-float">🪙</span> YOUR CART
          </h2>
        </div>

        <div className="bg-white p-6 space-y-6">
          {error && (
            <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-4 text-sm font-black text-rose-600 uppercase">
              {error}
            </div>
          )}

          {restrictedItems.length > 0 && (
            <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-4 text-sm font-black text-rose-600 uppercase">
              ⚠️ Coffee Jelly & Cookies: DWCL Only!
            </div>
          )}

          {cartItems.length === 0 ? (
            <div className="rounded-lg bg-yellow-100 p-8 text-center font-black text-slate-700 border-4 border-black">
              🛒 Cart is empty. Add delicious items!
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {cartItems.map((item: Product & { quantity: number }) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border-4 border-black p-4 bg-yellow-50">
                    <div>
                      <p className="text-lg font-black text-black">{item.name}</p>
                      <p className="text-sm font-bold text-slate-700">Qty {item.quantity} • ₱{item.price} each</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-black bg-rose-400 text-lg font-black text-white hover:bg-rose-300"
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

              <div className="border-t-4 border-black pt-4">
                <label className="block text-sm font-black text-black uppercase mb-2">📅 Delivery Service</label>
                <select
                  value={deliveryService}
                  onChange={(e) => setDeliveryService(e.target.value)}
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-rose-400"
                >
                  <option value="Free Shipping">Free Shipping - DWCL Only</option>
                  <option value="Saturday Delivery">Saturday Delivery - ₱30 (Legazpi/Daraga)</option>
                  <option value="Grab Express">Instant Grab Express (Pay Rider)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-black text-black uppercase mb-2">📆 Preferred Delivery Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  required
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-rose-400"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-black uppercase mb-2">📍 Delivery Address</label>
                <input
                  type="text"
                  value={mapAddress}
                  onChange={(e) => setMapAddress(e.target.value)}
                  placeholder="Enter your delivery address"
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none focus:border-rose-400"
                />
                <p className="text-xs text-gray-600 mt-2">Coordinates: 13.1528, 123.7384</p>
              </div>

              <div>
                <label className="block text-sm font-black text-black uppercase mb-2">💳 Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => {
                    setPaymentMethod(e.target.value);
                    setShowGCashUpload(e.target.value === "GCash");
                  }}
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-rose-400"
                >
                  <option value="GCash">💳 GCash (Requires Receipt Upload)</option>
                  <option value="COD">🪙 Cash on Delivery</option>
                </select>
              </div>

              {showGCashUpload && (
                <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-4 space-y-3">
                  <p className="text-xs font-black text-rose-600 uppercase">💳 GCash Payment Details</p>
                  <p className="text-sm font-bold text-black">Send ₱{total} to: <span className="text-rose-500 font-black">0917-123-4567</span> (Muragoods)</p>

                  <input
                    type="text"
                    value={gcashRef}
                    onChange={(e) => setGcashRef(e.target.value)}
                    placeholder="GCash Reference Number (ex: M1234567890)"
                    className="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black outline-none focus:border-rose-400"
                  />

                  <div>
                    <label className="block text-xs font-black text-black uppercase mb-1">Upload Payment Receipt 📸</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setGcashFile(e.target.files?.[0] || null)}
                      className="w-full text-xs font-semibold text-black"
                      required
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="mario-card">
        <div className="bg-blue-600 p-6 border-b-4 border-black">
          <h3 className="text-2xl font-black text-white uppercase tracking-widest">💰 TOTAL SCORE</h3>
        </div>

        <div className="bg-white p-6 flex flex-col h-full">
          <div className="space-y-4 text-base font-black text-black border-b-4 border-black pb-4 mb-4">
            <div className="flex justify-between"><span>Subtotal:</span><span className="text-rose-500">₱{subtotal}</span></div>
            <div className="flex justify-between"><span>Shipping:</span><span className="text-rose-500">₱{shippingFee}</span></div>
            <div className="flex justify-between text-2xl bg-yellow-400 p-3 border-4 border-black"><span>TOTAL:</span><span>₱{total}</span></div>
          </div>

          <div className="space-y-2 text-xs font-bold text-black mb-4">
            <p>📅 Delivery: {deliveryDate || "Not selected"}</p>
            <p>🚚 Service: {deliveryService}</p>
            <p>📍 Location Saved: {mapAddress ? "✅" : "❌"}</p>
            <p>💳 Payment: {paymentMethod}</p>
          </div>

          <button
            type="submit"
            disabled={cartItems.length === 0 || isSubmitting}
            className="mario-btn mt-auto w-full bg-black text-yellow-300 hover:bg-slate-900 uppercase font-black text-lg tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "⏳ PLACING ORDER..." : "🎮 PLACE ORDER"}
          </button>
        </div>
      </aside>
    </form>
  );
}

export default function Home() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [location, setLocation] = useState("DWCL");
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (!user) {
      router.push("/login");
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoggedIn(true);
    }
  }, [router]);

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

  if (!isLoggedIn) {
    return <div className="min-h-screen bg-blue-500 flex flex-col items-center justify-center font-black text-white">
      <div className="text-4xl animate-bounce mb-4">🍄</div>
      <div className="text-3xl uppercase tracking-tighter">Warping to World 1-1...</div>
    </div>;
  }

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

  const clearCart = () => setCart({});

  const restrictedItems = ["coffee-jelly", "cookies"].filter(
    (id) => cart[id] && location !== "DWCL",
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-rose-300 to-rose-400">
      <section className="relative px-4 pb-12 pt-7 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <nav className="mb-8 flex flex-col gap-4 bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_#000] md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center border-4 border-black bg-rose-400 text-3xl font-black text-white shadow-[4px_4px_0px_0px_#000]">
                M
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-rose-500">Muragoods</p>
                <p className="text-xs font-bold uppercase tracking-widest text-black">World 1-1 Food</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase">
              <a href="#menu" className="mario-btn mario-btn-blue">Menu</a>
              <a href="#shipping" className="mario-btn mario-btn-green">Map</a>
              <a href="#checkout" className="mario-btn">Cart</a>
              <Link href="/account/orders" className="mario-btn mario-btn-yellow">Orders</Link>
              <button onClick={() => { localStorage.removeItem('user'); window.location.reload(); }} className="mario-btn bg-black text-white">Logout</button>
            </div>
          </nav>

          <div className="diagonal-stripes relative border-4 border-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="text-white">
                <div className="mb-5 inline-flex border-4 border-black bg-yellow-400 px-6 py-3 text-sm font-black uppercase tracking-wider text-black shadow-[4px_4px_0px_0px_#000]">
                  ⭐ POWER UP YOUR HUNGER ⭐
                </div>
                <h1 className="max-w-xl text-6xl font-black leading-tight tracking-tighter text-white sm:text-7xl md:text-8xl [text-shadow:8px_8px_0px_#000]">
                  MURA<br/>GOODS
                </h1>
                <p className="mt-5 max-w-xl text-xl font-black text-yellow-300 [text-shadow:4px_4px_0px_#000]">
                  🍙 MUSUBI • 🌭 CHURROS • ☕ COFFEE JELLY
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <a href="#menu" className="mario-btn mario-btn-yellow text-lg">
                    PLAY NOW 🎮
                  </a>
                  <a href="#checkout" className="mario-btn mario-btn-blue text-lg">
                    VIEW CART 🛒
                  </a>
                </div>
              </div>

              <div className="flex min-h-[420px] items-center justify-center">
                <div className="mario-card w-full max-w-sm overflow-hidden">
                  <div className="bg-rose-400 p-4 border-b-4 border-black flex justify-between items-center">
                    <span className="text-white font-black">HIGH SCORE: ₱55</span>
                    <span className="animate-pulse text-yellow-300">✨ NEW!</span>
                  </div>
                  <div className="bg-white p-12 flex justify-center items-center">
                    <div className="text-8xl coin-float">🍙</div>
                  </div>
                  <div className="bg-black p-4 text-center">
                    <h3 className="text-2xl font-black text-white uppercase">SUPER MUSUBI</h3>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="menu" className="px-4 py-12 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="text-6xl font-black text-white uppercase tracking-tighter [text-shadow:6px_6px_0px_#000]">SELECT YOUR POWER-UP</h2>
            <div className="h-2 w-48 bg-yellow-400 mx-auto mt-4 border-2 border-black"></div>
          </div>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {products.map((product) => (
              <div key={product.id} className="mario-card group">
                <div className="h-48 bg-blue-400 p-6 flex items-center justify-center text-8xl border-b-4 border-black group-hover:bg-blue-300 transition-colors">
                  <span className="coin-float">
                    {product.id === "musubi" ? "🍙" : product.id === "churros" ? "🌭" : product.id === "coffee-jelly" ? "☕" : "🍪"}
                  </span>
                </div>

                <div className="p-6 bg-white">
                  <h3 className="text-2xl font-black text-black uppercase">{product.name}</h3>
                  <p className="mt-2 text-sm font-bold text-slate-700 h-12 overflow-hidden">{product.description}</p>

                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-3xl font-black text-rose-500 [text-shadow:2px_2px_0px_#000]">₱{product.price}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      className="mario-btn mario-btn-yellow"
                    >
                      + ADD
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
              <div className="p-6 bg-rose-400 border-b-4 border-black">
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
                  <div className="bg-rose-400 p-4 border-b-4 border-black">
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

      <section id="checkout" className="px-4 py-12 sm:px-8 bg-gradient-to-b from-rose-300 to-rose-400">
        <div className="mx-auto max-w-7xl">
          <CheckoutSection
            cartItems={cartItems}
            restrictedItems={restrictedItems}
            location={location}
            subtotal={subtotal}
            shippingFee={shippingFee}
            total={total}
            removeFromCart={removeFromCart}
            addToCart={addToCart}
            clearCart={clearCart}
          />
        </div>
      </section>
    </main>
  );
}
