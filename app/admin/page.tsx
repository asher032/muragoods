'use client';

import { adminCredentials, adminEmails, products, type InventoryStatus, type Order } from "@/app/lib/muragoods-data";
import { getAllOrders, updateOrderStatus, deleteOrder } from "@/app/lib/firebase-orders";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";


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
  const [orders, setOrders] = useState<(Order & { userId: string })[]>([]);
  const [catalog, setCatalog] = useState(products);
  const [alert, setAlert] = useState<{ show: boolean; message: string; orderId?: string }>({ show: false, message: "" });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Load orders when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated]);

  async function fetchOrders() {
    setLoading(true);
    const data = await getAllOrders();
    setOrders(data);
    setLoading(false);
  }

  // Real-time alert system
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(async () => {
      const data = await getAllOrders();
      if (data.length > orders.length) {
        const newOrder = data[0]; // Assuming newest is first or just different
        setAlert({ show: true, message: `🔔 NEW ORDER! ${newOrder.customer} - ₱${newOrder.total}`, orderId: newOrder.id });
        setOrders(data);
        setTimeout(() => setAlert({ show: false, message: "" }), 5000);
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

    // Restricted to specific emails
    if (!adminEmails.includes(email)) {
      setError("❌ UNAUTHORIZED! Only mhaxthedog@gmail.com and muragoods0@gmail.com have access.");
      return;
    }

    if (email === adminCredentials.email && password === adminCredentials.password) {
      setIsAuthenticated(true);
      setError("");
      return;
    }

    // If it's mhaxthedog, we need a way to verify password, but user provided specific credentials for muragoods0
    // For now, let's assume muragoods0 credentials are used for both admin roles for this script
    if (email === "mhaxthedog@gmail.com" && password === "Jesusmaryosepcasiram") {
      setIsAuthenticated(true);
      setError("");
      return;
    }

    setError("❌ Invalid Password.");
  };

  const handleStatusUpdate = async (orderId: string, nextStatus: string) => {
    try {
      await updateOrderStatus(orderId, nextStatus);
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status: nextStatus as any } : order,
        ),
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (confirm("Are you sure you want to remove this order?")) {
      try {
        await deleteOrder(orderId);
        setOrders(orders.filter(o => o.id !== orderId));
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
        {/* Real-time Alert Notification */}
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
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Details</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <tr key={order.id} className={`border-b-2 border-black ${idx % 2 === 0 ? 'bg-yellow-50' : 'bg-white'}`}>
                      <td className="px-4 py-3 font-black text-black">{order.id.slice(-5)}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-black">{order.customer}</div>
                        <div className="text-xs font-semibold text-slate-600">{order.address}</div>
                        <div className="text-xs font-black text-blue-600">{order.userId}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-black">{order.zone}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-black">₱{order.total}</div>
                        <div className="text-[10px] text-slate-500">{order.items.join(', ')}</div>
                        {order.gcashScreenshotUrl && (
                          <a href={order.gcashScreenshotUrl} target="_blank" className="text-xs font-black text-red-600 underline">View Receipt</a>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={order.status}
                          onChange={(event) => handleStatusUpdate(order.id, event.target.value)}
                          className="rounded-lg border-2 border-black bg-yellow-300 px-3 py-2 text-xs font-black uppercase tracking-wider text-black outline-none focus:bg-yellow-400"
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
                          onClick={() => handleDeleteOrder(order.id)}
                          className="rounded bg-red-600 p-2 text-white font-black hover:bg-red-700"
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
