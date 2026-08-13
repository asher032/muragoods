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
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-red-600 to-red-700 px-4">
        <div className="w-full max-w-md rounded-lg border-4 border-black bg-white p-8 shadow-2xl">
          <div className="diagonal-stripes rounded-lg p-6 mb-8 text-center relative">
            <div className="relative flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-yellow-300 bg-red-600 text-4xl font-black text-white shadow-lg">
                M
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-yellow-300">Admin Portal</p>
            </div>
          </div>

          <h1 className="text-4xl font-black text-black text-center uppercase mb-2">🎮 Dashboard 🎮</h1>
          <p className="text-sm font-bold text-slate-700 text-center mb-6">Muragoods Secure Access</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block text-sm font-black text-black uppercase">
              Admin Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none transition focus:border-red-600 focus:bg-white"
              />
            </label>

            <label className="block text-sm font-black text-black uppercase">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none transition focus:border-red-600 focus:bg-white"
              />
            </label>

            {error ? (
              <div className="rounded-lg border-4 border-red-600 bg-red-100 p-3 text-sm font-black text-red-700 uppercase">
                ⚠️ {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="mario-btn w-full bg-black text-yellow-300 hover:bg-slate-900 uppercase font-black text-lg tracking-widest mt-6"
            >
              🔐 ENTER DASHBOARD
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-red-600 to-red-700 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 rounded-lg bg-black border-4 border-yellow-300 p-6 text-white shadow-2xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-yellow-300">🎮 Admin</p>
            <h1 className="mt-2 text-4xl font-black text-white uppercase tracking-wide">Muragoods Dashboard</h1>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthenticated(false)}
            className="mario-btn bg-red-600 text-yellow-300 border-yellow-300 hover:bg-red-700 uppercase font-black"
          >
            🚪 LOG OUT
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border-4 border-black bg-white p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-red-600">💰 Today's Sales</p>
            <p className="mt-3 text-4xl font-black text-black">₱{summary.totalSales}</p>
          </div>
          <div className="rounded-lg border-4 border-black bg-white p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-red-600">⏳ Pending</p>
            <p className="mt-3 text-4xl font-black text-black">{summary.pending}</p>
          </div>
          <div className="rounded-lg border-4 border-black bg-white p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-red-600">🍳 Preparing</p>
            <p className="mt-3 text-4xl font-black text-black">{summary.preparing}</p>
          </div>
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-lg border-4 border-black bg-white p-6 shadow-xl">
            <h2 className="text-2xl font-black text-black uppercase tracking-wider">📋 Live Order Feed</h2>

            <div className="mt-6 overflow-x-auto rounded-lg border-4 border-black">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Order</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Zone</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Payment</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <tr key={order.id} className={`border-b-2 border-black ${idx % 2 === 0 ? 'bg-yellow-50' : 'bg-white'}`}>
                      <td className="px-4 py-3 font-black text-black">{order.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-black">{order.customer}</div>
                        <div className="text-xs font-semibold text-slate-600">{order.address}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-black">{order.zone}</td>
                      <td className="px-4 py-3 font-bold text-black">{order.payment}</td>
                      <td className="px-4 py-3">
                        <select
                          value={order.status}
                          onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                          className="rounded-lg border-2 border-black bg-yellow-300 px-3 py-2 text-xs font-black uppercase tracking-wider text-black outline-none focus:bg-yellow-400"
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

          <div className="rounded-lg border-4 border-black bg-white p-6 shadow-xl">
            <h2 className="text-2xl font-black text-black uppercase tracking-wider">📦 Inventory Control</h2>
            <div className="mt-6 space-y-3">
              {catalog.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-lg border-4 border-black bg-yellow-50 p-4"
                >
                  <div>
                    <p className="font-black text-black text-lg">{product.name}</p>
                    <p className="text-xs font-black uppercase tracking-wider text-red-600">{product.inventory}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleInventory(product.id)}
                    className="mario-btn bg-black text-yellow-300 border-black hover:bg-slate-900 uppercase font-black"
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
