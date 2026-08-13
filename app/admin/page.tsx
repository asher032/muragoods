'use client';

import { adminCredentials, mockOrders, products, type InventoryStatus } from "@/app/lib/muragoods-data";
import { useMemo, useState } from "react";

const statusOptions = [
  "Pending Payment",
  "Payment Verified",
  "Preparing",
  "Out for Delivery",
  "Delivered",
] as const;

const inventoryCycle: InventoryStatus[] = [
  "In Stock",
  "Out of Stock",
  "Pre-Order Only",
];

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState(adminCredentials.email);
  const [password, setPassword] = useState(adminCredentials.password);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState(mockOrders);
  const [catalog, setCatalog] = useState(products);

  const summary = useMemo(() => {
    const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
    const pending = orders.filter((order) => order.status === "Pending Payment").length;
    const preparing = orders.filter((order) => order.status === "Preparing").length;
    return { totalSales, pending, preparing };
  }, [orders]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();

    if (email === adminCredentials.email && password === adminCredentials.password) {
      setIsAuthenticated(true);
      setError("");
      return;
    }

    setError("Invalid admin credentials. Use the default Muragoods admin account.");
  };

  const updateOrderStatus = (orderId: string, nextStatus: string) => {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, status: nextStatus as typeof order.status } : order,
      ),
    );
  };

  const toggleInventory = (productId: string) => {
    setCatalog((current) =>
      current.map((product) => {
        if (product.id !== productId) return product;

        const nextIndex =
          (inventoryCycle.indexOf(product.inventory) + 1) % inventoryCycle.length;

        return {
          ...product,
          inventory: inventoryCycle[nextIndex],
        };
      }),
    );
  };

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fff6eb,_#f9d580_35%,_#7c3f1d_100%)] px-4">
        <div className="w-full max-w-md rounded-[32px] border border-orange-200 bg-white/85 p-8 shadow-[0_30px_80px_rgba(84,48,11,0.18)] backdrop-blur">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-orange-500">Admin Portal</p>
          <h1 className="mt-3 text-4xl font-black text-slate-900">Muragoods</h1>
          <p className="mt-2 text-sm text-slate-500">Secure dashboard access</p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-0 transition focus:border-orange-400"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-0 transition focus:border-orange-400"
              />
            </label>

            {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

            <button
              type="submit"
              className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-700"
            >
              Enter Dashboard
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 rounded-[28px] bg-slate-900 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.25)] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-orange-300">Admin</p>
            <h1 className="mt-2 text-3xl font-black">Muragoods Dashboard</h1>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthenticated(false)}
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-orange-100"
          >
            Log Out
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Today&apos;s sales</p>
            <p className="mt-2 text-3xl font-black text-slate-900">₱{summary.totalSales}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Pending</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{summary.pending}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Preparing</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{summary.preparing}</p>
          </div>
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">Live Order Feed</h2>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4 font-semibold">Order</th>
                    <th className="pb-3 pr-4 font-semibold">Customer</th>
                    <th className="pb-3 pr-4 font-semibold">Zone</th>
                    <th className="pb-3 pr-4 font-semibold">Payment</th>
                    <th className="pb-3 pr-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-t border-slate-200 align-top">
                      <td className="py-3 pr-4 font-bold text-slate-800">{order.id}</td>
                      <td className="py-3 pr-4">
                        <div className="font-semibold">{order.customer}</div>
                        <div className="text-xs text-slate-500">{order.address}</div>
                      </td>
                      <td className="py-3 pr-4">{order.zone}</td>
                      <td className="py-3 pr-4">{order.payment}</td>
                      <td className="py-3 pr-4">
                        <select
                          value={order.status}
                          onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 outline-none focus:border-orange-400"
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[28px] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">Inventory Control</h2>
            <div className="mt-5 space-y-3">
              {catalog.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div>
                    <p className="font-bold text-slate-800">{product.name}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{product.inventory}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleInventory(product.id)}
                    className="rounded-full bg-orange-500 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-orange-400"
                  >
                    Update
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
