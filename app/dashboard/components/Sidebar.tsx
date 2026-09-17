'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, ChevronRight, X } from 'lucide-react';
import { DASH_SECTIONS } from './nav';

export default function Sidebar({ open, onClose, status }: { open: boolean; onClose: () => void; status: 'online' | 'offline' }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside
      aria-label="Dashboard navigation"
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 264,
        background: 'rgba(12,12,17,0.96)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderRight: '1px solid var(--cc-border)',
        zIndex: 201,
        overflowY: 'auto',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform .25s cubic-bezier(0.34,1.4,0.64,1)',
        padding: '18px 14px',
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 18px', borderBottom: '1px solid var(--cc-border)', marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(99,102,241,0.5))',
          boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
        }}>
          <Bot size={20} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14.5, color: '#fff', letterSpacing: '0.02em' }}>MURAGOODS</div>
          <div style={{ fontSize: 10.5, color: 'var(--cc-text-faint)', letterSpacing: '0.06em' }}>DISCORD BOT</div>
        </div>
        <button className="cc-icon-btn" onClick={onClose} aria-label="Close navigation" style={{ marginLeft: 'auto' }}>
          <X size={16} />
        </button>
      </div>

      {/* Sections */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 20 }}>
        {DASH_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="cc-section-label" style={{ padding: '0 10px', marginBottom: 6 }}>{section.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7.5px 10px',
                      borderRadius: 9, textDecoration: 'none', fontSize: 13,
                      fontWeight: active ? 650 : 450,
                      color: active ? '#fff' : 'var(--cc-text-dim)',
                      background: active ? 'var(--cc-accent-soft)' : 'transparent',
                      borderLeft: active ? '2.5px solid var(--cc-accent)' : '2.5px solid transparent',
                      transition: 'background .12s ease, color .12s ease',
                    }}
                  >
                    {item.icon}
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {active && <ChevronRight size={13} color="var(--cc-accent)" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer status */}
      <div style={{ borderTop: '1px solid var(--cc-border)', paddingTop: 12, padding: '12px 10px 4px', marginTop: 6 }}>
        <span className={`cc-status-pill ${status === 'online' ? 'cc-status-online' : 'cc-status-offline'}`}>
          <span className="cc-dot" />
          {status === 'online' ? 'Bot Online' : 'Bot Offline'}
        </span>
      </div>
    </aside>
  );
}
