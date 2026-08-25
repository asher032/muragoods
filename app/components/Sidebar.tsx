'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useCoins } from '@/app/hooks/useCoins';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { section: 'MAIN', items: [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/menu', label: 'Food Menu', icon: '🍕' },
    { href: '/hub', label: 'Hub', icon: '🎮' },
  ]},
  { section: 'PLAY', items: [
    { href: '/entertainment', label: 'Games', icon: '🎮' },
    { href: '/play/spin', label: 'Spin Wheel', icon: '🎰' },
    { href: '/play/trivia', label: 'Trivia', icon: '🧠' },
    { href: '/play/checkin', label: 'Check-In', icon: '📅' },
    { href: '/play/mysterybox', label: 'Mystery Box', icon: '🎁' },
  ]},
  { section: 'ACCOUNT', items: [
    { href: '/account/profile', label: 'My Profile', icon: '👤' },
    { href: '/orders', label: 'My Orders', icon: '📦' },
    { href: '/points', label: 'Points', icon: '🪙' },
    { href: '/favorites', label: 'Favorites', icon: '❤️' },
    { href: '/support', label: 'Support', icon: '💬' },
  ]},
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { coins } = useCoins();
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) setUser(JSON.parse(userStr));
    } catch { /* empty */ }
  }, []);

  // Close on route change only (not on every render)
  useEffect(() => { onClose(); }, [pathname]);

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (open) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    return () => document.body.classList.remove('sidebar-open');
  }, [open]);

  return (
    <>
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`sidebar-panel ${open ? 'open' : ''}`}>
        {/* Profile Header */}
        <div style={{ padding: '0 24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--mario-yellow), var(--mario-orange))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--mario-yellow)',
            }}>
              {user ? (
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: 'var(--mario-bg)' }}>
                  {(user.name || user.email || 'P').charAt(0).toUpperCase()}
                </span>
              ) : (
                <span style={{ fontSize: '20px' }}>👤</span>
              )}
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-yellow)' }}>
                {user?.name || 'Guest'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <span style={{ fontSize: '10px' }}>🪙</span>
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'var(--mario-green)' }}>
                  {coins} coins
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav Items */}
        {navItems.map((section) => (
          <div key={section.section}>
            <div className="sidebar-section-label">{section.section}</div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
              >
                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}

        {/* Footer */}
        <div style={{ padding: '20px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '12px' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: 'var(--mario-text-muted)', textAlign: 'center', letterSpacing: '0.1em' }}>
            MURAGOODS v2.0
          </p>
        </div>
      </div>
    </>
  );
}
