"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoggedIn(true);
    }
  }, []);

  return (
    <main className="min-h-screen" style={{ background: 'linear-gradient(180deg, #E60012 0%, #c2000e 100%)' }}>
      <nav className="sticky top-0 z-50 bg-white border-b-4 border-black shadow-[0_4px_0px_0px_#000]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-12 w-12 rounded-full border-4 border-black bg-rose-400 flex items-center justify-center shadow-[4px_4px_0px_0px_#000] logo-badge">
              <span className="text-xl">🍙</span>
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-rose-500">Muragoods</p>
              <p className="text-xs font-bold uppercase tracking-widest text-black">World 1-1 Food</p>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-3 text-xs font-black uppercase">
            <Link href="/menu" className="mario-btn mario-btn-blue">Menu</Link>
            {isLoggedIn ? (
              <>
                <Link href="/orders" className="mario-btn mario-btn-yellow">Orders</Link>
                <button onClick={() => { localStorage.removeItem('user'); window.location.reload(); }} className="mario-btn bg-black text-white">Logout</button>
              </>
            ) : (
              <>
                <Link href="/login" className="mario-btn bg-black text-white">Login</Link>
                <Link href="/signup" className="mario-btn mario-btn-yellow">Sign Up</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="relative px-4 pb-12 pt-7 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="angled-divider charcoal-pattern relative border-4 border-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="text-white">
                <div className="mb-5 inline-flex border-4 border-black bg-yellow-400 px-6 py-3 text-sm font-black uppercase tracking-wider text-black shadow-[4px_4px_0px_0px_#000]">
                  ⭐ EARN 2X COINS ON TODAY&apos;S ORDERS! ⭐
                </div>
                <h1 className="max-w-xl text-6xl font-black leading-tight tracking-tighter text-white sm:text-7xl md:text-8xl" style={{ textShadow: '8px 8px 0px #000' }}>
                  WELCOME TO THE<br/>MUSHROOM KINGDOM<br/>EXPRESS!
                </h1>
                <p className="mt-5 max-w-xl text-xl font-black text-yellow-300" style={{ textShadow: '4px 4px 0px #000' }}>
                  🍙 MUSUBI • 🌭 CHURROS • ☕ COFFEE JELLY
                </p>
                <p className="mt-2 max-w-xl text-lg font-black text-white" style={{ textShadow: '2px 2px 0px #000' }}>
                  Fuel your adventure with iconic treats and power-ups delivered straight to your door!
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Link href="/menu" className="mario-btn mario-btn-yellow text-lg">
                    ORDER NOW &gt;
                  </Link>
                  {isLoggedIn ? (
                    <Link href="/orders" className="mario-btn mario-btn-blue text-lg">
                      VIEW ORDERS 📦
                    </Link>
                  ) : (
                    <Link href="/login" className="mario-btn mario-btn-blue text-lg">
                      PLAY NOW 🎮
                    </Link>
                  )}
                </div>
              </div>

              <div className="flex min-h-[420px] items-center justify-center">
                <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border-4 border-yellow-400 bg-white shadow-[8px_8px_0px_0px_#000] hero-3d-cutout">
                  <div className="bg-rose-400 p-4 border-b-4 border-black flex justify-between items-center">
                    <span className="text-white font-black">HIGH SCORE: ₱55</span>
                    <span className="animate-pulse text-yellow-300">✨ NEW!</span>
                  </div>
                  <div className="relative aspect-square w-full bg-white flex items-center justify-center">
                    <Image src="/images/mario-hero.png" alt="Mario Hero" fill className="object-contain p-4" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="absolute top-4 right-4 w-16 h-16 bg-yellow-400 border-4 border-black rounded-full flex items-center justify-center text-3xl coin-float z-10">🪙</div>
                  </div>
                  <div className="bg-black p-4 text-center">
                    <h3 className="text-2xl font-black text-white uppercase">SUPER MUSUBI</h3>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-8" style={{ background: 'linear-gradient(180deg, #E60012 0%, #c2000e 100%)' }}>
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter" style={{ textShadow: '6px 6px 0px #000' }}>Featured Power-Ups</h2>
            <div className="h-2 w-48 bg-yellow-400 mx-auto mt-4 border-2 border-black"></div>
          </div>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {[
              { name: "Musubi", icon: "🍙", price: "₱40", desc: "Regular / With Egg / With Flakes" },
              { name: "Mini Churros", icon: "🌭", price: "₱70", desc: "Option 1 / Option 2" },
              { name: "Coffee Jelly", icon: "☕", price: "₱15", desc: "Option 1 / Option 2" },
              { name: "Cookies", icon: "🍪", price: "₱25", desc: "Regular / Cookies and Cream" },
            ].map((item) => (
              <div key={item.name} className="menu-card">
                <div className="h-48 bg-blue-400 p-6 flex items-center justify-center text-8xl border-b-4 border-black relative overflow-hidden">
                  <span className="coin-float relative z-10">{item.icon}</span>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                </div>
                <div className="p-6 bg-white">
                  <h3 className="text-2xl font-black text-black uppercase">{item.name}</h3>
                  <p className="mt-2 text-sm font-bold text-slate-700">{item.desc}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-3xl font-black text-rose-500" style={{ textShadow: '2px 2px 0px #000' }}>{item.price}</span>
                    <Link href="/menu" className="mario-btn mario-btn-yellow">
                      + ADD
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
