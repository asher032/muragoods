'use client';

import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { Icon } from '@/app/components/Icon';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'support' | 'order';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  url?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (type: NotificationType, title: string, message: string, url?: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearNotifications: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const prevTicketCountsRef = useRef<Record<string, number>>({});

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('muragoods_notifications');
      if (saved) setNotifications(JSON.parse(saved));
    } catch { /* empty */ }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('muragoods_notifications', JSON.stringify(notifications.slice(0, 100)));
  }, [notifications]);

  const addNotification = useCallback((type: NotificationType, title: string, message: string, url?: string) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const notif: Notification = { id, type, title, message, timestamp: Date.now(), read: false, url };

    setNotifications(prev => [notif, ...prev].slice(0, 100));

    // Show toast
    setToasts(prev => [...prev, notif]);

    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);

    // Also send browser push notification if supported
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: '/images/muragoods-logo.png',
          tag: id,
        });
      } catch { /* empty */ }
    }
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearNotifications }}>
      {children}

      {/* Toast Container */}
      <div style={{ position: 'fixed', top: '70px', right: '16px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '360px' }}>
        {toasts.map(toast => (
          <Toast key={toast.id} notification={toast} onDismiss={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

function Toast({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const colors: Record<NotificationType, { bg: string; border: string; icon: React.ReactNode; text: string }> = {
    info: { bg: 'rgba(72,149,239,0.12)', border: 'rgba(72,149,239,0.3)', icon: 'ℹ️', text: '#4895ef' },
    success: { bg: 'rgba(6,214,160,0.12)', border: 'rgba(6,214,160,0.3)', icon: '✅', text: '#06d6a0' },
    warning: { bg: 'rgba(255,214,10,0.12)', border: 'rgba(255,214,10,0.3)', icon: '⚠️', text: '#ffd60a' },
    error: { bg: 'rgba(230,57,70,0.12)', border: 'rgba(230,57,70,0.3)', icon: '❌', text: '#e63946' },
    support: { bg: 'rgba(114,9,183,0.12)', border: 'rgba(114,9,183,0.3)', icon: <Icon name="chat" size={16} />, text: '#7209b7' },
    order: { bg: 'rgba(251,133,0,0.12)', border: 'rgba(251,133,0,0.3)', icon: <Icon name="box" size={16} />, text: '#fb8500' },
  };

  const c = colors[notification.type];

  return (
    <div
      onClick={() => { onDismiss(); if (notification.url) window.location.href = notification.url; }}
      style={{
        background: 'var(--mario-bg-card)',
        border: `1px solid ${c.border}`,
        borderRadius: '12px',
        padding: '12px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(0,0,0,0.2)',
        cursor: notification.url ? 'pointer' : 'default',
        animation: 'toastSlideIn 0.3s ease',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        backdropFilter: 'blur(16px)',
      }}
    >
      {c.icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: c.text, fontFamily: 'var(--font-arcade)', marginBottom: '2px' }}>{notification.title}</p>
        <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{notification.message}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} style={{ background: 'none', border: 'none', color: 'var(--mario-text-muted)', cursor: 'pointer', fontSize: '12px', padding: '2px', flexShrink: 0 }}>✕</button>

      <style jsx>{`
        @keyframes toastSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Helper to send browser notifications
export function sendBrowserNotification(title: string, body: string, url?: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/images/muragoods-logo.png',
        tag: url || 'muragoods',
      });
    } catch { /* empty */ }
  }
}
