'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { NavBar } from '@/app/components/NavBar';
import { CoinBalance } from '@/app/components/CoinBalance';
import { Icon } from '@/app/components/Icon';
import { BookOpen, Circle, Pencil, Sparkles, Store, Users } from 'lucide-react';
import ContentLockGate from '@/app/components/ContentLockGate';
export default function HubPage() {
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        setUser(JSON.parse(userStr));
        setIsLoggedIn(true);
      }
    } catch { /* empty */ }
  }, []);

  const sections = [
    {
      title: 'Profile',
      icon: <Icon name="person" size={24} />,
      description: 'View your profile, ID, stats, and account settings.',
      color: 'var(--mario-blue)',
      bgColor: 'rgba(72,149,239,0.1)',
      borderColor: 'rgba(72,149,239,0.2)',
      href: '/account/profile',
      items: [
        { label: 'My Profile', href: '/account/profile', icon: <Icon name="person" size={24} /> },
        { label: 'My Orders', href: '/orders', icon: <Icon name="box" size={16} /> },
        { label: 'Order History', href: '/orders', icon: <Icon name="clipboard" size={16} /> },
        { label: 'Support', href: '/support', icon: <Icon name="chat" size={16} /> },
      ],
    },
    {
      title: 'Letters & Confessions',
      icon: <Icon name="envelope" size={24} />,
      description: 'A collection of messages and letters that people write but never send.',
      color: 'var(--mario-pink)',
      bgColor: 'rgba(255,0,110,0.1)',
      borderColor: 'rgba(255,0,110,0.2)',
      href: '/archive',
      items: [
        { label: 'Open Archive', href: '/unsent', icon: <Icon name="envelope" size={24} /> },
        { label: 'Submit a Letter', href: '/unsent/submit', icon: <Pencil className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
        { label: 'My Submissions', href: '/unsent/mine', icon: <BookOpen className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
        { label: 'Coming Soon...', href: '#', icon: <Circle className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
      ],
    },
    {
      title: 'Food Menu',
      icon: <Icon name="food" size={24} />,
      description: 'Browse our delicious campus food and drinks.',
      color: 'var(--mario-yellow)',
      bgColor: 'rgba(255,214,10,0.1)',
      borderColor: 'rgba(255,214,10,0.2)',
      href: '/menu',
      items: [
        { label: 'Full Menu', href: '/menu', icon: <Icon name="food" size={24} /> },
        { label: 'Favorites', href: '/favorites', icon: <Icon name="heart" size={16} color="#e63946" /> },
        { label: 'Cart', href: '/checkout', icon: <Icon name="cart" size={16} /> },
        { label: 'Rewards Shop', href: '/rewards', icon: <Store className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
      ],
    },
    {
      title: 'MuraStream',
      icon: <Icon name="stream" size={24} />,
      description: 'Stream movies, TV shows and K-Dramas — free, right in your browser.',
      color: '#e63946',
      bgColor: 'rgba(230,57,70,0.1)',
      borderColor: 'rgba(230,57,70,0.2)',
      href: '/murastream',
      items: [
        { label: 'Browse MuraStream', href: '/murastream', icon: <Icon name="stream" size={24} /> },
        { label: 'My Library', href: '/murastream/library', icon: <Icon name="box" size={16} /> },
        { label: 'Browse by Genre', href: '/murastream/genres', icon: <Sparkles className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
        { label: 'Watch Party', href: '/murastream/watch?type=movie&id=27205', icon: <Users className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
      ],
    },
    {
      title: 'Points & Rewards',
      icon: <Icon name="coin" size={24} />,
      description: 'Earn coins, redeem rewards, and track your balance.',
      color: 'var(--mario-green)',
      bgColor: 'rgba(6,214,160,0.1)',
      borderColor: 'rgba(6,214,160,0.2)',
      href: '/points',
      items: [
        { label: 'My Points', href: '/points', icon: <Icon name="coin" size={24} /> },
        { label: 'Rewards Shop', href: '/rewards', icon: <Store className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
        { label: 'Leaderboard', href: '/leaderboard', icon: <Icon name="trophy" size={16} /> },
        { label: 'Play Games', href: '/entertainment', icon: <Icon name="game" size={16} /> },
      ],
    },
  ];

  return (
    <ContentLockGate>
      <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Menu" />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px 60px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          {isLoggedIn && user && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              background: 'var(--mario-bg-card)',
              border: '1px solid rgba(255,214,10,0.15)',
              borderRadius: '16px',
              padding: '12px 24px',
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--mario-yellow), var(--mario-orange))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-arcade)',
                fontSize: '16px',
                color: 'var(--mario-bg)',
              }}>
                {(user.name || user.email || 'P').charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '10px',
                  color: 'var(--mario-yellow)',
                }}>{user.name || 'Player'}</p>
                <CoinBalance size="sm" />
              </div>
            </div>
          )}
          {!isLoggedIn && (
            <div>
              <h1 style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '18px',
                color: 'var(--mario-yellow)',
                textShadow: '2px 2px 0 rgba(0,0,0,0.5)',
              }}>MURAGOODS</h1>
              <p style={{ fontSize: '13px', color: 'var(--mario-text-muted)', marginTop: '6px' }}>
                Campus Food & Entertainment
              </p>
            </div>
          )}
        </div>

        {/* 4 Sections Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px',
        }}>
          {sections.map((section) => (
            <div
              key={section.title}
              style={{
                background: 'var(--mario-bg-card)',
                border: `1px solid ${section.borderColor}`,
                borderRadius: '20px',
                padding: '0',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = `0 12px 40px rgba(0,0,0,0.3), 0 0 30px ${section.bgColor}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
              }}
            >
              {/* Section Header */}
              <div style={{
                background: section.bgColor,
                padding: '20px 20px 16px',
                borderBottom: `1px solid ${section.borderColor}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  {section.icon}
                  <h2 style={{
                    fontFamily: 'var(--font-arcade)',
                    fontSize: '11px',
                    color: section.color,
                    textTransform: 'uppercase',
                  }}>{section.title}</h2>
                </div>
                <p style={{
                  fontSize: '12px',
                  color: 'var(--mario-text-muted)',
                  lineHeight: 1.4,
                }}>{section.description}</p>
              </div>

              {/* Section Items */}
              <div style={{ padding: '12px 8px' }}>
                {section.items.map((item, i) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      textDecoration: 'none',
                      color: 'var(--mario-text)',
                      fontSize: '13px',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {item.icon}
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <span style={{ color: 'var(--mario-text-muted)', fontSize: '12px' }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Links Footer */}
        <div style={{
          marginTop: '24px',
          background: 'var(--mario-bg-card)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          {[
            { href: '/', label: 'Home' },
            { href: '/terms', label: 'Terms' },
            { href: '/play/mysterybox', label: 'Mystery Box' },
            { href: '/my-codes', label: 'My Codes' },
            { href: '/play/trivia', label: 'Trivia' },
          ].map(link => (
            <Link key={link.href} href={link.href} className="mario-btn mario-btn-sm" style={{ fontSize: '9px' }}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      </main>
    </ContentLockGate>
  );
}
