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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ea,_#fdf2d4_30%,_#f6d58a_100%)] px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 rounded-[28px] border border-orange-200 bg-white/70 p-5 shadow-[0_20px_60px_rgba(116,72,18,0.15)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-orange-500">
              My Orders
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Muragoods Account</h1>
          </div>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-700"
          >
            Continue Shopping
          </a>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Total Orders</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{orders.length}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Currently Preparing</p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {orders.filter((order) => order.status === "Preparing").length}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Out for Delivery</p>
            <p className="mt-2 text-3xl font-black text-slate-900">
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
                className="rounded-[28px] border border-orange-100 bg-white p-5 shadow-[0_20px_50px_rgba(60,35,10,0.08)]"
              >
                <div className="flex flex-col gap-5 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-500">
                      {order.id}
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-slate-900">
                      {order.customer}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
                      {order.zone}
                    </span>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                      {order.payment}
                    </span>
                    <button
                      type="button"
                      onClick={() => reorder(order.id)}
                      className="rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-amber-300"
                    >
                      Re-Order
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
                  <div>
                    <div className="mb-4 grid gap-2 sm:grid-cols-5">
                      {statusFlow.map((step, index) => {
                        const active = index <= currentIndex;
                        return (
                          <div key={step} className="relative">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-black ${
                                active
                                  ? "border-orange-500 bg-orange-500 text-white"
                                  : "border-slate-200 bg-slate-100 text-slate-400"
                              }`}
                            >
                              {index + 1}
                            </div>
                            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                              {step}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Current status</p>
                      <p className="mt-2 text-xl font-black text-slate-900">{order.status}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-orange-50 p-4">
                    <p className="text-sm text-slate-500">Delivery info</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      <li><span className="font-bold">Address:</span> {order.address}</li>
                      <li><span className="font-bold">Phone:</span> {order.phone}</li>
                      <li><span className="font-bold">Type:</span> {order.deliveryType}</li>
                      <li><span className="font-bold">Total:</span> ₱{order.total}</li>
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
