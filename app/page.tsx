"use client";

import { products, deliveryZones, type Product } from "@/app/lib/muragoods-data";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

function CheckoutSection({ cartItems, restrictedItems, location, subtotal, shippingFee, total, removeFromCart, addToCart }: any) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [deliveryService, setDeliveryService] = useState("Free Shipping");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("GCash");
  const [gcashRef, setGcashRef] = useState("");
  const [gcashFile, setGcashFile] = useState<File | null>(null);
  const [mapAddress, setMapAddress] = useState("");
  const [coordinates, setCoordinates] = useState({ lat: 13.1528, lng: 123.7384 });
  const [showGCashUpload, setShowGCashUpload] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.push("/login");
      return;
    }
    setIsLoggedIn(true);
  }, [router]);

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Enforce login
    if (!isLoggedIn) {
      setError("❌ You must log in before checkout. Redirecting...");
      setTimeout(() => router.push("/login"), 2000);
      return;
    }

    // Validate cart
    if (cartItems.length === 0) {
      setError("❌ Your cart is empty!");
      return;
    }

    // Validate address
    if (!mapAddress) {
      setError("❌ Please select an address on the map");
      return;
    }

    // Validate delivery date
    if (!deliveryDate) {
      setError("❌ Please select a delivery date");
      return;
    }

    // Validate GCash if selected
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

    // Create order
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const orderId = `MUR-${Math.floor(Math.random() * 10000)}`;
    const newOrder = {
      customer: user.name || user.email,
      phone: "0917-000-0000", 
      zone: location,
      address: mapAddress,
      latitude: coordinates.lat,
      longitude: coordinates.lng,
      payment: paymentMethod as any,
      gcashRefNumber: gcashRef || undefined,
      gcashScreenshotUrl: gcashFile ? URL.createObjectURL(gcashFile) : undefined, // In production, upload to storage
      deliveryDate: deliveryDate,
      status: "Pending Payment" as any,
      total: total,
      items: cartItems.map((item: any) => `${item.name} x ${item.quantity}`),
      deliveryType: deliveryService as any,
    };

    // Save order to Firebase
    import("@/app/lib/firebase-orders").then(async ({ createOrder }) => {
      try {
        await createOrder(user.email, newOrder);
        alert(`✅ Order placed!\nDelivery: ${deliveryDate}\nTotal: ₱${total}`);
        // Reset form
        setMapAddress("");
        setDeliveryDate("");
        setGcashRef("");
        setGcashFile(null);
      } catch (err) {
        setError("❌ Failed to place order. Please try again.");
      }
    });
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
              <a href="/login" className="mario-btn w-full bg-red-600 text-white uppercase font-black block">
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
      {/* Left Column - Cart & Checkout Form */}
      <div className="mario-card">
        <div className="bg-red-600 p-6 border-b-4 border-black">
          <h2 className="text-3xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <span className="coin-float">🪙</span> YOUR CART
          </h2>
        </div>

        <div className="bg-white p-6 space-y-6">
          {error && (
            <div className="rounded-lg border-4 border-red-600 bg-red-100 p-4 text-sm font-black text-red-700 uppercase">
              {error}
            </div>
          )}

          {restrictedItems.length > 0 && (
            <div className="rounded-lg border-4 border-red-600 bg-red-50 p-4 text-sm font-black text-red-700 uppercase">
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
                {cartItems.map((item: any) => (
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

              {/* Delivery Service Selection */}
              <div className="border-t-4 border-black pt-4">
                <label className="block text-sm font-black text-black uppercase mb-2">📅 Delivery Service</label>
                <select 
                  value={deliveryService} 
                  onChange={(e) => setDeliveryService(e.target.value)}
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-red-600"
                >
                  <option value="Free Shipping">Free Shipping - DWCL Only</option>
                  <option value="Saturday Delivery">Saturday Delivery - ₱30 (Legazpi/Daraga)</option>
                  <option value="Grab Express">Instant Grab Express (Pay Rider)</option>
                </select>
              </div>

              {/* Delivery Date */}
              <div>
                <label className="block text-sm font-black text-black uppercase mb-2">📆 Preferred Delivery Date</label>
                <input 
                  type="date" 
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  required
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-red-600"
                />
              </div>

              {/* Address Selection */}
              <div>
                <label className="block text-sm font-black text-black uppercase mb-2">📍 Delivery Address</label>
                <input 
                  type="text" 
                  value={mapAddress}
                  onChange={(e) => setMapAddress(e.target.value)}
                  placeholder="Enter your address or click on map to select"
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none focus:border-red-600"
                />
                <p className="text-xs text-gray-600 mt-2">Coordinates: {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}</p>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-black text-black uppercase mb-2">💳 Payment Method</label>
                <select 
                  value={paymentMethod}
                  onChange={(e) => {
                    setPaymentMethod(e.target.value);
                    setShowGCashUpload(e.target.value === "GCash");
                  }}
                  className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-red-600"
                >
                  <option value="GCash">💳 GCash (Requires Receipt Upload)</option>
                  <option value="COD">🪙 Cash on Delivery</option>
                </select>
              </div>

              {/* GCash Upload */}
              {showGCashUpload && (
                <div className="rounded-lg border-4 border-red-600 bg-red-50 p-4 space-y-3">
                  <p className="text-xs font-black text-red-700 uppercase">💳 GCash Payment Details</p>
                  <p className="text-sm font-bold text-black">Send ₱{total} to: <span className="text-red-600 font-black">0917-123-4567</span> (Muragoods)</p>
                  
                  <input 
                    type="text" 
                    value={gcashRef}
                    onChange={(e) => setGcashRef(e.target.value)}
                    placeholder="GCash Reference Number (ex: M1234567890)"
                    className="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black outline-none focus:border-red-600"
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

      {/* Right Column - Order Summary */}
      <aside className="mario-card">
        <div className="bg-blue-600 p-6 border-b-4 border-black">
          <h3 className="text-2xl font-black text-white uppercase tracking-widest">💰 TOTAL SCORE</h3>
        </div>

        <div className="bg-white p-6 flex flex-col h-full">
          <div className="space-y-4 text-base font-black text-black border-b-4 border-black pb-4 mb-4">
            <div className="flex justify-between"><span>Subtotal:</span><span className="text-red-600">₱{subtotal}</span></div>
            <div className="flex justify-between"><span>Shipping:</span><span className="text-red-600">₱{shippingFee}</span></div>
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
            disabled={cartItems.length === 0}
            className="mario-btn mt-auto w-full bg-black text-yellow-300 hover:bg-slate-900 uppercase font-black text-lg tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🎮 PLACE ORDER
          </button>
        </div>
      </aside>
    </form>
  );
}

import { ProtectedRoute } from "@/app/components/ProtectedRoute";

export default function Home() {
  const router = useRouter();
  // ... existing code ...
  return (
    <ProtectedRoute>
      <main className="min-h-screen">
        <section className="relative px-4 pb-12 pt-7 sm:px-8">
          {/* ... existing navigation and hero ... */}
        </section>
        {/* ... existing rest of the sections ... */}
      </main>
    </ProtectedRoute>
  );
}
