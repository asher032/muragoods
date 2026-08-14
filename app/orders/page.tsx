'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type Order, type OrderStatus } from '@/app/lib/muragoods-data';

const statusFlow: OrderStatus[] = [
  "Pending Payment",
  "Payment Verified",
  "Preparing",
  "Out for Delivery",
  "Delivered",
];

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<(Order & { _id?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.push("/login");
      return;
    }
    const user = JSON.parse(userStr);

    async function fetchOrders() {
      try {
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (result.success) {
          setOrders(result.data.map((o: Order & { _id?: string }) => ({
            ...o,
            id: o._id || o.id,
          })));
        }
      } catch (fetchError) {
        console.error("Failed to fetch orders:", fetchError);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [router]);

  const handleCancelOrder = async (orderId: string) => {
    const order = orders.find(o => (o._id || o.id) === orderId);
    if (!order || order.status !== "Pending Payment") {
      alert("You can only cancel orders that are still pending.");
      return;
    }

    if (!confirm("Are you sure you want to cancel this order?")) return;
    setCancellingId(orderId);

    try {
      const res = await fetch(`/api/orders?id=${orderId}`, { method: "DELETE" });
      const result = await res.json();
      if (result.success) {
        setOrders((current) => current.filter((o) => (o._id || o.id) !== orderId));
      } else {
        alert(result.error || "Failed to cancel order");
      }
    } catch {
      alert("Failed to cancel order");
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #E60012 0%, #c2000e 100%)' }}>
        <div className="text-white text-2xl font-black animate-bounce uppercase">Loading Orders...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen mario-pattern">
      <nav className="sticky top-0 z-50 bg-white border-b-4 border-black shadow-[0_4px_0px_0px_#000]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-full border-4 border-black bg-white flex items-center justify-center shadow-[4px_4px_0px_0px_#000] overflow-hidden">
              <Image src="/images/muragoods-logo.png" alt="Muragoods Logo" fill className="object-contain p-2" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-rose-500">Muragoods</p>
              <p className="text-xs font-bold uppercase tracking-widest text-black">Track Your Quest</p>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-3 text-xs font-black uppercase">
            <Link href="/menu" className="mario-btn mario-btn-blue">Menu</Link>
            <Link href="/checkout" className="mario-btn">Cart</Link>
          </div>
        </div>
      </nav>

      <section className="px-4 py-12 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="text-5xl font-black text-white uppercase tracking-tighter" style={{ textShadow: '6px 6px 0px #000' }}>Track Your Quest</h1>
            <p className="mt-2 text-lg font-black text-yellow-300" style={{ textShadow: '2px 2px 0px #000' }}>Your food is currently being prepped in Bowser&apos;s Castle Kitchen!</p>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-lg border-4 border-black bg-white p-12 text-center shadow-2xl">
              <p className="text-2xl font-black text-black uppercase mb-4">No orders found!</p>
              <Link href="/menu" className="mario-btn inline-block bg-yellow-400 text-black">Start Shopping</Link>
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map((order) => {
                const currentIndex = statusFlow.indexOf(order.status);
                const canCancel = order.status === "Pending Payment";

                return (
                  <article
                    key={order.id}
                    className="rounded-lg border-4 border-black bg-white p-6 shadow-2xl slide-in"
                  >
                    <div className="flex flex-col gap-5 border-b-4 border-black pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-black uppercase tracking-widest text-rose-500">
                          {order.id}
                        </p>
                        <h2 className="mt-2 text-3xl font-black text-black uppercase">
                          {order.customer}
                        </h2>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-lg border-2 border-black bg-yellow-300 px-4 py-2 text-xs font-black uppercase tracking-widest text-black pulse-badge">
                          {order.zone}
                        </span>
                        <span className="rounded-lg border-2 border-black bg-black px-4 py-2 text-xs font-black uppercase tracking-widest text-yellow-300">
                          {order.payment}
                        </span>
                        {canCancel ? (
                          <button
                            onClick={() => handleCancelOrder(order._id || order.id)}
                            disabled={cancellingId === (order._id || order.id)}
                            className="rounded bg-rose-400 px-3 py-2 text-xs font-black text-white hover:bg-rose-500 disabled:opacity-50"
                          >
                            {cancellingId === (order._id || order.id) ? "Cancelling..." : "Cancel"}
                          </button>
                        ) : (
                          <span className="rounded bg-gray-300 px-3 py-2 text-xs font-black text-gray-500 border-2 border-black">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
                      <div>
                        <div className="mb-6 grid gap-3 sm:grid-cols-5">
                          {statusFlow.map((step, index) => {
                            const active = index <= currentIndex;
                            return (
                              <div key={step} className="relative">
                                <div
                                  className={`flex h-12 w-12 items-center justify-center rounded-full border-4 text-xs font-black transition ${
                                    active
                                      ? "border-black bg-rose-400 text-white shadow-lg pulse-badge"
                                      : "border-black bg-white text-black"
                                  }`}
                                >
                                  {active && index > 0 ? 'OK' : index + 1}
                                </div>
                                <p className="mt-2 text-xs font-black uppercase tracking-widest text-white drop-shadow-lg">
                                  {step}
                                </p>
                              </div>
                            );
                          })}
                        </div>

                        <div className="rounded-lg border-4 border-black bg-yellow-100 p-5">
                          <p className="text-sm font-black uppercase tracking-widest text-black">Current Status</p>
                          <p className="mt-3 text-2xl font-black text-rose-500 uppercase">{order.status}</p>
                        </div>
                      </div>

                      <div className="rounded-lg border-4 border-black bg-white p-5">
                        <p className="text-sm font-black uppercase tracking-widest text-rose-500">Delivery Info</p>
                        <ul className="mt-4 space-y-3 text-sm">
<li className="font-bold text-black"><span className="font-black text-rose-500">{order.address}</span></li>
                  <li className="font-bold text-black"><span className="font-black text-rose-500">{order.phone}</span></li>
                  <li className="font-bold text-black"><span className="font-black text-rose-500">{order.deliveryType}</span></li>
                  <li className="font-bold text-black"><span className="font-black text-rose-500">{order.deliveryDate}</span></li>
                  <li className="font-bold text-black text-lg"><span className="font-black text-rose-500">₱{order.total}</span></li>
                        </ul>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
