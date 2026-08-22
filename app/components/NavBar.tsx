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
    <nav className="deco-nav">
      <div className="deco-nav-inner">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 group no-underline shrink-0">
          <div className="relative h-9 w-9 border-2 border-[var(--gold)] overflow-hidden rounded-full transition-transform group-hover:scale-105 shadow-[0_0_10px_rgba(212,175,55,0.25)]">
            <Image src="/images/muragoods-logo.png" alt="Muragoods Logo" fill className="object-cover" />
          </div>
          <div className="hidden sm:block">
            <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
              Muragoods
            </p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-1">
          {/* Primary Nav */}
          <Link href="/menu" className="deco-btn deco-btn-sm">
            📋 Menu
          </Link>
          <Link href="/rewards" className="deco-btn deco-btn-sm">
            🏪 Rewards
          </Link>

          {/* Separator */}
          <div className="w-px h-5 bg-[rgba(212,175,55,0.2)] mx-1" />

          {/* Entertainment */}
          {isLoggedIn && (
            <Link href="/entertainment" className="deco-btn deco-btn-sm deco-btn-crimson">
              🎮 Play
            </Link>
          )}
          <Link href="/leaderboard" className="deco-btn deco-btn-sm">
            🏆 Scores
          </Link>

          {/* Separator */}
          <div className="w-px h-5 bg-[rgba(212,175,55,0.2)] mx-1" />

          {/* Account Section */}
          {isLoggedIn && (
            <>
              <Link href="/points" className="no-underline">
                <CoinBalance size="sm" />
              </Link>
              {cartCount !== undefined && cartCount > 0 && (
                <Link href="/checkout" className="deco-btn deco-btn-sm deco-btn-crimson relative">
                  🛒 Cart ({cartCount})
                </Link>
              )}
              <NotificationBell />
              <Link href="/orders" className="deco-btn deco-btn-sm deco-btn-gold">
                📦 Orders
              </Link>
              <Link href="/account/profile" className="deco-btn deco-btn-sm">
                👤 Profile
              </Link>
              <button onClick={handleLogout} className="deco-btn deco-btn-sm deco-btn-dark">
                ✖
              </button>
            </>
          )}
          {!isLoggedIn && (
            <>
              <Link href="/login" className="deco-btn deco-btn-sm deco-btn-dark">
                Login
              </Link>
              <Link href="/signup" className="deco-btn deco-btn-sm deco-btn-gold">
                Sign Up
              </Link>
            </>
          )}
        </div>

        {/* Mobile: coin + cart + hamburger */}
        <div className="flex lg:hidden items-center gap-2">
          {isLoggedIn && (
            <Link href="/points" className="no-underline">
              <CoinBalance size="sm" />
            </Link>
          )}
          {isLoggedIn && cartCount !== undefined && cartCount > 0 && (
            <Link href="/checkout" className="deco-btn deco-btn-sm deco-btn-crimson text-[10px]" style={{ padding: '4px 8px' }}>
              🛒 {cartCount}
            </Link>
          )}
          <button
            className="flex flex-col gap-[4px] p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span className={`block w-5 h-[2px] bg-[var(--gold)] transition-transform ${mobileOpen ? 'rotate-45 translate-y-[6px]' : ''}`} />
            <span className={`block w-5 h-[2px] bg-[var(--gold)] transition-opacity ${mobileOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-[2px] bg-[var(--gold)] transition-transform ${mobileOpen ? '-rotate-45 -translate-y-[6px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[rgba(212,175,55,0.15)] bg-[var(--obsidian)] px-4 pb-4 pt-3 space-y-2">
          <Link href="/menu" className="deco-btn deco-btn-sm w-full" onClick={() => setMobileOpen(false)}>
            📋 Menu
          </Link>
          <Link href="/rewards" className="deco-btn deco-btn-sm w-full" onClick={() => setMobileOpen(false)}>
            🏪 Rewards
          </Link>
          {isLoggedIn && (
            <Link href="/entertainment" className="deco-btn deco-btn-sm deco-btn-crimson w-full" onClick={() => setMobileOpen(false)}>
              🎮 Play
            </Link>
          )}
          <Link href="/leaderboard" className="deco-btn deco-btn-sm w-full" onClick={() => setMobileOpen(false)}>
            🏆 Scores
          </Link>
          {isLoggedIn && (
            <>
              <div className="border-t border-[rgba(212,175,55,0.1)] my-2" />
              <Link href="/orders" className="deco-btn deco-btn-sm deco-btn-gold w-full" onClick={() => setMobileOpen(false)}>
                📦 Orders
              </Link>
              <Link href="/account/profile" className="deco-btn deco-btn-sm w-full" onClick={() => setMobileOpen(false)}>
                👤 Profile
              </Link>
              <Link href="/support" className="deco-btn deco-btn-sm w-full" onClick={() => setMobileOpen(false)}>
                💬 Support
              </Link>
              <Link href="/unsent" className="deco-btn deco-btn-sm w-full" onClick={() => setMobileOpen(false)}>
                ✉️ Unsent
              </Link>
              <button
                onClick={() => { setMobileOpen(false); handleLogout(); }}
                className="deco-btn deco-btn-sm deco-btn-dark w-full"
              >
                🚪 Logout
              </button>
            </>
          )}
          {!isLoggedIn && (
            <>
              <div className="border-t border-[rgba(212,175,55,0.1)] my-2" />
              <Link href="/login" className="deco-btn deco-btn-sm deco-btn-dark w-full" onClick={() => setMobileOpen(false)}>
                Login
              </Link>
              <Link href="/signup" className="deco-btn deco-btn-sm deco-btn-gold w-full" onClick={() => setMobileOpen(false)}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
