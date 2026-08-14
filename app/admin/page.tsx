'use client';

import { adminCredentials, adminEmails, products, type InventoryStatus, type Order, type OrderStatus } from "@/app/lib/muragoods-data";
import { useMemo, useState, useEffect, useCallback } from "react";

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<(Order & { userId: string; _id?: string })[]>([]);
  const [catalog, setCatalog] = useState(products);
  const [alert, setAlert] = useState<{ show: boolean; message: string; orderId?: string }>({ show: false, message: "" });
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?isAdmin=true');
      const result = await res.json();
      if (result.success) {
        setOrders(result.data);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/orders?isAdmin=true');
        const result = await res.json();
        if (result.success) {
          if (result.data.length > orders.length) {
            const newOrder = result.data[0];
            setAlert({ show: true, message: `🔔 NEW ORDER! ${newOrder.customer} - ₱${newOrder.total}`, orderId: newOrder._id || newOrder.id });
            setOrders(result.data);
            setTimeout(() => setAlert({ show: false, message: "" }), 5000);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isAuthenticated, orders.length]);

  const summary = useMemo(() => {
    const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
    const pending = orders.filter((order) => order.status === "Pending Payment").length;
    const preparing = orders.filter((order) => order.status === "Preparing").length;
    return { totalSales, pending, preparing };
  }, [orders]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();

    if (!adminEmails.includes(email)) {
      setError("❌ UNAUTHORIZED! Only authorized admin accounts have access.");
      return;
    }

    if (email === adminCredentials.email && password === adminCredentials.password) {
      setIsAuthenticated(true);
      setError("");
      fetchOrders();
      return;
    }

    if (email === "mhaxthedog@gmail.com" && password === "Jesusmaryosepcasiram") {
      setIsAuthenticated(true);
      setError("");
      fetchOrders();
      return;
    }

    setError("❌ Invalid Password.");
  };

  const handleStatusUpdate = async (orderId: string, nextStatus: string) => {
    try {
      const res = await fetch(`/api/orders?id=${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await res.json();
      if (result.success) {
        setOrders((current) =>
          current.map((order) =>
            (order._id || order.id) === orderId ? { ...order, status: nextStatus as OrderStatus } : order,
          ),
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (confirm("Are you sure you want to remove this order?")) {
      try {
        const res = await fetch(`/api/orders?id=${orderId}`, {
          method: 'DELETE',
        });
        const result = await res.json();
        if (result.success) {
          setOrders(orders.filter(o => (o._id || o.id) !== orderId));
        }
      } catch (err) {
        console.error(err);
      }
    }
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
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(135deg, #121212 0%, #1a1a1a 100%)' }}>
        <div className="w-full max-w-md rounded-2xl border-4 border-black bg-white p-8 shadow-2xl">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-yellow-300 bg-rose-400 text-2xl font-black text-white shadow-lg">
              A
            </div>
            <p className="text-sm font-black uppercase tracking-widest text-yellow-300">Admin Portal</p>
          </div>

          <h1 className="text-3xl font-black text-black text-center uppercase mb-2">Admin Login</h1>
          <p className="text-sm font-bold text-slate-700 text-center mb-6">Muragoods Secure Access</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block text-sm font-black text-black uppercase">
              Admin Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mario-input mt-2 bg-yellow-50 focus:bg-white"
              />
            </label>

            <label className="block text-sm font-black text-black uppercase">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mario-input mt-2 bg-yellow-50 focus:bg-white"
              />
            </label>

            {error ? (
              <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-3 text-sm font-black text-rose-600 uppercase">
                ⚠️ {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="mario-btn mario-btn-black w-full uppercase font-black text-lg tracking-widest mt-6"
            >
              🔐 ENTER DASHBOARD
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8" style={{ background: 'linear-gradient(180deg, #E60012 0%, #c2000e 100%)' }}>
      <div className="mx-auto max-w-7xl">
        {alert.show && (
          <div className="mb-8 rounded-lg border-4 border-yellow-300 bg-yellow-300 p-4 text-lg font-black text-black shadow-2xl animate-pulse">
            {alert.message}
          </div>
        )}

        <header className="mb-8 flex flex-col gap-4 rounded-lg bg-black border-4 border-yellow-300 p-6 text-white shadow-2xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-yellow-300">🎮 Admin</p>
            <h1 className="mt-2 text-4xl font-black text-white uppercase tracking-wide">Muragoods Dashboard</h1>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthenticated(false)}
            className="mario-btn bg-rose-400 text-yellow-300 border-yellow-300 hover:bg-rose-500 uppercase font-black"
          >
            🚪 LOG OUT
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="mario-card p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-rose-500">💰 Today&apos;s Sales</p>
            <p className="mt-3 text-4xl font-black text-black">₱{summary.totalSales}</p>
          </div>
          <div className="mario-card p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-rose-500">⏳ Pending</p>
            <p className="mt-3 text-4xl font-black text-black">{summary.pending}</p>
          </div>
          <div className="mario-card p-6 shadow-xl">
            <p className="text-sm font-black uppercase tracking-widest text-rose-500">🍳 Preparing</p>
            <p className="mt-3 text-4xl font-black text-black">{summary.preparing}</p>
          </div>
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="mario-card p-6 shadow-xl">
            <h2 className="text-2xl font-black text-black uppercase tracking-wider">📋 Live Order Feed</h2>

            <div className="mt-6 overflow-x-auto rounded-lg border-4 border-black">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Order</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Zone</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Delivery Pin</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Details</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <tr key={order._id || order.id} className={`border-b-2 border-black ${idx % 2 === 0 ? 'bg-yellow-50' : 'bg-white'}`}>
                      <td className="px-4 py-3 font-black text-black">{(order._id || order.id).slice(-5)}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-black">{order.customer}</div>
                        <div className="text-xs font-semibold text-slate-600">{order.address}</div>
                        <div className="text-xs font-black text-blue-600">{order.userId}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-black">{order.zone}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-black">📍 {order.latitude}, {order.longitude}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-black">₱{order.total}</div>
                        <div className="text-[10px] text-slate-500">{order.items.join(', ')}</div>
                        {order.gcashScreenshotUrl && (
                          <button
                            onClick={() => setPreviewReceipt(order.gcashScreenshotUrl || null)}
                            className="text-xs font-black text-rose-500 underline"
                          >
                            View Receipt
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={order.status}
                          onChange={(event) => handleStatusUpdate(order._id || order.id, event.target.value)}
                          className="mario-input rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider"
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteOrder(order._id || order.id)}
                          className="rounded bg-rose-400 p-2 text-white font-black hover:bg-rose-500"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mario-card p-6 shadow-xl">
            <h2 className="text-2xl font-black text-black uppercase tracking-wider">📦 Inventory Control</h2>
            <div className="mt-6 space-y-3">
              {catalog.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-lg border-4 border-black bg-yellow-50 p-4"
                >
                  <div>
                    <p className="font-black text-black text-lg">{product.name}</p>
                    <p className="text-xs font-black uppercase tracking-wider text-rose-500">{product.inventory}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleInventory(product.id)}
                    className="mario-btn mario-btn-black border-black hover:bg-slate-900 uppercase font-black"
                  >
                    Update
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {previewReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setPreviewReceipt(null)}>
          <div className="mario-card max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-black p-4 border-b-4 border-black flex items-center justify-between">
              <h3 className="text-xl font-black text-yellow-300 uppercase">Payment Receipt</h3>
              <button
                onClick={() => setPreviewReceipt(null)}
                className="text-white text-2xl font-black hover:text-rose-400"
              >
                ×
              </button>
            </div>
            <div className="p-4 bg-white">
              <img
                src={previewReceipt}
                alt="Payment Receipt"
                className="w-full h-auto rounded-lg border-4 border-black"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
