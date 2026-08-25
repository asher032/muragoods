'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCoins } from '@/app/hooks/useCoins';

const tabs = [
  { href: '/', label: 'Home', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#ffd60a' : '#888'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )},
  { href: '/menu', label: 'Menu', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#ffd60a' : '#888'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/>
      <line x1="10" y1="1" x2="10" y2="4"/>
      <line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  )},
  { href: '/entertainment', label: 'Play', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#ffd60a' : '#888'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  )},
  { href: '/orders', label: 'Orders', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#ffd60a' : '#888'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  )},
  { href: '/account/profile', label: 'Profile', icon: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#ffd60a' : '#888'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )},
];

export function BottomNavBar({ cartCount }: { cartCount?: number }) {
  const pathname = usePathname();
  const { coins } = useCoins();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem('user'));
  }, []);

  if (!isLoggedIn) return null;

  return (
    <>
      {/* Spacer for fixed bottom nav */}
      <div style={{ height: '58px' }} />
      
      <style jsx>{`
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: rgba(15, 15, 26, 0.92);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255, 214, 10, 0.12);
          padding: 4px 0 env(safe-area-inset-bottom, 6px);
          box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
        }
        .tab-list {
          display: flex;
          justify-content: space-around;
          align-items: center;
          max-width: 420px;
          margin: 0 auto;
          padding: 0 4px;
        }
        .tab-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          padding: 4px 8px;
          border-radius: 10px;
          text-decoration: none;
          transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          min-width: 48px;
        }
        .tab-item.active {
          background: rgba(255, 214, 10, 0.1);
        }
        .tab-item.active .tab-label {
          color: #ffd60a;
        }
        .tab-item:active {
          transform: scale(0.9);
        }
        .tab-icon {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tab-label {
          font-family: var(--font-arcade);
          font-size: 8px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: color 0.2s;
        }
        .tab-badge {
          position: absolute;
          top: -4px;
          right: -8px;
          min-width: 16px;
          height: 16px;
          border-radius: 8px;
          background: var(--mario-red);
          color: #fff;
          font-family: var(--font-arcade);
          font-size: 8px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          box-shadow: 0 2px 6px rgba(230, 57, 70, 0.4);
        }
        .coin-pill {
          position: absolute;
          top: -2px;
          right: -14px;
          display: flex;
          align-items: center;
          gap: 2px;
          background: rgba(255, 214, 10, 0.2);
          border: 1px solid rgba(255, 214, 10, 0.3);
          border-radius: 8px;
          padding: 1px 5px;
          font-family: var(--font-arcade);
          font-size: 7px;
          color: #ffd60a;
          white-space: nowrap;
        }
        .active-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #ffd60a;
          margin-top: 2px;
          box-shadow: 0 0 8px rgba(255, 214, 10, 0.5);
        }
      `}</style>

      <nav className="bottom-nav">
        <div className="tab-list">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
            return (
              <Link key={tab.href} href={tab.href} className={`tab-item ${isActive ? 'active' : ''}`}>
                <div className="tab-icon">
                  {tab.icon(isActive)}
                  {tab.href === '/menu' && cartCount !== undefined && cartCount > 0 && (
                    <span className="tab-badge">{cartCount}</span>
                  )}
                  {tab.href === '/account/profile' && (
                    <span className="coin-pill">🪙 {coins}</span>
                  )}
                </div>
                <span className="tab-label">{tab.label}</span>
                {isActive && <div className="active-dot" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
