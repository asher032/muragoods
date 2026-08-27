'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { NavBar } from '@/app/components/NavBar';
import dynamic from 'next/dynamic';

const LightBloom = dynamic(() => import('@/app/components/ui/LightBloom'), { ssr: false });
const MaskedHeading = dynamic(() => import('@/app/components/ui/MaskedHeading'), { ssr: false });
const AnimatedButton = dynamic(() => import('@/app/components/ui/AnimatedButton'), { ssr: false });

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

  return (
    <main className="mario-bg min-h-screen">
      <NavBar />

      {/* ─── Hero Section with LightBloom ──────────────────── */}
      <section className="relative overflow-hidden" style={{ minHeight: '70vh' }}>
        {/* LightBloom Background */}
        <div className="absolute inset-0 z-0">
          <LightBloom
            variant="shafts"
            direction="bottom"
            background="#0a0a18"
            baseColor="#ffd60a"
            accentColor="#ffe066"
            speed={80}
            hover={120}
            light={{ rise: 65, spread: 80 }}
            shafts={{ count: 20, amount: 60, drift: 70 }}
            finish={{ grain: 8, vignette: 30 }}
          />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 px-4 pt-20 pb-16 sm:px-8">
          <div className="mario-container text-center">
            {/* Coin badge */}
            <div className="mb-8 inline-flex items-center gap-2 mario-badge mario-badge-gold">
              <span className="coin-float">🪙</span>
              <span>EARN 2X COINS ON TODAY&apos;S ORDERS!</span>
            </div>

            {/* Masked Heading */}
            <div className="mb-6">
              <MaskedHeading
                text="WELCOME TO MURAGOODS"
                tag="h1"
                mediaType="image"
                src="/images/hero-musubi.png"
                fillScale={1.3}
                parallax={30}
                drift={15}
                brightness={1.2}
                saturation={1.1}
                reveal="rise"
                trigger="view"
                duration={1.2}
                stagger={0.08}
                align="center"
                weight={900}
                tracking={-0.02}
                textScale={0.08}
                style={{ color: 'transparent' }}
              />
            </div>

            {/* Subtitle */}
            <p className="text-mario-yellow font-arcade text-sm sm:text-base mb-3">
              MUSUBI · CHURROS · COFFEE JELLY · COOKIES
            </p>
            <p className="text-mario-text-muted text-base mb-8 max-w-lg mx-auto">
              Fuel your adventure with iconic campus treats and power-ups delivered straight to your door!
            </p>

            {/* Animated Buttons */}
            <div className="flex flex-wrap justify-center gap-4 mb-12">
              <Link href="/menu">
                <AnimatedButton
                  className="px-8 py-3 font-arcade text-sm"
                  style={{ background: 'rgba(6,214,160,0.15)', borderColor: 'rgba(6,214,160,0.3)', color: '#06d6a0' }}
                >
                  🍕 ORDER NOW
                </AnimatedButton>
              </Link>
              {isLoggedIn ? (
                <Link href="/orders">
                  <AnimatedButton
                    className="px-8 py-3 font-arcade text-sm"
                    style={{ background: 'rgba(255,214,10,0.15)', borderColor: 'rgba(255,214,10,0.3)', color: '#ffd60a' }}
                  >
                    📦 VIEW ORDERS
                  </AnimatedButton>
                </Link>
              ) : (
                <Link href="/login">
                  <AnimatedButton
                    className="px-8 py-3 font-arcade text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#e8e8f0' }}
                  >
                    🎮 PLAY NOW
                  </AnimatedButton>
                </Link>
              )}
            </div>

            {/* Logo */}
            <div className="flex justify-center">
              <div className="relative w-48 h-48 sm:w-56 sm:h-56">
                <Image src="/images/muragoods-logo.png" alt="Muragoods" fill className="object-contain drop-shadow-[0_0_30px_rgba(255,214,10,0.3)]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Quick Highlights ──────────────────────────────── */}
      <section className="px-4 py-8 sm:px-8">
        <div className="mario-container">
          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/menu" className="stagger-1">
              <div className="highlight-card" style={{ background: 'linear-gradient(135deg, rgba(6,214,160,0.12), rgba(255,214,10,0.08))' }}>
                <div className="highlight-content">
                  <span style={{ fontSize: '40px', marginBottom: '12px' }} className="float-anim">🍕</span>
                  <h3 className="font-arcade text-sm text-mario-yellow mb-1">ORDER NOW</h3>
                  <p className="text-xs text-mario-text-muted mb-3">Browse our full food menu — Musubi, Churros, Coffee Jelly, Cookies & more!</p>
                  <span className="font-arcade text-[9px] text-emerald-400" style={{ letterSpacing: '0.1em' }}>EXPLORE →</span>
                </div>
              </div>
            </Link>
            <Link href="/untold-words" className="stagger-2">
              <div className="highlight-card" style={{ background: 'linear-gradient(135deg, rgba(123,47,247,0.12), rgba(255,100,150,0.08))' }}>
                <div className="highlight-content">
                  <span style={{ fontSize: '40px', marginBottom: '12px' }} className="float-anim">✉️</span>
                  <h3 className="font-arcade text-sm text-mario-yellow mb-1">UNTOLD WORDS</h3>
                  <p className="text-xs text-mario-text-muted mb-3">Some things are easier to say through a letter, a confession, or a song.</p>
                  <span className="font-arcade text-[9px]" style={{ color: '#c896ff', letterSpacing: '0.1em' }}>EXPLORE NOW →</span>
                </div>
              </div>
            </Link>
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
                    <Link href="/menu">
                      <AnimatedButton
                        className="px-4 py-2 font-arcade text-[9px]"
                        style={{ background: 'rgba(6,214,160,0.15)', borderColor: 'rgba(6,214,160,0.3)', color: '#06d6a0' }}
                      >
                        + ADD
                      </AnimatedButton>
                    </Link>
                  </div>
                </div>
              </div>
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
