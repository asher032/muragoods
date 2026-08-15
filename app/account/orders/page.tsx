'use client';

import Link from "next/link";
import Image from "next/image";
import { type Order, type OrderStatus } from "@/app/lib/muragoods-data";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const statusFlow: OrderStatus[] = [
  "Pending Payment",
  "Payment Verified",
  "Preparing",
  "Out for Delivery",
  "Delivered",
];

export default function AccountOrdersPage() {
  const [orders, setOrders] = useState<(Order & { _id?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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

  const logout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleDeleteOrder = async (orderId: string) => {
    const order = orders.find(o => (o._id || o.id) === orderId);
    if (!order || order.status !== "Pending Payment") {
      alert("You can only cancel orders that are still pending.");
      return;
    }

    if (!confirm("Are you sure you want to cancel this order?")) return;
    try {
      const res = await fetch(`/api/orders?id=${orderId}`, { method: "DELETE" });
      const result = await res.json();
      if (result.success) {
        setOrders((current) => current.filter((o) => (o._id || o.id) !== orderId));
      } else {
        alert(result.error || "Failed to delete order");
      }
    } catch {
      alert("Failed to delete order");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundImage: 'url(/images/background4.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
        <div className="text-white text-2xl font-black animate-bounce uppercase">Loading Orders...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 text-black sm:px-8" style={{ backgroundImage: 'url(/images/background4.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 rounded-lg border-4 border-black bg-white p-6 shadow-2xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-12 w-12 rounded-full border-4 border-black overflow-hidden shadow-[4px_4px_0px_0px_#000]">
              <Image src="/images/muragoods-logo.png" alt="Muragoods Logo" fill className="object-cover" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-rose-500">Muragoods</p>
              <h1 className="mt-2 text-4xl font-black text-black uppercase tracking-wider">My Orders</h1>
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={logout}
              className="mario-btn bg-rose-400 text-white hover:bg-rose-500 uppercase font-black border-black"
            >
              Logout
            </button>
            <Link
              href="/"
              className="mario-btn bg-black text-yellow-300 hover:bg-slate-900 uppercase font-black border-black"
            >
              ← Back to Shop
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border-4 border-black bg-white p-4 sm:p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-rose-500">Total Orders</p>
            <p className="mt-3 text-3xl sm:text-4xl font-black text-black">{orders.length}</p>
          </div>
          <div className="rounded-lg border-4 border-black bg-white p-4 sm:p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-rose-500">Preparing</p>
            <p className="mt-3 text-3xl sm:text-4xl font-black text-black">
              {orders.filter((order) => order.status === "Preparing").length}
            </p>
          </div>
          <div className="rounded-lg border-4 border-black bg-white p-4 sm:p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-rose-500">Out for Delivery</p>
            <p className="mt-3 text-3xl sm:text-4xl font-black text-black">
              {orders.filter((order) => order.status === "Out for Delivery").length}
            </p>
          </div>
        </section>

        <section className="mt-6 sm:mt-8 space-y-4 sm:space-y-6">
          {orders.length === 0 ? (
            <div className="rounded-lg border-4 border-black bg-white p-8 sm:p-12 text-center shadow-2xl">
              <p className="text-xl sm:text-2xl font-black text-black uppercase mb-4">No orders found!</p>
              <Link href="/" className="mario-btn inline-block bg-yellow-400 text-black">Start Shopping</Link>
            </div>
          ) : orders.map((order) => {
            const currentIndex = statusFlow.indexOf(order.status);

            return (
              <article
                key={order.id}
                className="rounded-lg border-4 border-black bg-white p-4 sm:p-6 shadow-2xl slide-in"
              >
                <div className="flex flex-col gap-4 sm:gap-5 border-b-4 border-black pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-rose-500">
                      {order.id}
                    </p>
                    <h2 className="mt-2 text-2xl sm:text-3xl font-black text-black uppercase">
                      {order.customer}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="rounded-lg border-2 border-black bg-yellow-300 px-3 py-2 text-xs font-black uppercase tracking-widest text-black pulse-badge">
                      {order.zone}
                    </span>
                    <span className="rounded-lg border-2 border-black bg-black px-3 py-2 text-xs font-black uppercase tracking-widest text-yellow-300">
                      {order.payment}
                    </span>
                    {order.status === "Pending Payment" ? (
                      <button
                        onClick={() => handleDeleteOrder(order._id || order.id)}
                        className="rounded bg-rose-400 px-3 py-2 text-xs font-black text-white hover:bg-rose-500"
                      >
                        Cancel
                      </button>
                    ) : (
                      <span className="rounded bg-gray-300 px-3 py-2 text-xs font-black text-gray-500 border-2 border-black">
                        Locked
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 grid gap-4 sm:gap-6 lg:grid-cols-[1.4fr_0.8fr]">
                  <div>
                    <div className="mb-6 grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                      {statusFlow.map((step, index) => {
                        const active = index <= currentIndex;
                        return (
                          <div key={step} className="relative">
                            <div
                              className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-4 text-xs font-black transition ${
                                active
                                  ? "border-black bg-rose-400 text-white shadow-lg pulse-badge"
                                  : "border-black bg-white text-black"
                              }`}
                            >
                              {index + 1}
                            </div>
                            <p className="mt-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white drop-shadow-lg">
                              {step}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-lg border-4 border-black bg-yellow-100 p-4 sm:p-5">
                      <p className="text-sm font-black uppercase tracking-widest text-black">Current Status</p>
                      <p className="mt-3 text-xl sm:text-2xl font-black text-rose-500 uppercase">{order.status}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border-4 border-black bg-white p-4 sm:p-5">
                    <p className="text-sm font-black uppercase tracking-widest text-rose-500">Delivery Info</p>
                    <ul className="mt-4 space-y-2 sm:space-y-3 text-sm">
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
        </section>
      </div>
    </main>
  );
}
