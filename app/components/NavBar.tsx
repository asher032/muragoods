'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CoinBalance } from '@/app/components/CoinBalance';

interface NavBarProps {
  /** Text shown next to "Muragoods" in the brand area */
  pageLabel?: string;
  /** Number of items in cart — shows badge when > 0 */
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
        <Link href="/" className="flex items-center gap-3 group no-underline">
          <div className="relative h-10 w-10 border-2 border-[var(--gold)] overflow-hidden transition-transform group-hover:scale-105">
            <Image src="/images/muragoods-logo.png" alt="Muragoods Logo" fill className="object-cover" />
          </div>
          <div>
            <p
              className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold-bright)]"
              style={{ fontFamily: 'var(--font-arcade)' }}
            >
              Muragoods
            </p>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--pewter)]">
              {pageLabel}
            </p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/menu" className="deco-btn deco-btn-sm">
            Menu
          </Link>

          {isLoggedIn && <CoinBalance size="sm" />}

          {isLoggedIn ? (
            <>
              <Link href="/orders" className="deco-btn deco-btn-sm deco-btn-gold">
                Orders
              </Link>
              <Link href="/account/profile" className="deco-btn deco-btn-sm">
                Profile
              </Link>
              {cartCount !== undefined && cartCount > 0 && (
                <Link
                  href="/checkout"
                  className="deco-btn deco-btn-sm deco-btn-crimson"
                  style={{ position: 'relative' }}
                >
                  Cart ({cartCount})
                </Link>
              )}
              <button onClick={handleLogout} className="deco-btn deco-btn-sm deco-btn-dark">
                Logout
              </button>
            </>
          ) : (
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

        {/* Mobile Hamburger */}
        <button
          className="md:hidden flex flex-col gap-[5px] p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span
            className={`block w-6 h-[2px] bg-[var(--gold)] transition-transform ${mobileOpen ? 'rotate-45 translate-y-[7px]' : ''}`}
          />
          <span
            className={`block w-6 h-[2px] bg-[var(--gold)] transition-opacity ${mobileOpen ? 'opacity-0' : ''}`}
          />
          <span
            className={`block w-6 h-[2px] bg-[var(--gold)] transition-transform ${mobileOpen ? '-rotate-45 -translate-y-[7px]' : ''}`}
          />
        </button>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[rgba(212,175,55,0.15)] bg-[var(--obsidian)] px-4 pb-4 pt-2 space-y-2">
          <Link href="/menu" className="deco-btn deco-btn-sm w-full" onClick={() => setMobileOpen(false)}>
            Menu
          </Link>
          {isLoggedIn && (
            <div className="flex justify-center">
              <CoinBalance size="sm" />
            </div>
          )}
          {isLoggedIn ? (
            <>
              <Link href="/orders" className="deco-btn deco-btn-sm deco-btn-gold w-full" onClick={() => setMobileOpen(false)}>
                Orders
              </Link>
              <Link href="/account/profile" className="deco-btn deco-btn-sm w-full" onClick={() => setMobileOpen(false)}>
                Profile
              </Link>
              {cartCount !== undefined && cartCount > 0 && (
                <Link href="/checkout" className="deco-btn deco-btn-sm deco-btn-crimson w-full" onClick={() => setMobileOpen(false)}>
                  Cart ({cartCount})
                </Link>
              )}
              <button
                onClick={() => { setMobileOpen(false); handleLogout(); }}
                className="deco-btn deco-btn-sm deco-btn-dark w-full"
              >
                Logout
              </button>
            </>
          ) : (
            <>
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
