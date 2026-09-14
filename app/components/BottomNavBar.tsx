'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Film, CircleUserRound } from 'lucide-react';

const tabs = [
  { href: '/', label: 'Home', icon: (active: boolean) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill={active ? '#ffd60a' : '#888'} viewBox="0 0 16 16">
      <path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2zm3.564 1.426L5.596 5 8 5.961 14.154 3.5zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923zM7.443.184a1.5 1.5 0 0 1 1.114 0l7.129 2.852A.5.5 0 0 1 16 3.5v8.662a1 1 0 0 1-.629.928l-7.185 2.874a.5.5 0 0 1-.372 0L.63 13.09a1 1 0 0 1-.63-.928V3.5a.5.5 0 0 1 .314-.464z"/>
    </svg>
  )},
  { href: '/menu', label: 'Menu', icon: (active: boolean) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill={active ? '#ffd60a' : '#888'} viewBox="0 0 16 16">
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>
      <path d="M13.997 5.17a5 5 0 0 0-8.101-4.09A5 5 0 0 0 1.28 9.342a5 5 0 0 0 8.336 5.109 3.5 3.5 0 0 0 5.201-4.065 3.001 3.001 0 0 0-.822-5.216zm-1-.034a1 1 0 0 0 .668.977 2.001 2.001 0 0 1 .547 3.478 1 1 0 0 0-.341 1.113 2.5 2.5 0 0 1-3.715 2.905 1 1 0 0 0-1.262.152 4 4 0 0 1-6.67-4.087 1 1 0 0 0-.2-1 4 4 0 0 1 3.693-6.61 1 1 0 0 0 .8-.2 4 4 0 0 1 6.48 3.273z"/>
    </svg>
  )},
  { href: '/entertainment', label: 'Play', icon: (active: boolean) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill={active ? '#ffd60a' : '#888'} viewBox="0 0 16 16">
      <path d="M5.5 9.511c.076.954.83 1.697 2.182 1.785V12h.6v-.709c1.4-.098 2.218-.846 2.218-1.932 0-.987-.626-1.496-1.745-1.76l-.473-.112V5.57c.6.068.982.396 1.074.85h1.052c-.076-.919-.864-1.638-2.126-1.716V4h-.6v.719c-1.195.117-2.01.836-2.01 1.853 0 .9.606 1.472 1.613 1.707l.397.098v2.034c-.615-.093-1.022-.43-1.114-.9zm2.177-2.166c-.59-.137-.91-.416-.91-.836 0-.47.345-.822.915-.925v1.76h-.005zm.692 1.193c.717.166 1.048.435 1.048.91 0 .542-.412.914-1.135.982V8.518z"/>
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
      <path d="M8 13.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11m0 .5A6 6 0 1 0 8 2a6 6 0 0 0 0 12"/>
    </svg>
  )},
  { href: '/murastream', label: 'Movies', icon: (active: boolean) => (
    <Film size={22} color={active ? '#ffd60a' : '#888'} strokeWidth={active ? 2.4 : 2} />
  )},
  { href: '/account/profile', label: 'Profile', icon: (active: boolean) => (
    <CircleUserRound size={22} color={active ? '#ffd60a' : '#888'} strokeWidth={active ? 2.4 : 2} />
  )},
];

export function BottomNavBar({ cartCount }: { cartCount?: number }) {
  const pathname = usePathname();
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
