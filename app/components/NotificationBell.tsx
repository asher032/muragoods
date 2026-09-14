'use client';

import { useState, useRef, useEffect } from 'react';
import { useNotifications, type Notification } from './NotificationSystem';
import { Bell, CircleCheck, CircleX, Info, MessageCircle, Package, TriangleAlert } from 'lucide-react';
export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const typeIcons: Record<string, React.ReactNode> = {
    info: <Info className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, 
    success: <CircleCheck color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />,
    warning: <TriangleAlert color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />,
    error: <CircleX color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />,
    support: <MessageCircle className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />,
    order: <Package className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />,
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,214,10,0.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      >
        <span style={{ fontSize: '16px' }}><Bell className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            minWidth: '18px',
            height: '18px',
            borderRadius: '9px',
            background: 'var(--mario-red)',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 700,
            fontFamily: 'var(--font-arcade)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            boxShadow: '0 2px 6px rgba(230,57,70,0.4)',
            animation: unreadCount > 0 ? 'pulse-glow 1.5s ease-in-out infinite' : 'none',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '42px',
          right: 0,
          width: '340px',
          maxHeight: '480px',
          background: 'var(--mario-bg-card)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          animation: 'slideDown 0.2s ease',
          zIndex: 100,
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-yellow)', textTransform: 'uppercase' }}>Notifications</p>
              {unreadCount > 0 && <p style={{ fontSize: '9px', color: 'var(--mario-text-muted)', marginTop: '2px' }}>{unreadCount} unread</p>}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} style={{ fontSize: '8px', padding: '4px 8px', background: 'rgba(255,214,10,0.1)', border: '1px solid rgba(255,214,10,0.2)', borderRadius: '6px', color: 'var(--mario-yellow)', cursor: 'pointer', fontFamily: 'var(--font-arcade)' }}>
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearNotifications} style={{ fontSize: '8px', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--mario-text-muted)', cursor: 'pointer' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: '28px', marginBottom: '8px' }}><Bell className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></p>
                <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 30).map(notif => (
                <NotificationItem
                  key={notif.id}
                  notification={notif}
                  icon={typeIcons[notif.type] || <Info className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />}
                  formatTime={formatTime}
                  onClick={() => {
                    markAsRead(notif.id);
                    if (notif.url) {
                      setIsOpen(false);
                      window.location.href = notif.url;
                    }
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideDown {
          from { transform: translateY(-8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 2px 6px rgba(230,57,70,0.4); }
          50% { box-shadow: 0 2px 12px rgba(230,57,70,0.7); }
        }
      `}</style>
    </div>
  );
}

function NotificationItem({ notification, icon, formatTime, onClick }: { notification: Notification; icon: React.ReactNode; formatTime: (ts: number) => string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: notification.url ? 'pointer' : 'default',
        background: notification.read ? 'transparent' : 'rgba(255,214,10,0.03)',
        transition: 'background 0.15s',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = notification.read ? 'transparent' : 'rgba(255,214,10,0.03)'; }}
    >
      <span style={{ fontSize: '16px', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <p style={{ fontSize: '11px', fontWeight: notification.read ? 400 : 700, color: 'var(--mario-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notification.title}</p>
          {!notification.read && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--mario-yellow)', flexShrink: 0 }} />}
        </div>
        <p style={{ fontSize: '10px', color: 'var(--mario-text-muted)', marginTop: '2px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{notification.message}</p>
        <p style={{ fontSize: '8px', color: 'var(--pewter)', marginTop: '4px' }}>{formatTime(notification.timestamp)}</p>
      </div>
    </div>
  );
}
