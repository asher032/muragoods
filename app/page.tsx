'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { NavBar } from '@/app/components/NavBar';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      setIsLoggedIn(true);
    }
  }, []);

  const featuredProducts = [
    { name: 'Musubi', image: '/images/product-musubi.png', price: '₱40', desc: 'Regular / With Egg / With Flakes' },
    { name: 'Mini Churros', image: '/images/product-churros.png', price: '₱70', desc: 'Cinnamon Sugar / Option 2' },
    { name: 'Coffee Jelly', image: '/images/product-coffee-jelly.png', price: '₱15', desc: 'Classic / Premium' },
    { name: 'Cookies', image: '/images/product-cookies.png', price: '₱25', desc: 'Regular / Cookies & Cream' },
  ];

  return (
    <main className="min-h-screen">
      <NavBar />

      {/* ─── Hero Section ────────────────────────────────────── */}
      <section className="px-4 pb-16 pt-10 sm:px-8">
        <div className="deco-container">
          <div className="deco-hero deco-noise relative p-6 sm:p-8 lg:p-10">
            {/* Top ziggurat accent */}
            <div className="deco-zig-top" />

            <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              {/* Left: Copy */}
              <div>
                {/* Coin Bonus Badge */}
                <div
                  className="mb-6 inline-flex items-center gap-2 border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] px-5 py-3"
                  style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', letterSpacing: '0.12em' }}
                >
                  <span className="coin-float inline-block">🪙</span>
                  <span className="text-[var(--gold-bright)]">EARN 2X COINS ON TODAY&apos;S ORDERS!</span>
                </div>

                {/* Title */}
                <h1
                  className="max-w-xl text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.15] text-[var(--cream)]"
                  style={{
                    fontFamily: 'var(--font-arcade)',
                    textShadow: '4px 4px 0px var(--gold-dark)',
                  }}
                >
                  WELCOME TO<br />
                  <span className="text-[var(--gold-bright)]">MURAGOODS</span>
                </h1>

                {/* Subtitle */}
                <p
                  className="mt-5 max-w-xl text-lg sm:text-xl font-semibold text-[var(--gold)]"
                  style={{ fontFamily: 'var(--font-body)', textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}
                >
                  MUSUBI · CHURROS · COFFEE JELLY
                </p>

                <p
                  className="mt-3 max-w-xl text-base text-[var(--cream-muted)]"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  Fuel your adventure with iconic campus treats and power-ups delivered straight to your door!
                </p>

                {/* CTA Buttons */}
                <div className="mt-8 flex flex-wrap gap-4">
                  <Link href="/menu" className="deco-btn deco-btn-lg deco-btn-gold">
                    ORDER NOW →
                  </Link>
                  {isLoggedIn ? (
                    <Link href="/orders" className="deco-btn deco-btn-lg deco-btn-crimson">
                      VIEW ORDERS
                    </Link>
                  ) : (
                    <Link href="/login" className="deco-btn deco-btn-lg">
                      PLAY NOW
                    </Link>
                  )}
                </div>
              </div>

              {/* Right: Featured Item Card */}
              <div className="flex min-h-[340px] sm:min-h-[400px] items-center justify-center">
                <div className="relative w-full max-w-sm border-2 border-[var(--gold)] bg-[var(--charcoal)] overflow-hidden transition-all hover:shadow-[0_0_30px_rgba(212,175,55,0.3)]">
                  {/* Top bar */}
                  <div className="flex justify-between items-center border-b-2 border-[var(--gold)] bg-[var(--charcoal-light)] px-5 py-3">
                    <span
                      className="text-[var(--gold-bright)] text-[9px] uppercase tracking-wider"
                      style={{ fontFamily: 'var(--font-arcade)' }}
                    >
                      HIGH SCORE: ₱55
                    </span>
                    <span
                      className="pulse-glow text-[var(--gold-bright)] text-[8px] border border-[var(--gold)] px-2 py-1"
                      style={{ fontFamily: 'var(--font-arcade)' }}
                    >
                      NEW!
                    </span>
                  </div>

                  {/* Image area */}
                  <div className="relative aspect-square w-full bg-[var(--charcoal-light)] flex items-center justify-center">
                    <Image
                      src="/images/hero-musubi.png"
                      alt="Hero Musubi"
                      fill
                      className="object-contain p-6"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />

                    {/* Floating Coin */}
                    <div className="absolute top-4 right-4 w-14 h-14 coin-float z-10">
                      <div className="w-14 h-14 bg-gradient-to-br from-[var(--gold)] to-[var(--gold-dark)] border-2 border-[var(--gold-bright)] flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.4)]">
                        <span
                          className="text-lg text-[var(--obsidian)]"
                          style={{ fontFamily: 'var(--font-arcade)' }}
                        >
                          M
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom bar */}
                  <div className="border-t-2 border-[var(--gold)] bg-[var(--obsidian)] p-4 text-center">
                    <h3
                      className="text-sm text-[var(--gold-bright)] uppercase"
                      style={{ fontFamily: 'var(--font-arcade)' }}
                    >
                      SUPER MUSUBI
                    </h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom ziggurat accent */}
            <div className="deco-zig-bottom" />
          </div>
        </div>
      </section>

      {/* ─── Featured Power-Ups ──────────────────────────────── */}
      <section className="px-4 py-12 sm:px-8">
        <div className="deco-container">
          {/* Section Header */}
          <div className="mb-12 text-center">
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase"
              style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}
            >
              Featured Power-Ups
            </h2>
            <div className="h-[2px] w-40 bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent mx-auto mt-4" />
          </div>

          {/* Product Grid */}
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {featuredProducts.map((item) => (
              <div key={item.name} className="power-card group">
                {/* Image Area */}
                <div className="relative h-48 bg-[var(--charcoal-light)] border-b-2 border-[rgba(212,175,55,0.3)] overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-contain p-3 transition-transform group-hover:scale-110 duration-300"
                  />
                  {/* Gold top-line accent on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--obsidian)] via-transparent to-transparent opacity-60" />
                </div>

                {/* Card Body */}
                <div className="p-5">
                  <h3
                    className="text-xs text-[var(--cream)] uppercase mb-2"
                    style={{ fontFamily: 'var(--font-arcade)' }}
                  >
                    {item.name}
                  </h3>
                  <p className="text-sm text-[var(--pewter)] mb-4 leading-relaxed">
                    {item.desc}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="coin-price">{item.price}</span>
                    <Link href="/menu" className="deco-btn deco-btn-sm deco-btn-gold">
                      + ADD
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer Accent ───────────────────────────────────── */}
      <footer className="border-t border-[rgba(212,175,55,0.15)] py-8 text-center">
        <p
          className="text-[8px] text-[var(--pewter)] uppercase tracking-[0.2em]"
          style={{ fontFamily: 'var(--font-arcade)' }}
        >
          © 2026 Muragoods — World 1-1 Food
        </p>
      </footer>
    </main>
  );
}
