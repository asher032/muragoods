'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { NavBar } from '@/app/components/NavBar';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) setIsLoggedIn(true);
  }, []);

  const featuredProducts = [
    { name: 'Musubi', image: '/images/product-musubi.png', price: '₱40', desc: 'Regular / With Egg / With Flakes' },
    { name: 'Mini Churros', image: '/images/product-churros.png', price: '₱70', desc: 'Cinnamon Sugar / Option 2' },
    { name: 'Coffee Jelly', image: '/images/product-coffee-jelly.png', price: '₱15', desc: 'Classic / Premium' },
    { name: 'Cookies', image: '/images/product-cookies.png', price: '₱25', desc: 'Regular / Cookies & Cream' },
  ];

  const features = [
    { icon: '📅', title: 'Daily Check-In', desc: 'Log in daily to earn bonus coins!', link: '/play/checkin' },
    { icon: '👥', title: 'Refer a Friend', desc: 'Invite friends and earn 50 coins each!', link: '/play/refer' },
    { icon: '🏆', title: 'Leaderboard', desc: "See who's the top spender on campus!", link: '/leaderboard' },
    { icon: '🎁', title: 'Mystery Box', desc: 'Spend 10 coins for a chance to win big!', link: '/play/mysterybox' },
    { icon: '🧠', title: 'Trivia Challenge', desc: 'Test your knowledge and earn coins!', link: '/play/trivia' },
    { icon: '💌', title: 'Honey, If Only', desc: 'Write unsent letters to anyone!', link: '/honey' },
  ];

  return (
    <main className="mario-bg min-h-screen">
      <NavBar />

      {/* ─── Hero Section ────────────────────────────────────── */}
      <section className="px-4 pb-16 pt-12 sm:px-8">
        <div className="mario-container">
          <div className="mario-card p-8 sm:p-10 lg:p-12 text-center relative overflow-hidden">
            {/* Coin badge */}
            <div className="mb-6 inline-flex items-center gap-2 mario-badge mario-badge-gold">
              <span className="coin-float">🪙</span>
              <span>EARN 2X COINS ON TODAY&apos;S ORDERS!</span>
            </div>

            {/* Title */}
            <h1 className="mario-title text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-4">
              WELCOME TO<br />
              <span className="text-mario-yellow">MURAGOODS</span>
            </h1>

            {/* Subtitle */}
            <p className="text-mario-yellow font-arcade text-sm sm:text-base mb-3">
              MUSUBI · CHURROS · COFFEE JELLY · COOKIES
            </p>
            <p className="text-mario-text-muted text-base mb-8 max-w-lg mx-auto">
              Fuel your adventure with iconic campus treats and power-ups delivered straight to your door!
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <Link href="/menu" className="mario-btn mario-btn-primary mario-btn-lg">
                🍕 ORDER NOW
              </Link>
              {isLoggedIn ? (
                <Link href="/orders" className="mario-btn mario-btn-yellow mario-btn-lg">
                  📦 VIEW ORDERS
                </Link>
              ) : (
                <Link href="/login" className="mario-btn mario-btn-lg">
                  🎮 PLAY NOW
                </Link>
              )}
            </div>

            {/* Mario pixel art */}
            <div className="flex justify-center">
              <div className="relative w-32 h-32">
                <Image src="/images/hero-musubi.png" alt="Muragoods" fill className="object-contain" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Featured Power-Ups ──────────────────────────────── */}
      <section className="px-4 py-12 sm:px-8">
        <div className="mario-container">
          <div className="mb-8 text-center">
            <h2 className="mario-title text-xl sm:text-2xl lg:text-3xl">Featured Power-Ups</h2>
            <div className="h-0.5 w-24 bg-gradient-to-r from-transparent via-mario-yellow to-transparent mx-auto mt-4" />
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {featuredProducts.map((item) => (
              <div key={item.name} className="mario-card group">
                <div className="relative h-48 bg-mario-bg-light border-b border-white/5 overflow-hidden">
                  <Image src={item.image} alt={item.name} fill className="object-contain p-4 transition-transform group-hover:scale-110 duration-300" />
                </div>
                <div className="p-5">
                  <h3 className="font-arcade text-xs text-mario-yellow mb-2">{item.name}</h3>
                  <p className="text-xs text-mario-text-muted mb-4">{item.desc}</p>
                  <div className="flex items-center justify-between">
                    <span className="coin-price">{item.price}</span>
                    <Link href="/menu" className="mario-btn mario-btn-sm mario-btn-primary">+ ADD</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Power-Up Zone ──────────────────────────────────── */}
      <section className="px-4 py-12 sm:px-8">
        <div className="mario-container">
          <div className="text-center mb-8">
            <h2 className="mario-title text-xl sm:text-2xl lg:text-3xl">Power-Up Zone</h2>
            <p className="text-mario-text-muted text-sm mt-2">Play, earn coins, and climb the ranks!</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feat) => (
              <Link key={feat.title} href={feat.link} className="mario-card p-6 text-center hover:border-mario-yellow/30 transition-all group">
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">{feat.icon}</div>
                <h3 className="font-arcade text-xs text-mario-yellow mb-2">{feat.title}</h3>
                <p className="text-xs text-mario-text-muted">{feat.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-8 text-center">
        <p className="font-arcade text-[8px] text-mario-text-muted tracking-widest uppercase">
          © 2026 Muragoods — World 1-1 Food
        </p>
      </footer>
    </main>
  );
}
