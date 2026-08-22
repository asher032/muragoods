'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CoinBalance } from '@/app/components/CoinBalance';
import { NotificationBell } from '@/app/components/NotificationBell';

interface NavBarProps {
  pageLabel?: string;
  cartCount?: number;
}

export function NavBar({ pageLabel = 'World 1-1 Food', cartCount }: NavBarProps) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) setIsLoggedIn(true);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/');
  };

  return (
    <nav className="mario-nav">
      <div className="mario-nav-inner">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 group no-underline shrink-0">
          <div className="relative h-9 w-9 border-2 border-mario-yellow overflow-hidden rounded-full transition-transform group-hover:scale-110">
            <Image src="/images/muragoods-logo.png" alt="Muragoods Logo" fill className="object-cover" />
          </div>
          <div className="hidden sm:block">
            <p className="mario-text-xs font-arcade text-mario-yellow">Muragoods</p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-1">
          <Link href="/menu" className="mario-btn mario-btn-sm">📋 Menu</Link>
          <Link href="/rewards" className="mario-btn mario-btn-sm">🏪 Rewards</Link>
          <div className="w-px h-5 bg-mario-wood-light mx-1" />
          {isLoggedIn && (
            <Link href="/entertainment" className="mario-btn mario-btn-sm mario-btn-red">🎮 Play</Link>
          )}
          <Link href="/leaderboard" className="mario-btn mario-btn-sm">🏆 Scores</Link>
          <Link href="/honey" className="mario-btn mario-btn-sm">💌 Honey, If Only</Link>
          <div className="w-px h-5 bg-mario-wood-light mx-1" />
          {isLoggedIn && (
            <>
              <Link href="/points" className="no-underline"><CoinBalance size="sm" /></Link>
              {cartCount !== undefined && cartCount > 0 && (
                <Link href="/checkout" className="mario-btn mario-btn-sm mario-btn-red">🛒 Cart ({cartCount})</Link>
              )}
              <NotificationBell />
              <Link href="/orders" className="mario-btn mario-btn-sm mario-btn-yellow">📦 Orders</Link>
              <Link href="/account/profile" className="mario-btn mario-btn-sm">👤 Profile</Link>
              <button onClick={handleLogout} className="mario-btn mario-btn-sm mario-btn-secondary">✖</button>
            </>
          )}
          {!isLoggedIn && (
            <>
              <Link href="/login" className="mario-btn mario-btn-sm mario-btn-secondary">Login</Link>
              <Link href="/signup" className="mario-btn mario-btn-sm mario-btn-primary">Sign Up</Link>
            </>
          )}
        </div>

        {/* Mobile */}
        <div className="flex lg:hidden items-center gap-2">
          {isLoggedIn && <Link href="/points" className="no-underline"><CoinBalance size="sm" /></Link>}
          {isLoggedIn && cartCount !== undefined && cartCount > 0 && (
            <Link href="/checkout" className="mario-btn mario-btn-sm mario-btn-red text-xs">🛒 {cartCount}</Link>
          )}
          <button className="mario-hamburger" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            <span className={`block w-5 h-[2px] bg-mario-yellow transition-transform ${mobileOpen ? 'rotate-45 translate-y-[6px]' : ''}`} />
            <span className={`block w-5 h-[2px] bg-mario-yellow transition-opacity ${mobileOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-[2px] bg-mario-yellow transition-transform ${mobileOpen ? '-rotate-45 -translate-y-[6px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="lg:hidden border-t-4 border-mario-wood bg-mario-sky px-4 pb-4 pt-3 space-y-2">
          <Link href="/menu" className="mario-btn mario-btn-sm w-full" onClick={() => setMobileOpen(false)}>📋 Menu</Link>
          <Link href="/rewards" className="mario-btn mario-btn-sm w-full" onClick={() => setMobileOpen(false)}>🏪 Rewards</Link>
          {isLoggedIn && (
            <Link href="/entertainment" className="mario-btn mario-btn-sm mario-btn-red w-full" onClick={() => setMobileOpen(false)}>🎮 Play</Link>
          )}
          <Link href="/leaderboard" className="mario-btn mario-btn-sm w-full" onClick={() => setMobileOpen(false)}>🏆 Scores</Link>
          <Link href="/honey" className="mario-btn mario-btn-sm w-full" onClick={() => setMobileOpen(false)}>💌 Honey, If Only</Link>
          {isLoggedIn && (
            <>
              <div className="border-t-2 border-mario-wood-light my-2" />
              <Link href="/orders" className="mario-btn mario-btn-sm mario-btn-yellow w-full" onClick={() => setMobileOpen(false)}>📦 Orders</Link>
              <Link href="/account/profile" className="mario-btn mario-btn-sm w-full" onClick={() => setMobileOpen(false)}>👤 Profile</Link>
              <Link href="/support" className="mario-btn mario-btn-sm w-full" onClick={() => setMobileOpen(false)}>💬 Support</Link>
              <button onClick={() => { setMobileOpen(false); handleLogout(); }} className="mario-btn mario-btn-sm mario-btn-secondary w-full">🚪 Logout</button>
            </>
          )}
          {!isLoggedIn && (
            <>
              <div className="border-t-2 border-mario-wood-light my-2" />
              <Link href="/login" className="mario-btn mario-btn-sm mario-btn-secondary w-full" onClick={() => setMobileOpen(false)}>Login</Link>
              <Link href="/signup" className="mario-btn mario-btn-sm mario-btn-primary w-full" onClick={() => setMobileOpen(false)}>Sign Up</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
