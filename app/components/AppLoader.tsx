'use client';

import { useState, useEffect } from 'react';
import { LoadingScreen } from './LoadingScreen';

export function AppLoader({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if this is the first visit in this session
    const hasLoaded = sessionStorage.getItem('muragoods_loaded');
    if (hasLoaded) {
      setLoading(false);
      return;
    }

    // Show loading screen for 1.5s on first visit
    const timer = setTimeout(() => {
      sessionStorage.setItem('muragoods_loaded', 'true');
      setLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
