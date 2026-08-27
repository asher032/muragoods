'use client';

import { useState, useEffect, useCallback } from 'react';

const VAPID_PUBLIC_KEY = 'BF_2cqhc2nDPiUxapJmKZ7Ehj1r1ZABKScFwPpFgNt7BjC-FE332ikV9qgwgy8bx5l7wz7ADg4xMsbyVKAgP_w8';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Subscribe to push notifications
async function subscribeToPush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return true;

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Get user info from localStorage
    let email = '';
    let userId = '';
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        email = user.email || '';
        userId = user.userId || user._id || '';
      }
    } catch { /* empty */ }

    // Save subscription to server
    const subJson = subscription.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: {
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        },
        email,
        userId,
      }),
    });

    console.log('[Push] Subscribed to push notifications');
    return true;
  } catch (err) {
    console.error('[Push] Subscription failed:', err);
    return false;
  }
}

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

function isAdminUser(): boolean {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    const user = JSON.parse(userStr);
    return ADMIN_EMAILS.includes(user.email);
  } catch { return false; }
}

export function NotificationSetup() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Only show for admin users
    setIsAdmin(isAdminUser());

    // Register service worker immediately
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[PWA] Service Worker registered:', reg.scope);
        setInterval(() => reg.update(), 60 * 60 * 1000);
      }).catch((err) => {
        console.warn('[PWA] SW registration failed:', err);
      });
    }

    if ('Notification' in window) {
      setSupported(true);
      setPermission(Notification.permission);
      // Check if already subscribed
      if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.pushManager.getSubscription().then(sub => {
            setIsSubscribed(!!sub);
          });
        });
      }
      // Show prompt after 5 seconds if admin and not yet decided
      if (Notification.permission === 'default' && isAdminUser()) {
        const timer = setTimeout(() => setShowPrompt(true), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const requestPermission = useCallback(async () => {
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
        // Subscribe to push notifications
        const subscribed = await subscribeToPush();
        setIsSubscribed(subscribed);

        // Send a test notification
        new Notification('🎉 Notifications Enabled!', {
          body: 'You\'ll now receive real-time order updates — even when the browser is closed!',
          icon: '/images/muragoods-logo.png',
        });
      }
    } catch {
      setShowPrompt(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
          setIsSubscribed(false);
        }
      }
    } catch { /* empty */ }
  }, []);

  // Listen for re-prompt events (e.g., when admin logs in)
  useEffect(() => {
    const handler = () => {
      if (Notification.permission === 'default') setShowPrompt(true);
      else if (Notification.permission === 'granted' && !isSubscribed) {
        subscribeToPush().then(setIsSubscribed);
      }
    };
    window.addEventListener('request-notification-permission', handler);
    return () => window.removeEventListener('request-notification-permission', handler);
  }, [isSubscribed]);

  if (!supported || !showPrompt || !isAdmin) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 max-w-xs">
      <div className="border border-[var(--gold)] bg-[var(--charcoal)] p-3 rounded-lg shadow-[0_0_12px_rgba(212,175,55,0.15)]">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔔</span>
          <div className="flex-1">
            <p className="text-[9px] text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
              Order Alerts
            </p>
            <p className="text-[10px] text-[var(--cream-muted)] mt-0.5">
              Get notified when new orders come in.
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={requestPermission} className="deco-btn deco-btn-sm deco-btn-gold rounded-lg text-[8px] px-3 py-1.5" style={{ fontFamily: 'var(--font-arcade)' }}>
            Enable
          </button>
          <button onClick={() => setShowPrompt(false)} className="text-[8px] px-3 py-1.5 rounded-lg border border-white/10 text-[var(--pewter)] hover:text-white transition-colors" style={{ fontFamily: 'var(--font-arcade)' }}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

// Send notification helper
export function sendNotification(title: string, body: string, url?: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/images/muragoods-logo.png',
      tag: url || 'muragoods',
    });
  }
}
