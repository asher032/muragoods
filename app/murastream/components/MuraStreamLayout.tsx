'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import MuraStreamIcon from '@/app/components/icons/MuraStreamIcon';

const NAV_LINKS = [
  { href: '/murastream', label: 'Home' },
  { href: '/murastream?tab=movies', label: 'Movies' },
  { href: '/murastream?tab=tv', label: 'TV Shows' },
  { href: '/murastream/kdrama', label: 'K-Drama' },
];

const BOTTOM_NAV = [
  { href: '/murastream', label: 'Home', icon: 'M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7z' },
  { href: '/murastream/search', label: 'Search', icon: 'M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10' },
  { href: '/murastream/my-list', label: 'My List', icon: 'M2 2v2h2V2zm4 0v2h8V2zm-4 4v2h12V6zm-4 4v2h16v-2zm-4 4v2h20v-2z' },
  { href: '/murastream/likes', label: 'Likes', icon: 'M8 1.314C12.439-3.248 23.534 4.735 8 15-7.534 4.736 3.561-3.248 8 1.314' },
  { href: '/murastream/profile', label: 'Profile', icon: 'M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6' },
];

const MORE_LINKS = [
  { href: '/murastream/history', label: 'Continue Watching' },
  { href: '/murastream/library', label: 'Library' },
  { href: '/murastream/downloads', label: 'Downloads' },
  { href: '/murastream/changelog', label: 'What\'s New' },
  { href: '/murastream/settings', label: 'Settings' },
];

export default function MuraStreamLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const isActive = (href: string) => {
    if (href === '/murastream') return pathname === '/murastream';
    const clean = href.split('?')[0];
    return pathname.startsWith(clean) && clean !== '/murastream';
  };

  return (
    <>
      <style jsx global>{`
        /* ─── Top Navbar ────────────────────────────────────── */
        .ms-topnav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          height: 64px; display: flex; align-items: center;
          padding: 0 32px; gap: 8px;
          background: rgba(10, 10, 10, 0.6);
          backdrop-filter: blur(20px) saturate(1.5);
          -webkit-backdrop-filter: blur(20px) saturate(1.5);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.3s, box-shadow 0.3s;
        }
        .ms-topnav.scrolled {
          background: rgba(10, 10, 10, 0.92);
          box-shadow: 0 4px 30px rgba(0,0,0,0.4);
        }
        .ms-topnav-logo {
          font-family: var(--font-arcade); font-size: 16px; color: #B85CFF;
          text-decoration: none; letter-spacing: 0.08em; margin-right: 32px;
          display: flex; align-items: center; gap: 8px; white-space: nowrap;
        }
        .ms-topnav-logo svg { flex-shrink: 0; }
        .ms-topnav-links {
          display: flex; gap: 4px; flex: 1;
        }
        .ms-topnav-link {
          padding: 8px 16px; border-radius: 8px; text-decoration: none;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px; font-weight: 500; color: #A0A0A0;
          transition: all 0.2s; white-space: nowrap;
        }
        .ms-topnav-link:hover { color: #fff; background: rgba(255,255,255,0.06); }
        .ms-topnav-link.active { color: #fff; background: rgba(184,92,255,0.15); }
        .ms-topnav-right {
          display: flex; align-items: center; gap: 12px;
        }
        .ms-topnav-search {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px; padding: 8px 14px; color: #fff; font-size: 13px;
          width: 200px; outline: none; transition: all 0.2s;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .ms-topnav-search::placeholder { color: #555; }
        .ms-topnav-search:focus { border-color: rgba(184,92,255,0.4); width: 280px; background: rgba(255,255,255,0.08); }
        .ms-topnav-more {
          background: none; border: none; padding: 8px; cursor: pointer;
          border-radius: 8px; transition: background 0.2s; display: flex; align-items: center;
        }
        .ms-topnav-more:hover { background: rgba(255,255,255,0.06); }
        .ms-topnav-back {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 8px; text-decoration: none;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 12px; color: #888; transition: all 0.2s;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .ms-topnav-back:hover { color: #fff; border-color: rgba(255,255,255,0.15); }
        /* Dropdown menu */
        .ms-dropdown {
          position: absolute; top: 56px; right: 32px; z-index: 300;
          background: rgba(20,20,20,0.97); backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
          padding: 8px; min-width: 180px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          opacity: 0; transform: translateY(-8px); pointer-events: none;
          transition: all 0.2s ease;
        }
        .ms-dropdown.open { opacity: 1; transform: translateY(0); pointer-events: all; }
        .ms-dropdown-link {
          display: block; padding: 10px 14px; border-radius: 8px; text-decoration: none;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px; color: #A0A0A0; transition: all 0.15s;
        }
        .ms-dropdown-link:hover { background: rgba(184,92,255,0.1); color: #fff; }
        .ms-dropdown-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 4px 8px; }
        /* ─── Main Content ────────────────────────────────── */
        .ms-main { padding-top: 64px; min-height: 100vh; }
        /* ─── Mobile Bottom Nav ──────────────────────────── */
        .ms-mobile-nav {
          display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 200;
          background: rgba(10, 10, 10, 0.92); backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 6px 0 env(safe-area-inset-bottom, 6px);
        }
        .ms-mobile-nav-inner { display: flex; justify-content: space-around; align-items: center; }
        .ms-mobile-tab {
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 6px 10px; border-radius: 10px; text-decoration: none; min-width: 52px;
          transition: all 0.2s;
        }
        .ms-mobile-tab.active { background: rgba(184,92,255,0.12); }
        .ms-mobile-tab-label {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 10px; color: #666; transition: color 0.2s;
        }
        .ms-mobile-tab.active .ms-mobile-tab-label { color: #B85CFF; }
        /* ─── Mobile Hamburger ──────────────────────────── */
        .ms-hamburger {
          display: none; background: none; border: none; padding: 8px; cursor: pointer;
        }
        @media (max-width: 767px) {
          .ms-topnav { padding: 0 16px; height: 56px; }
          .ms-topnav-links { display: none; }
          .ms-topnav-search { display: none; }
          .ms-topnav-back { display: none; }
          .ms-hamburger { display: flex; }
          .ms-main { padding-top: 56px; padding-bottom: 64px; }
          .ms-mobile-nav { display: block; }
          .ms-dropdown { right: 16px; }
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .ms-topnav-search { width: 160px; }
          .ms-topnav-search:focus { width: 200px; }
        }
      `}</style>

      {/* ─── Top Navbar ────────────────────────────────── */}
      <nav className={`ms-topnav ${scrolled ? 'scrolled' : ''}`}>
        {/* Mobile hamburger */}
        <button className="ms-hamburger" onClick={() => setMenuOpen(!menuOpen)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#B85CFF" viewBox="0 0 16 16">
            {menuOpen ? (
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
            ) : (
              <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/>
            )}
          </svg>
        </button>

        {/* Logo */}
        <Link href="/murastream" className="ms-topnav-logo">
          <MuraStreamIcon size={22} color="#B85CFF" />
          MURASTREAM
        </Link>

        {/* Nav links */}
        <div className="ms-topnav-links">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              className={`ms-topnav-link ${isActive(link.href) ? 'active' : ''}`}>
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="ms-topnav-right" style={{ position: 'relative' }}>
          <Link href="/murastream/search" className="ms-topnav-back" style={{ display: 'flex' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10"/>
            </svg>
            Search
          </Link>
          <Link href="/" className="ms-topnav-back">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>
            </svg>
            MuraGoods
          </Link>

          {/* More menu */}
          <button className="ms-topnav-more" onClick={() => setMenuOpen(!menuOpen)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#A0A0A0" viewBox="0 0 16 16">
              <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/>
            </svg>
          </button>

          {/* Dropdown */}
          <div ref={menuRef} className={`ms-dropdown ${menuOpen ? 'open' : ''}`}>
            {MORE_LINKS.map(link => (
              <Link key={link.href} href={link.href} className="ms-dropdown-link"
                onClick={() => setMenuOpen(false)}>
                {link.label}
              </Link>
            ))}
            <div className="ms-dropdown-divider" />
            <Link href="/murastream/settings" className="ms-dropdown-link" onClick={() => setMenuOpen(false)}>
              ⚙ Settings
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Main Content ────────────────────────────── */}
      <main className="ms-main">
        {children}
      </main>

      {/* ─── Mobile Bottom Nav ──────────────────────── */}
      {isMobile && (
        <nav className="ms-mobile-nav">
          <div className="ms-mobile-nav-inner">
            {BOTTOM_NAV.map(item => (
              <Link key={item.href} href={item.href}
                className={`ms-mobile-tab ${isActive(item.href) ? 'active' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                  fill={isActive(item.href) ? '#B85CFF' : '#666'} viewBox="0 0 16 16">
                  <path d={item.icon}/>
                </svg>
                <span className="ms-mobile-tab-label">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
