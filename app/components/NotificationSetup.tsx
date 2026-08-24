'use client';

import { useState, useEffect } from 'react';

export function NotificationSetup() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Register service worker immediately for PWA features
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[PWA] Service Worker registered:', reg.scope);
        // Check for updates periodically
        setInterval(() => reg.update(), 60 * 60 * 1000); // every hour
      }).catch((err) => {
        console.warn('[PWA] SW registration failed:', err);
      });
    }

    if ('Notification' in window) {
      setSupported(true);
      setPermission(Notification.permission);
      // Show prompt after 5 seconds if not yet decided
      if (Notification.permission === 'default') {
        const timer = setTimeout(() => setShowPrompt(true), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const requestPermission = async () => {
    if (!supported) return;

    try {
      // Register service worker
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/sw.js');
      }

      const result = await Notification.requestPermission();
      setPermission(result);
      setShowPrompt(false);

      if (result === 'granted') {
        // Send a test notification
        new Notification('🎉 Notifications Enabled!', {
          body: 'You\'ll now receive updates about your orders.',
          icon: '/images/muragoods-logo.png',
        });
      }
    } catch {
      setShowPrompt(false);
    }
  };

  if (!supported || permission !== 'default' || !showPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-4 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.2)]">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔔</span>
          <div className="flex-1">
            <p className="text-[10px] text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
              Stay Updated
            </p>
            <p className="text-xs text-[var(--cream-muted)] mt-1">
              Get notified when your order status changes!
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={requestPermission} className="deco-btn deco-btn-sm deco-btn-gold rounded-lg text-[9px]" style={{ fontFamily: 'var(--font-arcade)' }}>
                Enable
              </button>
              <button onClick={() => setShowPrompt(false)} className="deco-btn deco-btn-sm deco-btn-dark rounded-lg text-[9px]" style={{ fontFamily: 'var(--font-arcade)' }}>
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Send notification helper (for use in other components)
export function sendNotification(title: string, body: string, url?: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/images/muragoods-logo.png',
      tag: url || 'muragoods',
    });
  }
}
