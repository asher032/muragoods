'use client';

import { BottomNavBar } from '@/app/components/BottomNavBar';

// This wrapper component is used in layout.tsx to add the bottom nav globally
// It reads cart count from localStorage if needed
export function AddBottomNav() {
  return <BottomNavBar />;
}
