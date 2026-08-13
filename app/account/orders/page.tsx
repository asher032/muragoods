'use client';

import { mockOrders, type OrderStatus } from "@/app/lib/muragoods-data";
import { useState } from "react";

const statusFlow: OrderStatus[] = [
  "Pending Payment",
  "Payment Verified",
  "Preparing",
  "Out for Delivery",
  "Delivered",
];

export default function AccountOrdersPage() {
  const [orders, setOrders] = useState(mockOrders);

  const reorder = (orderId: string) => {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? { ...order, status: "Pending Payment" }
          : order,
      ),
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-red-600 to-red-700 px-4 py-8 text-black sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 rounded-lg border-4 border-black bg-white p-6 shadow-2xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-red-600">
              📦 My Orders
            </p>
            <h1 className="mt-2 text-4xl font-black text-black uppercase tracking-wider">Muragoods Account</h1>
          </div>
          <a
            href="/"
            className="mario-btn bg-black text-yellow-300 hover:bg-slate-900 uppercase font-black border-black"
          >
            ← Back to Shop
          </a>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          <div className="rounded-lg border-4 border-black bg-white p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-red-600">📋 Total Orders</p>
            <p className="mt-3 text-4xl font-black text-black">{orders.length}</p>
          </div>
          <div className="rounded-lg border-4 border-black bg-white p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-red-600">🍳 Preparing</p>
            <p className="mt-3 text-4xl font-black text-black">
              {orders.filter((order) => order.status === "Preparing").length}
            </p>
          </div>
          <div className="rounded-lg border-4 border-black bg-white p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-red-600">🚗 Out for Delivery</p>
            <p className="mt-3 text-4xl font-black text-black">
              {orders.filter((order) => order.status === "Out for Delivery").length}
            </p>
          </div>
        </section>

        <section className="mt-8 space-y-6">
          {orders.map((order) => {
            const currentIndex = statusFlow.indexOf(order.status);

            return (
              <article
                key={order.id}
                className="rounded-lg border-4 border-black bg-white p-6 shadow-2xl"
              >
                <div className="flex flex-col gap-5 border-b-4 border-black pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest text-red-600">
                      {order.id}
                    </p>
                    <h2 className="mt-2 text-3xl font-black text-black uppercase">
                      {order.customer}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-lg border-2 border-black bg-yellow-300 px-4 py-2 text-xs font-black uppercase tracking-widest text-black">
                      📍 {order.zone}
                    </span>
                    <span className="rounded-lg border-2 border-black bg-black px-4 py-2 text-xs font-black uppercase tracking-widest text-yellow-300">
                      💳 {order.payment}
                    </span>
                    <button
                      type="button"
                      onClick={() => reorder(order.id)}
                      className="mario-btn bg-red-600 text-yellow-300 hover:bg-red-700 uppercase font-black border-black"
                    >
                      🔄 Re-Order
                    </button>
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
                                  ? "border-black bg-red-600 text-white shadow-lg"
                                  : "border-black bg-white text-black"
                              }`}
                            >
                              {index + 1}
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
                      <p className="mt-3 text-2xl font-black text-red-600 uppercase">{order.status}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border-4 border-black bg-white p-5">
                    <p className="text-sm font-black uppercase tracking-widest text-red-600">📮 Delivery Info</p>
                    <ul className="mt-4 space-y-3 text-sm">
                      <li className="font-bold text-black">📍 <span className="font-black text-red-600">{order.address}</span></li>
                      <li className="font-bold text-black">📞 <span className="font-black text-red-600">{order.phone}</span></li>
                      <li className="font-bold text-black">🚚 <span className="font-black text-red-600">{order.deliveryType}</span></li>
                      <li className="font-bold text-black text-lg">💰 <span className="font-black text-red-600">₱{order.total}</span></li>
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
