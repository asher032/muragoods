'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef, useMemo } from 'react';
import { NavBar } from '@/app/components/NavBar';
import dynamic from 'next/dynamic';
import { useScrollPosition, useScrollReveal, useMousePosition, useElementMouse, useCountUp } from '@/app/components/useScrollEffects';
import { Icon } from '@/app/components/Icon';

const LightBloom = dynamic(() => import('@/app/components/ui/LightBloom'), { ssr: false });
const MaskedHeading = dynamic(() => import('@/app/components/ui/MaskedHeading'), { ssr: false });
const AnimatedButton = dynamic(() => import('@/app/components/ui/AnimatedButton'), { ssr: false });

/* ─── Scroll Reveal Wrapper ─────────────────────────────── */
function Reveal({ children, className = '', delay = 0, direction = 'up' }: {
  children: React.ReactNode; className?: string; delay?: number;
  direction?: 'up' | 'left' | 'right' | 'scale';
}) {
  const { ref, visible } = useScrollReveal();
  const dirClass = direction === 'left' ? 'scroll-reveal-left'
    : direction === 'right' ? 'scroll-reveal-right'
    : direction === 'scale' ? 'scroll-reveal-scale'
    : 'scroll-reveal';
  return (
    <div ref={ref} className={`${dirClass} ${visible ? 'visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}s` }}>
      {children}
    </div>
  );
}

/* ─── Floating Particles Background ─────────────────────── */
function Particles({ count = 20 }: { count?: number }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    size: 2 + Math.random() * 4,
    duration: 15 + Math.random() * 25,
    delay: Math.random() * 20,
    opacity: 0.1 + Math.random() * 0.3,
    color: ['#ffd60a', '#06d6a0', '#4895ef', '#e63946', '#7209b7'][Math.floor(Math.random() * 5)],
  })), [count]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {particles.map(p => (
        <div key={p.id} className="particle" style={{
          left: p.left,
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: p.color,
          opacity: p.opacity,
          animation: `particleFloat ${p.duration}s linear ${p.delay}s infinite`,
          filter: `blur(${p.size > 4 ? 1 : 0}px)`,
        }} />
      ))}
    </div>
  );
}

/* ─── Scroll Progress Bar ───────────────────────────────── */
function ScrollProgress({ percent }: { percent: number }) {
  return <div className="scroll-progress" style={{ width: `${percent}%` }} />;
}

/* ─── Scroll-Down Indicator ─────────────────────────────── */
function ScrollDown({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="scroll-indicator absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 opacity-70">
      <span className="font-arcade text-[7px] text-mario-text-muted tracking-widest uppercase">Scroll</span>
      <svg width="20" height="28" viewBox="0 0 20 28" fill="none">
        <rect x="1" y="1" width="18" height="26" rx="9" stroke="rgba(255,214,10,0.4)" strokeWidth="2" />
        <circle cx="10" cy="8" r="2" fill="rgba(255,214,10,0.8)">
          <animate attributeName="cy" values="8;16;8" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}

/* ─── Spotlight Card ────────────────────────────────────── */
function SpotlightCard({ children, className = '', href = '#', bgStyle }: {
  children: React.ReactNode; className?: string; href?: string; bgStyle?: React.CSSProperties;
}) {
  const { ref, pos } = useElementMouse();
  return (
    <Link href={href}>
      <div ref={ref} className={`spotlight-card ${className}`}
        style={{ '--mouse-x': `${pos.x}%`, '--mouse-y': `${pos.y}%`, ...bgStyle } as React.CSSProperties}>
        {children}
      </div>
    </Link>
  );
}

/* ─── Animated Stat Counter ─────────────────────────────── */
function StatCounter({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const { count, ref } = useCountUp(value, 2000);
  return (
    <div ref={ref} className="text-center">
      <div className="font-arcade text-2xl sm:text-3xl text-mario-yellow neon-text mb-2">
        {count}{suffix}
      </div>
      <div className="font-arcade text-[8px] text-mario-text-muted tracking-widest uppercase">{label}</div>
    </div>
  );
}

/* ─── Parallax Section ──────────────────────────────────── */
function ParallaxSection({ children, speed = 0.3, className = '' }: {
  children: React.ReactNode; speed?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (!ref.current) { ticking = false; return; }
        const rect = ref.current.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const viewCenter = window.innerHeight / 2;
        setOffset((center - viewCenter) * speed);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [speed]);

  return (
    <div ref={ref} className={className}>
      <div className="parallax-layer" style={{ transform: `translateY(${offset}px)` }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Marquee Banner ────────────────────────────────────── */
function MarqueeBanner() {
  const items = [
    { text: 'ORDER NOW', icon: <Icon name="food" size={12} /> },
    { text: 'EARN COINS', icon: <Icon name="coin" size={12} /> },
    { text: 'PLAY GAMES', icon: <Icon name="game" size={12} /> },
    { text: 'SEND LETTERS', icon: <Icon name="envelope" size={12} /> },
    { text: 'COFFEE JELLY', icon: <Icon name="food" size={12} /> },
    { text: 'COOKIES', icon: <Icon name="food" size={12} /> },
    { text: 'RATED 4.9', icon: <Icon name="star" size={12} /> },
    { text: 'FREE DELIVERY', icon: <Icon name="box" size={12} /> },
  ];
  return (
    <div className="overflow-hidden py-4 border-y border-white/5">
      <div className="marquee-track flex items-center gap-8 whitespace-nowrap" style={{ width: 'max-content' }}>
        {[...items, ...items, ...items, ...items].map((item, i) => (
          <span key={i} className="flex items-center gap-2 font-arcade text-[9px] text-mario-text-muted/50 tracking-wider">
            {item.icon} {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { scrollY, scrollPercent, direction } = useScrollPosition();
  const mouse = useMousePosition();
  const heroRef = useRef<HTMLElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [stats, setStats] = useState({ totalOrders: 0, happyCustomers: 0, menuItems: 0, avgRating: 0 });

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) setIsLoggedIn(true);
    const timer = setTimeout(() => setShowContent(true), 300);
    // Fetch real stats
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => { if (d.success && d.data) setStats(d.data); })
      .catch(() => {});
    return () => clearTimeout(timer);
  }, []);

  // Hide scroll indicator after scrolling
  useEffect(() => {
    if (scrollY > 100) setHeroVisible(false);
  }, [scrollY]);

  const featuredProducts = [
    { name: 'Musubi', image: '/images/product-musubi.png', price: '₱40', desc: 'Regular / With Egg / With Flakes', color: '#06d6a0' },
    { name: 'Mini Churros', image: '/images/product-churros.png', price: '₱70', desc: 'Cinnamon Sugar / Option 2', color: '#ffd60a' },
    { name: 'Coffee Jelly', image: '/images/product-coffee-jelly.png', price: '₱15', desc: 'Classic / Premium', color: '#4895ef' },
    { name: 'Cookies', image: '/images/product-cookies.png', price: '₱25', desc: 'Regular / Cookies & Cream', color: '#e63946' },
  ];

  const features = [
    { icon: <Icon name="food" size={28} />, title: 'Fresh Food', desc: 'Made to order with love', color: '#06d6a0', link: '/menu' },
    { icon: <Icon name="coin" size={28} />, title: 'Earn Coins', desc: '0.5 coins per peso spent', color: '#ffd60a', link: '/points' },
    { icon: <Icon name="game" size={28} />, title: 'Play Games', desc: 'Win rewards & prizes', color: '#4895ef', link: '/entertainment' },
    { icon: <Icon name="envelope" size={28} />, title: 'Untold Words', desc: 'Send anonymous confessions', color: '#c896ff', link: '/untold-words' },
    { icon: <Icon name="stream" size={28} />, title: 'MuraStream', desc: 'Movies • TV • Anime', color: '#e63946', link: '/murastream' },
  ];

  return (
    <main className="mario-bg min-h-screen">
      <NavBar />
      <Particles count={25} />
      <ScrollProgress percent={scrollPercent} />

      {/* ═══════════════════════════════════════════════════════
          HERO SECTION — Full viewport with parallax
          ═══════════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative overflow-hidden dot-pattern" style={{ minHeight: '100vh' }}>
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

        {/* Parallax floating elements */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-20 left-[10%] text-4xl opacity-20 float-anim" style={{ animationDelay: '0s' }}>🪙</div>
          <div className="absolute top-32 right-[15%] text-3xl opacity-15 float-anim" style={{ animationDelay: '1s' }}>⭐</div>
          <div className="absolute bottom-40 left-[20%] text-2xl opacity-10 float-anim" style={{ animationDelay: '2s' }}>🍄</div>
          <div className="absolute top-[60%] right-[8%] text-3xl opacity-15 float-anim" style={{ animationDelay: '0.5s' }}>✨</div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 px-4 pt-24 pb-20 sm:px-8 flex flex-col items-center justify-center min-h-screen"
          style={{
            opacity: showContent ? 1 : 0,
            transform: showContent ? 'translateY(0)' : 'translateY(30px)',
            transition: 'opacity 1s cubic-bezier(0.16, 1, 0.3, 1), transform 1s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
          <div className="mario-container text-center">
            {/* Coin badge */}
            <Reveal delay={0.1}>
              <div className="mb-6 inline-flex items-center gap-2 mario-badge mario-badge-gold">
                <span className="coin-float">🪙</span>
                <span>EARN 0.5 COINS PER PESO SPENT!</span>
              </div>
            </Reveal>

            {/* Gold Heading */}
            <Reveal delay={0.2}>
              <div className="mb-6">
                <h1
                  className="font-arcade text-[clamp(2rem,8vw,5rem)] leading-tight tracking-tight text-center"
                  style={{
                    background: 'linear-gradient(180deg, #ffe066 0%, #ffd60a 40%, #f59e0b 70%, #d4a017 100%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 0 20px rgba(255,214,10,0.4)) drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                    textShadow: 'none',
                  }}
                >
                  WELCOME TO MURAGOODS
                </h1>
              </div>
            </Reveal>

            {/* Subtitle */}
            <Reveal delay={0.35}>
              <p className="text-mario-yellow font-arcade text-sm sm:text-base mb-3">
                MUSUBI · CHURROS · COFFEE JELLY · COOKIES
              </p>
            </Reveal>
            <Reveal delay={0.4}>
              <p className="text-mario-text-muted text-base mb-8 max-w-lg mx-auto">
                Fuel your adventure with iconic campus treats and power-ups delivered straight to your door! Stroll down for more features-
              </p>
            </Reveal>

            {/* Animated Buttons */}
            <Reveal delay={0.5}>
              <div className="flex flex-wrap justify-center gap-4 mb-12">
                <Link href="/menu">
                  <AnimatedButton
                    className="px-8 py-3 font-arcade text-sm"
                    style={{ background: 'rgba(6,214,160,0.15)', borderColor: 'rgba(6,214,160,0.3)', color: '#06d6a0' }}
                  >
                    🍕 ORDER NOW
                  </AnimatedButton>
                </Link>
                <Link href="/orders">
                  <AnimatedButton
                    className="px-8 py-3 font-arcade text-sm"
                    style={{ background: 'rgba(255,214,10,0.15)', borderColor: 'rgba(255,214,10,0.3)', color: '#ffd60a' }}
                  >
                    📦 VIEW ORDERS
                  </AnimatedButton>
                </Link>
                <Link href="/murastream">
                  <AnimatedButton
                    className="px-8 py-3 font-arcade text-sm"
                    style={{ background: 'rgba(230,57,70,0.15)', borderColor: 'rgba(230,57,70,0.3)', color: '#e63946' }}
                  >
                    🎬 MOVIES
                  </AnimatedButton>
                </Link>
              </div>
            </Reveal>

            {/* Mario Hero — 3D tilt */}
            <Reveal delay={0.6} direction="scale">
              <div className="hero-tilt flex justify-center"
                style={{
                  transform: `perspective(800px) rotateY(${(mouse.x - 0.5) * 10}deg) rotateX(${(mouse.y - 0.5) * -8}deg)`,
                }}>
                <div className="relative w-64 h-64 sm:w-80 sm:h-80">
                  <Image src="/images/mario-waving.png" alt="Muragoods" fill className="object-contain drop-shadow-[0_0_30px_rgba(255,214,10,0.3)]" priority />
                </div>
              </div>
            </Reveal>
          </div>

          <ScrollDown visible={heroVisible} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          WAVE DIVIDER
          ═══════════════════════════════════════════════════════ */}
      <div className="wave-divider relative z-10 -mt-1">
        <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ fill: 'rgba(255,214,10,0.03)' }}>
          <path d="M0,0 C300,60 900,0 1200,40 L1200,60 L0,60 Z" />
        </svg>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MARQUEE BANNER
          ═══════════════════════════════════════════════════════ */}
      <MarqueeBanner />

      {/* ═══════════════════════════════════════════════════════
          STATS SECTION — Counters
          ═══════════════════════════════════════════════════════ */}
      <section className="px-4 py-16 sm:px-8">
        <div className="mario-container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <Reveal delay={0}><StatCounter value={stats.totalOrders || 1} suffix="+" label="Orders Served" /></Reveal>
            <Reveal delay={0.1}><StatCounter value={stats.happyCustomers || 1} suffix="+" label="Happy Customers" /></Reveal>
            <Reveal delay={0.2}><StatCounter value={stats.menuItems || 12} label="Menu Items" /></Reveal>
            <Reveal delay={0.3}><StatCounter value={Math.round((stats.avgRating || 4.9) * 10)} label="Avg Rating" suffix="/10" /></Reveal>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          QUICK HIGHLIGHTS — Spotlight Cards
          ═══════════════════════════════════════════════════════ */}
      <section className="px-4 py-8 sm:px-8">
        <div className="mario-container">
          <Reveal>
            <div className="mb-8 text-center">
              <h2 className="mario-title text-lg sm:text-xl">Explore Muragoods</h2>
              <div className="h-0.5 w-20 bg-gradient-to-r from-transparent via-mario-yellow to-transparent mx-auto mt-3" />
            </div>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2">
            <Reveal delay={0.1}>
              <SpotlightCard href="/menu" className="highlight-card block" bgStyle={{ background: 'linear-gradient(135deg, rgba(6,214,160,0.12), rgba(255,214,10,0.08))' }}>
                <div className="highlight-content">
                  <span className="text-5xl mb-4 float-anim block">🍕</span>
                  <h3 className="font-arcade text-sm text-mario-yellow mb-2">ORDER NOW</h3>
                  <p className="text-xs text-mario-text-muted mb-3">Browse our full food menu — Musubi, Churros, Coffee Jelly, Cookies & more!</p>
                  <span className="font-arcade text-[9px] text-emerald-400" style={{ letterSpacing: '0.1em' }}>EXPLORE →</span>
                </div>
              </SpotlightCard>
            </Reveal>
            <Reveal delay={0.2}>
              <SpotlightCard href="/untold-words" className="highlight-card block" bgStyle={{ background: 'linear-gradient(135deg, rgba(123,47,247,0.12), rgba(255,100,150,0.08))' }}>
                <div className="highlight-content">
                  <span className="text-5xl mb-4 float-anim block">✉️</span>
                  <h3 className="font-arcade text-sm text-mario-yellow mb-2">UNTOLD WORDS</h3>
                  <p className="text-xs text-mario-text-muted mb-3">Some things are easier to say through a letter, a confession, or a song.</p>
                  <span className="font-arcade text-[9px]" style={{ color: '#c896ff', letterSpacing: '0.1em' }}>EXPLORE NOW →</span>
                </div>
              </SpotlightCard>
            </Reveal>
            <Reveal delay={0.3}>
              <SpotlightCard href="/murastream" className="highlight-card block" bgStyle={{ background: 'linear-gradient(135deg, rgba(230,57,70,0.12), rgba(255,100,150,0.08))' }}>
                <div className="highlight-content">
                  <span className="text-5xl mb-4 float-anim block">🎬</span>
                  <h3 className="font-arcade text-sm text-mario-yellow mb-2">MURASTREAM</h3>
                  <p className="text-xs text-mario-text-muted mb-3">Movies • TV • Anime — Stream, browse, and build your watchlist.</p>
                  <span className="font-arcade text-[9px]" style={{ color: '#e63946', letterSpacing: '0.1em' }}>WATCH NOW →</span>
                </div>
              </SpotlightCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          PARALLAX SECTION — Features
          ═══════════════════════════════════════════════════════ */}
      <ParallaxSection speed={0.15} className="px-4 py-16 sm:px-8">
        <div className="mario-container">
          <Reveal>
            <div className="mb-10 text-center">
              <h2 className="mario-title text-lg sm:text-xl">Why Muragoods?</h2>
              <div className="h-0.5 w-20 bg-gradient-to-r from-transparent via-mario-yellow to-transparent mx-auto mt-3" />
            </div>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feat, i) => (
              <Reveal key={feat.title} delay={i * 0.1}>
                <Link href={feat.link}>
                  <div className="mario-card p-6 text-center group spotlight-card cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                    style={{ '--mouse-x': '50%', '--mouse-y': '50%' } as React.CSSProperties}>
                    <div className="mb-4 transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_var(--feat-color)]" style={{ '--feat-color': feat.color } as React.CSSProperties}>{feat.icon}</div>
                    <h3 className="font-arcade text-xs mb-2 transition-colors duration-300" style={{ color: feat.color }}>{feat.title}</h3>
                    <p className="text-xs text-mario-text-muted">{feat.desc}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </ParallaxSection>

      {/* ═══════════════════════════════════════════════════════
          WAVE DIVIDER
          ═══════════════════════════════════════════════════════ */}
      <div className="wave-divider relative z-10">
        <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ fill: 'rgba(6,214,160,0.03)' }}>
          <path d="M0,40 C200,0 400,60 600,20 C800,-20 1000,50 1200,10 L1200,60 L0,60 Z" />
        </svg>
      </div>

      {/* ═══════════════════════════════════════════════════════
          FEATURED PRODUCTS — 3D Tilt Cards
          ═══════════════════════════════════════════════════════ */}
      <section className="px-4 py-16 sm:px-8">
        <div className="mario-container">
          <Reveal>
            <div className="mb-10 text-center">
              <h2 className="mario-title text-lg sm:text-xl">Featured Power-Ups</h2>
              <div className="h-0.5 w-20 bg-gradient-to-r from-transparent via-mario-yellow to-transparent mx-auto mt-3" />
              <p className="text-mario-text-muted text-sm mt-4">Our most loved treats, ready for your next adventure</p>
            </div>
          </Reveal>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {featuredProducts.map((item, i) => (
              <Reveal key={item.name} delay={i * 0.12}>
                <div className="product-3d mario-card group spotlight-card"
                  style={{ '--mouse-x': '50%', '--mouse-y': '50%' } as React.CSSProperties}>
                  <div className="relative h-48 bg-mario-bg-light border-b border-white/5 overflow-hidden">
                    <Image src={item.image} alt={item.name} fill className="object-contain p-4 transition-transform group-hover:scale-110 duration-500" />
                    {/* Glow overlay on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ background: `radial-gradient(circle at center, ${item.color}15 0%, transparent 70%)` }} />
                  </div>
                  <div className="p-5 relative z-10">
                    <h3 className="font-arcade text-xs mb-2" style={{ color: item.color }}>{item.name}</h3>
                    <p className="text-xs text-mario-text-muted mb-4">{item.desc}</p>
                    <div className="flex items-center justify-between">
                      <span className="coin-price text-sm">{item.price}</span>
                      <Link href="/menu">
                        <AnimatedButton
                          className="px-4 py-2 font-arcade text-[9px]"
                          style={{ background: `${item.color}20`, borderColor: `${item.color}50`, color: item.color }}
                        >
                          + ADD
                        </AnimatedButton>
                      </Link>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          BIG CTA — Cinematic Full-Width
          ═══════════════════════════════════════════════════════ */}
      <ParallaxSection speed={0.2}>
        <section className="relative px-4 py-20 sm:px-8 overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 z-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(255,214,10,0.08) 0%, transparent 70%)' }} />
          </div>

          <div className="mario-container relative z-10 text-center">
            <Reveal direction="scale">
              <div className="text-6xl sm:text-8xl mb-6">🎮</div>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mario-title text-xl sm:text-3xl mb-4 neon-text">
                Ready to Level Up?
              </h2>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="text-mario-text-muted text-sm sm:text-base max-w-xl mx-auto mb-8">
                Join hundreds of happy customers enjoying fresh, delicious treats delivered with love.
                Every order earns you coins to unlock rewards!
              </p>
            </Reveal>
            <Reveal delay={0.3}>
              <div className="flex flex-wrap justify-center gap-4">
                <Link href="/menu">
                  <AnimatedButton
                    className="px-10 py-4 font-arcade text-sm"
                    style={{ background: 'rgba(6,214,160,0.2)', borderColor: 'rgba(6,214,160,0.4)', color: '#06d6a0' }}
                  >
                    🍕 ORDER NOW
                  </AnimatedButton>
                </Link>
                <Link href="/entertainment">
                  <AnimatedButton
                    className="px-10 py-4 font-arcade text-sm"
                    style={{ background: 'rgba(72,149,239,0.2)', borderColor: 'rgba(72,149,239,0.4)', color: '#4895ef' }}
                  >
                    🎮 PLAY GAMES
                  </AnimatedButton>
                </Link>
                <Link href="/untold-words">
                  <AnimatedButton
                    className="px-10 py-4 font-arcade text-sm"
                    style={{ background: 'rgba(200,150,255,0.2)', borderColor: 'rgba(200,150,255,0.4)', color: '#c896ff' }}
                  >
                    💌 UNTOLD WORDS
                  </AnimatedButton>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </ParallaxSection>

      {/* ═══════════════════════════════════════════════════════
          MURASTREAM FEATURE SECTION
          ═══════════════════════════════════════════════════════ */}
      <section className="relative px-4 py-20 sm:px-8 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(230,57,70,0.08) 0%, transparent 70%)' }} />
        </div>
        <div className="mario-container relative z-10 text-center">
          <Reveal direction="scale">
            <div className="text-6xl sm:text-8xl mb-6">🎬</div>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="mario-title text-xl sm:text-3xl mb-4" style={{ color: '#e63946' }}>
              MuraStream
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="text-mario-text-muted text-sm sm:text-base max-w-xl mx-auto mb-2">
              Your next adventure starts here.
            </p>
            <p className="text-mario-text-muted/60 text-xs mb-8">
              Movies • TV Series • Anime
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/murastream">
                <AnimatedButton
                  className="px-10 py-4 font-arcade text-sm"
                  style={{ background: 'rgba(230,57,70,0.2)', borderColor: 'rgba(230,57,70,0.4)', color: '#e63946' }}
                >
                  🎬 EXPLORE MOVIES →
                </AnimatedButton>
              </Link>
              <Link href="/murastream/library">
                <AnimatedButton
                  className="px-10 py-4 font-arcade text-sm"
                  style={{ background: 'rgba(255,214,10,0.15)', borderColor: 'rgba(255,214,10,0.3)', color: '#ffd60a' }}
                >
                  📚 MY LIBRARY
                </AnimatedButton>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/5 py-12 text-center relative z-10">
        <Reveal>
          <p className="font-arcade text-[8px] text-mario-text-muted tracking-widest uppercase mb-2">
            © 2026 Muragoods — World 1-1 Food
          </p>
          <p className="text-[10px] text-mario-text-muted/50">
            Made with 💛 for hungry adventurers
          </p>
        </Reveal>
      </footer>
    </main>
  );
}
