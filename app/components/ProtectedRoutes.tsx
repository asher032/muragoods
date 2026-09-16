'use client';

import { usePathname } from 'next/navigation';
import AuthGate from './AuthGate';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/dashboard',
  '/api',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/icons',
  '/images',
];

export default function ProtectedRoutes({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Check if current route is public
  const isPublic = PUBLIC_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  );

  // Public routes — no auth gate
  if (isPublic) {
    return <>{children}</>;
  }

  // Protected routes — require authentication
  return <AuthGate>{children}</AuthGate>;
}
