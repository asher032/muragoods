'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const NAV_ITEMS = [
  { section: 'BROWSE', items: [
    { href: '/murastream', label: 'Home', icon: 'M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7z' },
    { href: '/murastream?tab=trending', label: 'Trending', icon: 'M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.25-11.75v3.5h2.5a.25.25 0 0 1 0 .5h-3a.25.25 0 0 1-.25-.25v-4a.25.25 0 0 1 .25-.25h3a.25.25 0 0 1 0 .5H8.5v2.75a.25.25 0 0 1-.5 0v-3.5a.25.25 0 0 1 .25-.25h3a.25.25 0 0 1 0 .5H8.5v2.25' },
    { href: '/murastream?tab=movies', label: 'Movies', icon: 'M0 11a1 1 0 0 1 1 1h4a1 1 0 0 1-1-1zm-2.05-.5a.5.5 0 0 1 .42-.49c.31-.05.65-.07 1.03-.07.38 0 .72.02 1.03.07a.5.5 0 0 1-.41.99 5.2 5.2 0 0 0-1.04 0 .5.5 0 0 1-.49-.42zM12 9a1 1 0 0 1 1 1 3 3 0 0 1-6 0 1 1 0 0 1 1-1zM4 6.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zM4 11.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5' },
    { href: '/murastream?tab=tv', label: 'TV Series', icon: 'M2.5 4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5zm0-2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z' },
    { href: '/murastream/anime', label: 'Anime', icon: 'M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16' },
    { href: '/murastream/search', label: 'Search', icon: 'M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10' },
  ]},
  { section: 'MY STUFF', items: [
    { href: '/murastream/history', label: 'Continue Watching', icon: 'M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M9.5 4.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0M8 12.5c-3 0-5 1.5-5 1.5s2 3 5 3 5-3 5-3-2-1.5-5-1.5' },
    { href: '/murastream/likes', label: 'My Likes', icon: 'M8 1.314C12.439-3.248 23.534 4.735 8 15-7.534 4.736 3.561-3.248 8 1.314' },
    { href: '/murastream/my-list', label: 'My List', icon: 'M2 2v2h2V2zm4 0v2h8V2zm-4 4v2h12V6zm-4 4v2h16v-2zm-4 4v2h20v-2z' },
    { href: '/murastream/library', label: 'Library', icon: 'M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.129-2.31.588-3.227 1.617L1.5 13.503zm6.393 13.007c1.086-.496 2.118-.358 3.046.132.928.49 1.755.393 2.457-.023L16 12.207V3.17c-.935-.53-2.12-.603-3.213-.493-1.18.129-2.31.588-3.227 1.617L6.393 15.83z' },
    { href: '/murastream/downloads', label: 'Downloads', icon: 'M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5' },
  ]},
  { section: '', items: [
    { href: '/murastream/profile', label: 'Profile', icon: 'M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6' },
    { href: '/murastream/settings', label: 'Settings', icon: 'M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0' },
  ]},
];

const MOBILE_NAV = [
  { href: '/murastream', label: 'Home', icon: 'M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7z' },
  { href: '/murastream?tab=trending', label: 'Trending', icon: 'M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.25-11.75v3.5h2.5a.25.25 0 0 1 0 .5h-3a.25.25 0 0 1-.25-.25v-4a.25.25 0 0 1 .25-.25h3a.25.25 0 0 1 0 .5H8.5v2.75a.25.25 0 0 1-.5 0v-3.5a.25.25 0 0 1 .25-.25h3a.25.25 0 0 1 0 .5H8.5v2.25' },
  { href: '/murastream/search', label: 'Search', icon: 'M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10' },
  { href: '/murastream/my-list', label: 'My List', icon: 'M2 2v2h2V2zm4 0v2h8V2zm-4 4v2h12V6zm-4 4v2h16v-2zm-4 4v2h20v-2z' },
  { href: '/murastream/profile', label: 'Profile', icon: 'M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6' },
];

export default function MuraStreamLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const isActive = (href: string) => {
    if (href === '/murastream') return pathname === '/murastream';
    return pathname.startsWith(href.split('?')[0]) && href !== '/murastream';
  };

  return (
    <>
      <style jsx global>{`
        .ms-layout { display: flex; min-height: 100vh; background: #0A0A0A; }
        .ms-sidebar {
          width: 240px; min-height: 100vh; background: #111111;
          border-right: 1px solid #1A1A1A; padding: 24px 0;
          position: fixed; top: 0; left: 0; bottom: 0;
          overflow-y: auto; z-index: 100;
        }
        .ms-sidebar::-webkit-scrollbar { width: 4px; }
        .ms-sidebar::-webkit-scrollbar-track { background: transparent; }
        .ms-sidebar::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 2px; }
        .ms-sidebar-logo { padding: 0 20px 24px; border-bottom: 1px solid #1A1A1A; margin-bottom: 16px; }
        .ms-sidebar-logo h2 {
          font-family: var(--font-arcade); font-size: 14px; color: #B85CFF;
          margin: 0; letter-spacing: 0.05em;
        }
        .ms-sidebar-logo p { font-size: 10px; color: #666; margin: 4px 0 0; font-family: var(--font-arcade); }
        .ms-sidebar-section { padding: 0 12px; margin-bottom: 16px; }
        .ms-sidebar-section-label {
          font-family: var(--font-arcade); font-size: 8px; color: #555;
          text-transform: uppercase; letter-spacing: 0.15em; padding: 0 8px; margin-bottom: 6px;
        }
        .ms-nav-link {
          display: flex; align-items: center; gap: 10px; padding: 8px 12px;
          border-radius: 8px; text-decoration: none; transition: all 0.2s;
          font-family: var(--font-arcade); font-size: 11px; color: #888;
        }
        .ms-nav-link:hover { background: rgba(184, 92, 255, 0.08); color: #E5E5E5; }
        .ms-nav-link.active {
          background: rgba(184, 92, 255, 0.15); color: #B85CFF;
          border-left: 2px solid #B85CFF; margin-left: -2px;
        }
        .ms-nav-link svg { flex-shrink: 0; }
        .ms-back-link {
          display: flex; align-items: center; gap: 8px; padding: 8px 20px;
          margin-top: 16px; border-top: 1px solid #1A1A1A; text-decoration: none;
          font-family: var(--font-arcade); font-size: 9px; color: #555;
          transition: color 0.2s;
        }
        .ms-back-link:hover { color: #B85CFF; }
        .ms-main { flex: 1; margin-left: 240px; min-height: 100vh; }
        .ms-mobile-top {
          display: none; position: fixed; top: 0; left: 0; right: 0; z-index: 90;
          background: rgba(17, 17, 17, 0.95); backdrop-filter: blur(20px);
          border-bottom: 1px solid #1A1A1A; padding: 12px 16px;
          align-items: center; justify-content: space-between;
        }
        .ms-mobile-hamburger {
          background: none; border: 1px solid #2A2A2A; border-radius: 8px;
          padding: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .ms-mobile-title {
          font-family: var(--font-arcade); font-size: 12px; color: #B85CFF;
          letter-spacing: 0.05em;
        }
        .ms-mobile-nav {
          display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
          background: rgba(17, 17, 17, 0.95); backdrop-filter: blur(20px);
          border-top: 1px solid #1A1A1A; padding: 6px 0 env(safe-area-inset-bottom, 6px);
        }
        .ms-mobile-nav-inner { display: flex; justify-content: space-around; align-items: center; }
        .ms-mobile-tab {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 6px 8px; border-radius: 8px; text-decoration: none; min-width: 48px;
          transition: all 0.2s;
        }
        .ms-mobile-tab.active { background: rgba(184, 92, 255, 0.12); }
        .ms-mobile-tab-label {
          font-family: var(--font-arcade); font-size: 7px; color: #666;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .ms-mobile-tab.active .ms-mobile-tab-label { color: #B85CFF; }
        .ms-overlay {
          display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6);
          z-index: 99;
        }
        @media (max-width: 767px) {
          .ms-sidebar { transform: translateX(-100%); transition: transform 0.3s ease; }
          .ms-sidebar.open { transform: translateX(0); }
          .ms-main { margin-left: 0; padding-top: 56px; padding-bottom: 60px; }
          .ms-mobile-top { display: flex; }
          .ms-mobile-nav { display: block; }
          .ms-overlay.open { display: block; }
        }
      `}</style>

      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="ms-sidebar">
          <div className="ms-sidebar-logo">
            <h2>MURASTREAM</h2>
            <p>Movies • TV • Anime</p>
          </div>
          {NAV_ITEMS.map((section) => (
            <div key={section.section} className="ms-sidebar-section">
              {section.section && <div className="ms-sidebar-section-label">{section.section}</div>}
              {section.items.map(item => (
                <Link key={item.href} href={item.href} className={`ms-nav-link ${isActive(item.href) ? 'active' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d={item.icon}/>
                  </svg>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          <Link href="/" className="ms-back-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>
            </svg>
            Back to MuraGoods
          </Link>
        </aside>
      )}

      {/* Mobile top bar */}
      {isMobile && (
        <div className="ms-mobile-top">
          <button className="ms-mobile-hamburger" onClick={() => setSidebarOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#B85CFF" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/>
            </svg>
          </button>
          <span className="ms-mobile-title">MURASTREAM</span>
          <Link href="/murastream/search" style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#888" viewBox="0 0 16 16">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10"/>
            </svg>
          </Link>
        </div>
      )}

      {/* Mobile overlay */}
      {isMobile && (
        <div className={`ms-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile sidebar */}
      {isMobile && (
        <aside className={`ms-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="ms-sidebar-logo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>MURASTREAM</h2>
              <p>Movies • TV • Anime</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#888" viewBox="0 0 16 16">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
              </svg>
            </button>
          </div>
          {NAV_ITEMS.map((section) => (
            <div key={section.section} className="ms-sidebar-section">
              {section.section && <div className="ms-sidebar-section-label">{section.section}</div>}
              {section.items.map(item => (
                <Link key={item.href} href={item.href} className={`ms-nav-link ${isActive(item.href) ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d={item.icon}/>
                  </svg>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          <Link href="/" className="ms-back-link" onClick={() => setSidebarOpen(false)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>
            </svg>
            Back to MuraGoods
          </Link>
        </aside>
      )}

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="ms-mobile-nav">
          <div className="ms-mobile-nav-inner">
            {MOBILE_NAV.map(item => (
              <Link key={item.href} href={item.href} className={`ms-mobile-tab ${isActive(item.href) ? 'active' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill={isActive(item.href) ? '#B85CFF' : '#666'} viewBox="0 0 16 16">
                  <path d={item.icon}/>
                </svg>
                <span className="ms-mobile-tab-label">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/* Main content */}
      <main className="ms-main">
        {children}
      </main>
    </>
  );
}
