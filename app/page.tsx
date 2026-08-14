"use client";

import Image from "next/image";
import Link from "next/link";
import { products, deliveryZones, type Product } from "@/app/lib/muragoods-data";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const LocationPicker = dynamic(() => import("@/app/components/LocationPicker"), { ssr: false });

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
  const [gcashNoProof, setGcashNoProof] = useState(false);
  const [mapAddress, setMapAddress] = useState("");
  const [latitude, setLatitude] = useState("13.1370");
  const [longitude, setLongitude] = useState("123.7340");
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
      setError("❌ Please select your delivery location on the map");
      return;
    }

    if (!deliveryDate) {
      setError("❌ Please select a delivery date");
      return;
    }

    if (paymentMethod === "GCash" && !gcashNoProof) {
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
    formData.append("phone", "639466472599");
    formData.append("zone", location);
    formData.append("address", mapAddress);
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    formData.append("payment", paymentMethod === "GCash-NoProof" ? "GCash" : paymentMethod);
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
                <label className="block text-sm font-black text-black uppercase mb-2">📍 Delivery Location</label>
                <div className="rounded-lg border-4 border-black overflow-hidden">
                  <LocationPicker
                    onLocationSelect={(lat, lng, address) => {
                      setMapAddress(address);
                      setLatitude(String(lat));
                      setLongitude(String(lng));
                    }}
                  />
                </div>
                <input
                  type="text"
                  value={mapAddress}
                  onChange={(e) => setMapAddress(e.target.value)}
                  placeholder="Or enter address manually"
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none focus:border-rose-400 mt-3"
                />
                <p className="text-xs text-gray-600 mt-2">Click on the map to pin your delivery location</p>
              </div>

              <div>
                <label className="block text-sm font-black text-black uppercase mb-2">💳 Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => {
                    setPaymentMethod(e.target.value);
                    setShowGCashUpload(e.target.value === "GCash");
                    setGcashNoProof(false);
                  }}
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-rose-400"
                >
                  <option value="GCash">💳 GCash (with receipt)</option>
                  <option value="GCash-NoProof">💳 GCash (no receipt)</option>
                  <option value="COD">🪙 Cash on Delivery</option>
                </select>
              </div>

              {showGCashUpload && paymentMethod === "GCash" && (
                <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-4 space-y-3">
                  <p className="text-xs font-black text-rose-600 uppercase">💳 GCash Payment Details</p>
                  <p className="text-sm font-bold text-black">Send ₱{total} to: <span className="text-rose-500 font-black">639466472599</span> (Muragoods)</p>

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
                      required={!gcashNoProof}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs font-black text-black uppercase">
                    <input
                      type="checkbox"
                      checked={gcashNoProof}
                      onChange={(e) => setGcashNoProof(e.target.checked)}
                    />
                    Skip receipt - I already paid
                  </label>
                </div>
              )}

              {paymentMethod === "GCash-NoProof" && (
                <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-4 space-y-3">
                  <p className="text-xs font-black text-rose-600 uppercase">💳 GCash Payment Details</p>
                  <p className="text-sm font-bold text-black">Send ₱{total} to: <span className="text-rose-500 font-black">639466472599</span> (Muragoods)</p>
                  <p className="text-xs font-bold text-black">No receipt upload required.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="checkout-summary">
        <div className="bg-black p-6 border-b-4 border-black">
          <h3 className="text-2xl font-black text-yellow-300 uppercase tracking-widest">💰 TOTAL SCORE</h3>
        </div>

        <div className="p-6 flex flex-col h-full">
          <div className="space-y-4 text-base font-black text-black border-b-4 border-black pb-4 mb-4">
            <div className="flex justify-between"><span>Subtotal:</span><span className="text-rose-500">₱{subtotal}</span></div>
            <div className="flex justify-between"><span>Shipping:</span><span className="text-rose-500">₱{shippingFee}</span></div>
            <div className="flex justify-between text-2xl bg-yellow-400 p-3 border-4 border-black"><span>TOTAL:</span><span>₱{total}</span></div>
          </div>

          <div className="space-y-2 text-xs font-bold text-black mb-4">
            <p>📅 Delivery: {deliveryDate || "Not selected"}</p>
            <p>🚚 Service: {deliveryService}</p>
            <p>📍 Location: {mapAddress ? "✅ Pinned" : "❌ Not selected"}</p>
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
    <main className="min-h-screen" style={{ background: 'linear-gradient(180deg, #E60012 0%, #c2000e 100%)' }}>
      <nav className="sticky top-0 z-50 bg-white border-b-4 border-black shadow-[0_4px_0px_0px_#000]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-12 w-12 border-4 border-black bg-rose-400 flex items-center justify-center shadow-[4px_4px_0px_0px_#000]">
              <Image src="/images/muragoods.png" alt="Muragoods" fill className="object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-rose-500">Muragoods</p>
              <p className="text-xs font-bold uppercase tracking-widest text-black">World 1-1 Food</p>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-3 text-xs font-black uppercase">
            <a href="#menu" className="mario-btn mario-btn-blue">Menu</a>
            <a href="#map" className="mario-btn mario-btn-green">Map</a>
            <a href="#checkout" className="mario-btn">Cart</a>
            <Link href="/account/orders" className="mario-btn mario-btn-yellow">Orders</Link>
            <button onClick={() => { localStorage.removeItem('user'); window.location.reload(); }} className="mario-btn bg-black text-white">Logout</button>
          </div>
        </div>
      </nav>

      <section className="relative px-4 pb-12 pt-7 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="angled-divider charcoal-pattern relative border-4 border-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="text-white">
                <div className="mb-5 inline-flex border-4 border-black bg-yellow-400 px-6 py-3 text-sm font-black uppercase tracking-wider text-black shadow-[4px_4px_0px_0px_#000]">
                  ⭐ EARN 2X COINS ON TODAY&apos;S ORDERS! ⭐
                </div>
                <h1 className="max-w-xl text-6xl font-black leading-tight tracking-tighter text-white sm:text-7xl md:text-8xl" style={{ textShadow: '8px 8px 0px #000' }}>
                  WELCOME TO THE<br/>MUSHROOM KINGDOM<br/>EXPRESS!
                </h1>
                <p className="mt-5 max-w-xl text-xl font-black text-yellow-300" style={{ textShadow: '4px 4px 0px #000' }}>
                  🍙 MUSUBI • 🌭 CHURROS • ☕ COFFEE JELLY
                </p>
                <p className="mt-2 max-w-xl text-lg font-black text-white" style={{ textShadow: '2px 2px 0px #000' }}>
                  Fuel your adventure with iconic treats and power-ups delivered straight to your door!
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <a href="#menu" className="mario-btn mario-btn-yellow text-lg">
                    ORDER NOW &gt;
                  </a>
                  <a href="#checkout" className="mario-btn mario-btn-blue text-lg">
                    VIEW CART 🛒
                  </a>
                </div>
              </div>

              <div className="flex min-h-[420px] items-center justify-center">
                <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border-4 border-yellow-400 bg-white shadow-[8px_8px_0px_0px_#000] hero-3d-cutout">
                  <div className="bg-rose-400 p-4 border-b-4 border-black flex justify-between items-center">
                    <span className="text-white font-black">HIGH SCORE: ₱55</span>
                    <span className="animate-pulse text-yellow-300">✨ NEW!</span>
                  </div>
                  <div className="relative aspect-square w-full bg-white flex items-center justify-center">
                    <Image src="/images/mario-hero.png" alt="Mario Hero" fill className="object-contain p-4" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="absolute top-4 right-4 w-16 h-16 bg-yellow-400 border-4 border-black rounded-full flex items-center justify-center text-3xl coin-float z-10">🪙</div>
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

      <section id="menu" className="px-4 py-12 sm:px-8" style={{ background: 'linear-gradient(180deg, #E60012 0%, #c2000e 100%)' }}>
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="text-6xl font-black text-white uppercase tracking-tighter" style={{ textShadow: '6px 6px 0px #000' }}>Choose Your Power-Up Menu</h2>
            <p className="mt-4 text-lg font-black text-yellow-300" style={{ textShadow: '2px 2px 0px #000' }}>Pick your favorites from our legendary selection of meals, drinks, and side quests.</p>
            <div className="h-2 w-48 bg-yellow-400 mx-auto mt-4 border-2 border-black"></div>
          </div>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {products.map((product) => (
              <div key={product.id} className="menu-card group">
                <div className="h-48 bg-blue-400 p-6 flex items-center justify-center text-8xl border-b-4 border-black group-hover:bg-blue-300 transition-colors relative overflow-hidden">
                  <span className="coin-float relative z-10">
                    {product.id === "musubi" ? "🍙" : product.id === "churros" ? "🌭" : product.id === "coffee-jelly" ? "☕" : "🍪"}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                </div>

                <div className="p-6 bg-white">
                  <h3 className="text-2xl font-black text-black uppercase">{product.name}</h3>
                  <p className="mt-2 text-sm font-bold text-slate-700 h-12 overflow-hidden">{product.description}</p>

                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-3xl font-black text-rose-500" style={{ textShadow: '2px 2px 0px #000' }}>₱{product.price}</span>
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

      <section id="map" className="px-4 py-12 text-white sm:px-8" style={{ background: 'linear-gradient(180deg, #E60012 0%, #c2000e 100%)' }}>
        <div className="mx-auto max-w-7xl">
          <div className="section-divider-charcoal -mt-12 mb-8">
            <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="w-full">
              <path d="M0,30 C200,60 400,0 600,30 C800,60 1000,0 1200,30 L1200,60 L0,60 Z" fill="var(--charcoal)"/>
            </svg>
          </div>
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
                { title: "🌍 Outside", detail: "Musubi & Churros Delivery" },
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

          <div className="mt-8 section-divider-charcoal">
            <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="w-full">
              <path d="M0,0 L1200,0 L1200,30 C1000,60 800,0 600,30 C400,60 200,0 0,30 Z" fill="var(--charcoal)"/>
            </svg>
          </div>
          <div className="rounded-lg border-4 border-black bg-white p-2 shadow-2xl">
            <LocationPicker />
          </div>
          <div className="section-divider-charcoal mt-4">
            <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="w-full">
              <path d="M0,30 C200,0 400,60 600,30 C800,0 1000,60 1200,30 L1200,60 L0,60 Z" fill="var(--charcoal)"/>
            </svg>
          </div>
        </div>
      </section>

      <section id="checkout" className="px-4 py-12 sm:px-8" style={{ background: 'linear-gradient(180deg, #E60012 0%, #c2000e 100%)' }}>
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
