'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { products as staticProducts, type CartItem, deliveryZones, dwclOnlyProducts, type ZoneKey } from '@/app/lib/muragoods-data';

const LocationPicker = dynamic(() => import('@/app/components/LocationPicker'), { ssr: false });

const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

export default function CheckoutPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cart, setCart] = useState<Record<string, { quantity: number; variantId?: string }>>({});
  const [location, setLocation] = useState<ZoneKey>("DWCL");
  const [phone, setPhone] = useState("");
  const [deliveryService, setDeliveryService] = useState("Free Shipping");
  const [customOrderDate, setCustomOrderDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("GCash");
  const [gcashRef, setGcashRef] = useState("");
  const [gcashFile, setGcashFile] = useState<File | null>(null);
  const [mapAddress, setMapAddress] = useState("");
  const [latitude, setLatitude] = useState("13.1550");
  const [longitude, setLongitude] = useState("123.7450");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.push("/login");
      return;
    }
    setIsLoggedIn(true);

    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch {
        setCart({});
      }
    }
  }, [router]);

  const cartItems = Object.entries(cart)
    .filter(([, data]) => data.quantity > 0)
    .map(([productId, data]) => {
      const product = staticProducts.find(p => p.id === productId);
      if (!product) return null;
      const variant = product.variants.find(v => v.id === (data.variantId || product.variants[0].id));
      return {
        ...product,
        quantity: data.quantity,
        selectedVariant: variant || product.variants[0],
      } as CartItem;
    })
    .filter((item): item is CartItem => item !== null);

  const isDwcl = location === "DWCL";
  const restrictedItems = cartItems.filter(item => dwclOnlyProducts.includes(item.id) && !isDwcl);
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + (item.selectedVariant?.price || 0) * item.quantity, 0);
  const shippingFee = location === "DWCL" ? 0 : 30;
  const total = subtotal + shippingFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (cartItems.length === 0) {
      setError("Your cart is empty!");
      return;
    }

    if (!isDwcl && totalItems < 2) {
      setError("Minimum 2 items required for delivery outside DWCL.");
      return;
    }

    const phoneDigits = phone.replace(/[\s-()+]/g, '');
    if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 15) {
      setError("Please enter a valid contact number (10-15 digits).");
      return;
    }

    if (!isDwcl && !mapAddress) {
      setError("Please select your delivery location on the map");
      return;
    }

    if (!customOrderDate) {
      setError("Please enter your preferred order date");
      return;
    }

    if (paymentMethod === "GCash") {
      if (!gcashRef.trim() || gcashRef.trim().length < 5) {
        setError("Please enter a valid GCash reference number.");
        return;
      }
      if (!gcashFile) {
        setError("Payment proof is required. Please upload your GCash receipt.");
        return;
      }
    }

    setIsSubmitting(true);
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    const formData = new FormData();
    formData.append("customer", user.name || user.email);
    formData.append("phone", phone);
    formData.append("zone", location);
    formData.append("address", mapAddress || "DWCL Pickup");
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    formData.append("payment", paymentMethod);
    formData.append("deliveryDate", customOrderDate);
    formData.append("status", "Pending Payment");
    formData.append("total", String(total));
    formData.append("items", JSON.stringify(cartItems.map(item => `${item.name} (${item.selectedVariant?.name}) x ${item.quantity}`)));
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
        localStorage.removeItem("cart");
        setCart({});
        setShowInstagramModal(true);
      } else {
        setError(result.error || "Failed to place order. Please try again.");
      }
    } catch {
      setError("Failed to place order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addToCartFromCheckout = (productId: string) => {
    setCart(prev => {
      const next = {
        ...prev,
        [productId]: {
          ...(prev[productId] || { variantId: staticProducts.find(p => p.id === productId)?.variants[0].id }),
          quantity: (prev[productId]?.quantity || 0) + 1,
        }
      };
      localStorage.setItem("cart", JSON.stringify(next));
      return next;
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const next = { ...prev };
      if (!next[productId]) return prev;
      if (next[productId].quantity <= 1) {
        delete next[productId];
      } else {
        next[productId] = { ...next[productId], quantity: next[productId].quantity - 1 };
      }
      localStorage.setItem("cart", JSON.stringify(next));
      return next;
    });
  };

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-blue-500 flex flex-col items-center justify-center font-black text-white">
        <div className="text-4xl animate-bounce mb-4"></div>
        <div className="text-3xl uppercase tracking-tighter">Warping to World 1-1...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ backgroundImage: 'url(/images/background4.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b-4 border-black shadow-[0_4px_0px_0px_#000]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-full border-4 border-black overflow-hidden shadow-[4px_4px_0px_0px_#000]">
              <Image src="/images/muragoods-logo.png" alt="Muragoods Logo" fill className="object-cover" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-rose-500">Muragoods</p>
              <p className="text-xs font-bold uppercase tracking-widest text-black">Checkout</p>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-3 text-xs font-black uppercase">
            <Link href="/menu" className="mario-btn mario-btn-blue">Menu</Link>
            <Link href="/orders" className="mario-btn mario-btn-yellow">Orders</Link>
          </div>
        </div>
      </nav>

      <section className="px-4 py-12 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-5xl font-black text-white uppercase tracking-tighter" style={{ textShadow: '6px 6px 0px #000' }}>Final Stage: Checkout</h1>
            <p className="mt-2 text-lg font-black text-yellow-300" style={{ textShadow: '2px 2px 0px #000' }}>Review your items and complete your order.</p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-1 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="mario-card">
              <div className="bg-rose-400 p-4 sm:p-6 border-b-4 border-black">
                <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-widest">Your Cart</h2>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {error && (
                  <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-4 text-sm font-black text-rose-600 uppercase">
                    {error}
                  </div>
                )}

                {restrictedItems.length > 0 && (
                  <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-4 text-sm font-black text-rose-600 uppercase">
                    Coffee Jelly & Cookies are only available for DWCL pickup!
                  </div>
                )}

                {!isDwcl && totalItems < 2 && (
                  <div className="rounded-lg border-4 border-yellow-400 bg-yellow-50 p-4 text-sm font-black text-black uppercase">
                    Minimum 2 items required for delivery outside DWCL.
                  </div>
                )}

                {cartItems.length === 0 ? (
                  <div className="rounded-lg bg-yellow-100 p-8 text-center font-black text-slate-700 border-4 border-black">
                    Cart is empty. Add delicious items!
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      {cartItems.map((item) => (
                        <div key={item.id + (item.selectedVariant?.id || '')} className="flex items-center justify-between rounded-lg border-4 border-black p-4 bg-yellow-50">
                          <div>
                            <p className="text-lg font-black text-black">{item.name}</p>
                            <p className="text-sm font-bold text-slate-700">{item.selectedVariant?.name} • ₱{item.selectedVariant?.price || 0} each</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.id)}
                              className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-black bg-rose-400 text-lg font-black text-white hover:bg-rose-300"
                            >
                              −
                            </button>
                            <span className="w-8 text-center font-black text-black text-lg">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => addToCartFromCheckout(item.id)}
                              className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-black bg-black text-lg font-black text-yellow-300 hover:bg-slate-900"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="block text-sm font-black text-black uppercase mb-2">Delivery Zone</label>
                      <select
                        value={location}
                        onChange={(e) => setLocation(e.target.value as ZoneKey)}
                        className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-rose-400 text-sm sm:text-base"
                      >
                        {deliveryZones.map(zone => (
                          <option key={zone.code} value={zone.code}>{zone.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-600 mt-2">{deliveryZones.find(z => z.code === location)?.note}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-black text-black uppercase mb-2">Contact Number *</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Enter valid contact number"
                        className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none focus:border-rose-400 text-sm sm:text-base"
                        required
                      />
                      <p className="text-xs text-gray-600 mt-1">Required for delivery confirmation calls</p>
                    </div>

                    <div>
                      <label className="block text-sm font-black text-black uppercase mb-2">Preferred Order Date</label>
                      <input
                        type="date"
                        value={customOrderDate}
                        onChange={(e) => setCustomOrderDate(e.target.value)}
                        required
                        min={tomorrow}
                        className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-rose-400 text-sm sm:text-base"
                      />
                      <p className="text-xs text-gray-600 mt-1">Select a valid future date</p>
                    </div>

                    {!isDwcl && (
                      <div>
                        <label className="block text-sm font-black text-black uppercase mb-2">Delivery Location</label>
                        <div className="rounded-lg border-4 border-black overflow-hidden">
                          <LocationPicker
                            initialLat={13.1550}
                            initialLng={123.7450}
                            onLocationSelect={(lat, lng, address) => {
                              setMapAddress(address);
                              setLatitude(String(lat));
                              setLongitude(String(lng));
                            }}
                          />
                        </div>
                        {mapAddress && (
                          <div className="mt-3 p-3 bg-yellow-400 border-4 border-black rounded-lg">
                            <p className="text-sm font-black text-black uppercase">Selected Delivery Location</p>
                            <p className="text-lg font-black text-black">{mapAddress}</p>
                          </div>
                        )}
                        <p className="text-xs text-gray-600 mt-2">Click on the map or drag the pin to set your delivery location</p>
                      </div>
                    )}

                    {isDwcl && (
                      <div className="rounded-lg border-4 border-black bg-yellow-100 p-4">
                        <p className="text-sm font-black text-black uppercase">DWCL Pickup</p>
                        <p className="text-xs text-gray-700 mt-1">No map needed for DWCL pickup. Please proceed to the next steps.</p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-black text-black uppercase mb-2">Order Type</label>
                      <select
                        value={deliveryService}
                        onChange={(e) => setDeliveryService(e.target.value)}
                        className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-rose-400"
                      >
                        <option value="Free Shipping">DWCL Pickup - Free</option>
                        <option value="Saturday Delivery">Saturday Delivery - Legazpi/Daraga</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-black text-black uppercase mb-2">Payment Method *</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-black text-black outline-none focus:border-rose-400"
                      >
                        <option value="GCash">GCash - Proof Required</option>
                        <option value="COD">Cash on Delivery</option>
                      </select>
                      <p className="text-xs text-gray-600 mt-1">GCash proof is mandatory. Without proof, order may be delayed or rejected.</p>
                    </div>

                    {paymentMethod === "GCash" && (
                      <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-4 space-y-3">
                        <p className="text-xs font-black text-rose-600 uppercase">GCash Payment Details</p>
                        <p className="text-sm font-bold text-black">Send amount to: <span className="text-rose-500 font-black">639466472599</span> (Muragoods)</p>

                        <div>
                          <label className="block text-xs font-black text-black uppercase mb-1">GCash Reference Number *</label>
                          <input
                            type="text"
                            value={gcashRef}
                            onChange={(e) => setGcashRef(e.target.value)}
                            placeholder="Enter valid GCash reference number"
                            className="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black outline-none focus:border-rose-400"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-black text-black uppercase mb-1">Upload Payment Receipt *</label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setGcashFile(e.target.files?.[0] || null)}
                            className="w-full text-xs font-semibold text-black"
                            required
                          />
                          <p className="text-xs text-gray-600 mt-1">Proof is required. Without proof, order may be delayed or rejected.</p>
                        </div>
                      </div>
                    )}

                    {paymentMethod === "COD" && (
                      <div className="rounded-lg border-4 border-black bg-yellow-100 p-4">
                        <p className="text-xs font-black text-black uppercase">Cash on Delivery</p>
                        <p className="text-xs text-gray-700 mt-1">Pay with cash when your order arrives.</p>
                      </div>
                    )}

                    <div className="rounded-lg border-4 border-black bg-blue-100 p-4">
                      <p className="text-xs font-black text-black uppercase">Custom Order / Inquiries</p>
                      <p className="text-xs text-gray-700 mt-1">For custom orders, bulk orders, or special requests, please message us directly:</p>
                      <p className="text-sm font-black text-black mt-1">Instagram: @muragoods_</p>
                      <p className="text-sm font-black text-black">Contact: 639466472599</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <aside className="checkout-summary">
              <div className="bg-black p-4 sm:p-6 border-b-4 border-black">
                <h3 className="text-xl sm:text-2xl font-black text-yellow-300 uppercase tracking-widest">Order Summary</h3>
              </div>

              <div className="p-4 sm:p-6 flex flex-col h-full">
                <div className="space-y-3 sm:space-y-4 text-base font-black text-black border-b-4 border-black pb-4 mb-4">
                  <div className="flex justify-between text-sm sm:text-base"><span>Subtotal:</span><span className="text-rose-500">₱{subtotal}</span></div>
                  <div className="flex justify-between text-sm sm:text-base"><span>Shipping:</span><span className="text-rose-500">₱{shippingFee}</span></div>
                  <div className="flex justify-between text-xl sm:text-2xl bg-yellow-400 p-3 border-4 border-black"><span>TOTAL:</span><span>₱{total}</span></div>
                </div>

                <div className="space-y-2 text-xs font-bold text-black mb-4">
                  <p>Order Date: {customOrderDate || "Not selected"}</p>
                  <p>Service: {deliveryService}</p>
                  {!isDwcl && <p>Location: {mapAddress ? "Pinned" : "Not selected"}</p>}
                  <p>Payment: {paymentMethod}</p>
                  <p>Phone: {phone || "Not provided"}</p>
                </div>

                <button
                  type="submit"
                  disabled={cartItems.length === 0 || isSubmitting}
                  className="mario-btn mt-auto w-full bg-black text-yellow-300 hover:bg-slate-900 uppercase font-black text-lg tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "PLACING ORDER..." : "PLACE ORDER"}
                </button>
              </div>
            </aside>
          </form>
        </div>
      </section>

      {showInstagramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setShowInstagramModal(false)}>
          <div className="mario-card max-w-lg w-full animate-bounce-in" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-6 border-b-4 border-black text-center">
              <h2 className="text-3xl font-black text-white uppercase">Order Placed!</h2>
            </div>
            <div className="p-8 bg-white text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-3xl font-black shadow-lg">
                IG
              </div>
              <h3 className="text-2xl font-black text-black">Please message @muragoods_ on Instagram</h3>
              <p className="text-sm font-bold text-slate-700">Confirm your order and get updates!</p>
              <a
                href="https://www.instagram.com/muragoods_/"
                target="_blank"
                rel="noopener noreferrer"
                className="mario-btn mario-btn-yellow w-full"
              >
                Open Instagram @muragoods_
              </a>
              <button
                onClick={() => {
                  setShowInstagramModal(false);
                  router.push('/orders');
                }}
                className="mario-btn bg-black text-yellow-300 w-full"
              >
                View My Orders
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
