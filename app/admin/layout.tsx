import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { resolveAccess, describeAccess } from '@/app/lib/access-control';
import AdminShell from './components/AdminShell';

// ─────────────────────────────────────────────────────────────────────────
// Server-side gate for the whole Muragoods Admin Panel.
//
// Previously each /admin page decided for itself whether the visitor was an
// admin — in the browser, from a flag in a React context. That meant the page
// SHELL rendered for anyone, and the real protection lived only in the API
// routes behind it. Authorisation belongs in front of the pages, on the
// server, resolved from the session.
//
// Two doors in, one decision out (app/lib/access-control):
//   Muragoods owner   → in, full ecosystem control
//   Muragoods staff   → in, limited to the scopes the sidebar hides
//   anyone else       → sent to the Discord Server Dashboard, which is the
//                       product their access actually belongs to
// ─────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await resolveAccess();
  const summary = describeAccess(access);

  if (access.level !== 'muragoods_owner' && access.level !== 'muragoods_staff') {
    // Not an error page: this is the normal answer for someone whose authority
    // is per-server Discord access. They belong in the dashboard.
    redirect('/dashboard');
  }

  return (
    <AdminShell
      access={{
        level: access.level,
        label: summary.label,
        detail: summary.detail,
        scopes: access.scopes,
        name: access.name,
        email: access.email,
      }}
    >
      {children}
    </AdminShell>
  );
}
