'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { NotificationBell } from '@/app/components/NotificationBell';
import { Sidebar } from '@/app/components/Sidebar';
import { useJarvis } from '@/app/components/JARVISProvider';

interface NavBarProps {
  pageLabel?: string;
  cartCount?: number;
}

export function NavBar({ pageLabel, cartCount }: NavBarProps) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const { openJarvis } = useJarvis();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) setIsLoggedIn(true);
  }, []);

  return (
    <>
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(15,15,26,0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          maxWidth: '72rem',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
        }}>
          {/* Left: Hamburger + Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect y="2" width="18" height="2" rx="1" fill="var(--mario-yellow)" />
                <rect y="8" width="18" height="2" rx="1" fill="var(--mario-yellow)" />
                <rect y="14" width="18" height="2" rx="1" fill="var(--mario-yellow)" />
              </svg>
            </button>
            <Link href="/" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
            }}>
              <div style={{
                position: 'relative',
                height: '32px',
                width: '32px',
                border: '2px solid var(--mario-yellow)',
                borderRadius: '50%',
                overflow: 'hidden',
              }}>
                <Image src="/images/muragoods-logo.png" alt="Muragoods" fill style={{ objectFit: 'cover' }} />
              </div>
              <div>
                <p style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '9px',
                  color: 'var(--mario-yellow)',
                  textTransform: 'uppercase',
                }}>Muragoods</p>
                {pageLabel && (
                  <p style={{
                    fontFamily: 'var(--font-arcade)',
                    fontSize: '6px',
                    color: 'var(--mario-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>{pageLabel}</p>
                )}
              </div>
            </Link>
          </div>

          {/* Right: JARVIS + Bell + Cart */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={openJarvis} title="JARVIS AI" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(0,180,255,0.08)', border: '1px solid rgba(0,180,255,0.2)', cursor: 'pointer', transition: 'all 0.2s', color: '#00b4ff', fontSize: '14px' }}>🤖</button>
            {isLoggedIn && <NotificationBell />}
            {isLoggedIn && cartCount !== undefined && cartCount > 0 && (
              <Link href="/checkout" style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '9px',
                color: 'var(--mario-red)',
                textDecoration: 'none',
                padding: '4px 10px',
                background: 'rgba(230,57,70,0.15)',
                border: '1px solid rgba(230,57,70,0.3)',
                borderRadius: '8px',
              }}>
                🛒 {cartCount}
              </Link>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
