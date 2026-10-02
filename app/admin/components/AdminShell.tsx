'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { AccessLevel, StaffScope } from '@/app/lib/access-control';
import {
  Boxes, Building2, Clapperboard, Coins, Cpu, Fingerprint, Gamepad2, Heart, LayoutDashboard,
  LifeBuoy, ListTree, Mail, MessagesSquare, Receipt, Settings, ShieldCheck, Store,
  Ticket, Users,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// The Muragoods Admin Panel shell.
//
// Its job is to make the product boundary impossible to misread. The panel is
// NOT the Discord dashboard: it is the control centre for the whole
// Muragoods ecosystem, and it is entered as a Muragoods owner or scoped
// Muragoods staff — never as "someone who can manage one Discord server".
//
// The Discord Server Dashboard is linked from here, clearly marked as a
// different product with a different audience, because the two used to look
// like the same page for the same person.
// ─────────────────────────────────────────────────────────────────────────

export interface ShellAccess {
  level: AccessLevel;
  label: string;
  detail: string;
  scopes: StaffScope[];
  name?: string | null;
  email?: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  /** Staff scope required; owners bypass every scope. */
  scope?: StaffScope;
  hint: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: 'Muragoods',
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard, hint: 'Orders, inventory and the state of the shop' },
      { href: '/admin/health', label: 'System health', icon: Cpu, scope: 'technical', hint: 'Live probe of every service' },
      { href: '/admin/website', label: 'Website', icon: Building2, scope: 'technical', hint: 'Flags, maintenance mode, branding' },
      { href: '/admin/users', label: 'Users', icon: Users, scope: 'support', hint: 'Accounts, sessions, access' },
      { href: '/admin/staff', label: 'Staff access', icon: ShieldCheck, hint: 'Who has which scope' },
      { href: '/admin/analytics', label: 'Analytics', icon: Receipt, scope: 'analytics', hint: 'Site-wide numbers' },
      { href: '/admin/registry', label: 'Feature registry', icon: ListTree, scope: 'technical', hint: 'Every feature and who controls it' },
      { href: '/admin/trace', label: 'Identity trace', icon: Fingerprint, scope: 'technical', hint: 'One person across every system' },
      { href: '/admin/settings', label: 'Settings', icon: Settings, scope: 'technical', hint: 'Audit trail, payments, bridge, deployment' },
    ],
  },
  {
    title: 'Products',
    items: [
      { href: '/admin/murastream', label: 'Murastream', icon: Clapperboard, scope: 'murastream', hint: 'Catalog, sources, playback' },
      { href: '/admin/delivered', label: 'Orders & delivery', icon: Store, scope: 'shop', hint: 'Order status and refunds' },
      { href: '/admin/promo-codes', label: 'Promo codes', icon: Ticket, scope: 'shop', hint: 'Discounts and promotions' },
      { href: '/admin/games', label: 'Games', icon: Gamepad2, scope: 'content', hint: 'Games, scores, rewards' },
      { href: '/admin/letters', label: 'Letters', icon: Mail, scope: 'moderation', hint: 'Untold Words moderation' },
      { href: '/admin/economy', label: 'Economy', icon: Coins, scope: 'economy', hint: 'Currency, items, transactions' },
    ],
  },
  {
    title: 'Murabot',
    items: [
      { href: '/admin/murabot', label: 'Bot control', icon: Boxes, hint: 'Bridge, gateway, guild configuration' },
      { href: '/admin/modules', label: 'Modules', icon: Settings, hint: 'Module availability' },
      { href: '/admin/verification', label: 'Verification', icon: ShieldCheck, scope: 'support', hint: 'Email verification queue' },
    ],
  },
  {
    title: 'Support',
    items: [
      { href: '/admin/support', label: 'Support queue', icon: LifeBuoy, scope: 'support', hint: 'Tickets from members' },
    ],
  },
];

const LEVEL_BADGE: Record<AccessLevel, { bg: string; fg: string }> = {
  muragoods_owner: { bg: 'var(--mg-brand)', fg: 'var(--mg-brand-ink)' },
  muragoods_staff: { bg: 'var(--mg-brand-soft)', fg: 'var(--mg-brand)' },
  guild_admin: { bg: 'var(--mg-info-soft)', fg: 'var(--mg-info)' },
  user: { bg: 'var(--mg-glass-bg)', fg: 'var(--mg-text-muted)' },
};

export default function AdminShell({
  access,
  children,
}: {
  access: ShellAccess;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const badge = LEVEL_BADGE[access.level];
  const isOwner = access.level === 'muragoods_owner';

  const allowed = (item: NavItem) =>
    isOwner || !item.scope || access.scopes.includes(item.scope);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) 1fr', gap: 0, minHeight: '100vh', background: 'var(--mg-bg)' }}>
      {/* ── Sidebar: the product tree ───────────────────────────────── */}
      <aside style={{
        borderRight: '1px solid var(--mg-border)',
        background: 'var(--mg-surface)',
        padding: '18px 14px',
        display: 'flex', flexDirection: 'column', gap: 18,
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        <div>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--mg-brand)', letterSpacing: '0.06em' }}>
            MURAGOODS
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--mg-text-muted)' }}>
            Admin Panel
          </p>
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
          padding: '5px 10px', borderRadius: 'var(--mg-radius-pill)',
          background: badge.bg, color: badge.fg,
          fontSize: 11.5, fontWeight: 700,
        }}>
          <ShieldCheck size={13} />
          {access.label}
        </div>
        <p style={{ margin: '-10px 0 0', fontSize: 11.5, color: 'var(--mg-text-faint)', lineHeight: 1.45 }}>
          {access.detail}
        </p>

        {NAV.map((group) => {
          const items = group.items.filter(allowed);
          if (items.length === 0) return null;
          return (
            <nav key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <p className="mg-section-label" style={{ margin: '0 0 6px', paddingLeft: 8 }}>{group.title}</p>
              {items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.hint}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '8px 10px', borderRadius: 'var(--mg-radius-sm)',
                      textDecoration: 'none',
                      fontSize: 13, fontWeight: active ? 700 : 500,
                      color: active ? 'var(--mg-brand)' : 'var(--mg-text-muted)',
                      background: active ? 'var(--mg-brand-softer)' : 'transparent',
                      transition: 'background var(--mg-transition-fast), color var(--mg-transition-fast)',
                    }}
                  >
                    <Icon size={15} strokeWidth={active ? 2.4 : 2} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          );
        })}

        {/* The other product, clearly separated. */}
        <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--mg-border)' }}>
          <p className="mg-section-label" style={{ margin: '0 0 6px', paddingLeft: 8 }}>Elsewhere</p>
          <Link
            href="/dashboard"
            style={{
              display: 'block', padding: '10px', borderRadius: 'var(--mg-radius-md)',
              border: '1px solid var(--mg-border)', textDecoration: 'none',
              background: 'var(--mg-glass-bg)',
            }}
          >
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--mg-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessagesSquare size={13} /> Discord Server Dashboard
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--mg-text-faint)', lineHeight: 1.4 }}>
              A different product: per-server Murabot configuration for Discord admins.
              It does not manage Muragoods.
            </p>
          </Link>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <main style={{ padding: '26px 28px 64px', minWidth: 0 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>{children}</div>
      </main>
    </div>
  );
}

/** Page header used inside the panel. */
export function AdminHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header style={{ marginBottom: 22, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <h1 className="mg-section-title" style={{ fontSize: 'var(--mg-text-2xl)' }}>{title}</h1>
        {subtitle ? (
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mg-text-muted)', maxWidth: 720 }}>{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
