'use client';

import { useState, useEffect } from 'react';
import { Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if user previously dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Show again after 3 days
      if (Date.now() - dismissedTime < 3 * 24 * 60 * 60 * 1000) return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show banner after 10 seconds of browsing
      setTimeout(() => setShowBanner(true), 10000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed via appinstalled event
    const installedHandler = () => {
      setIsInstalled(true);
      setShowBanner(false);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } catch {
      // User cancelled or error
    } finally {
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (isInstalled || !showBanner || !deferredPrompt) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        right: '16px',
        zIndex: 9999,
        maxWidth: '420px',
        margin: '0 auto',
        animation: 'slideUp 0.4s ease',
      }}
    >
      <div
        style={{
          background: 'var(--mario-bg-card)',
          border: '2px solid rgba(255,214,10,0.3)',
          borderRadius: '16px',
          padding: '16px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 30px rgba(255,214,10,0.1)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--mario-yellow), var(--mario-orange))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              flexShrink: 0,
            }}
          >
            <Smartphone className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />
          </div>
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '9px',
                color: 'var(--mario-yellow)',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}
            >
              Install Muragoods
            </p>
            <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', lineHeight: 1.4 }}>
              Add to your home screen for quick access, offline menu browsing, and instant ordering!
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{
              flex: 1,
              padding: '10px',
              background: 'var(--mario-green)',
              border: 'none',
              borderRadius: '10px',
              color: '#0f0f1a',
              fontFamily: 'var(--font-arcade)',
              fontSize: '9px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 3px 0 var(--mario-green-dark)',
            }}
          >
            {installing ? 'INSTALLING...' : 'INSTALL NOW'}
          </button>
          <button
            onClick={handleDismiss}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              color: 'var(--mario-text-muted)',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            Not now
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
