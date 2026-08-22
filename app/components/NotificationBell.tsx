'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface OrderUpdate {
  id: string;
  status: string;
  message: string;
  timestamp: string;
  read: boolean;
}

const statusMessages: Record<string, string> = {
  'Pending Payment': '⏳ Your order is awaiting payment verification.',
  'Payment Verified': '✅ Payment verified! Your order is being prepared.',
  'Preparing': '👨‍🍳 Your order is being prepared with love!',
  'Out for Delivery': '🚚 Your order is on its way!',
  'Delivered': '🎉 Your order has been delivered! Enjoy!',
};

const statusColors: Record<string, string> = {
  'Pending Payment': 'var(--gold)',
  'Payment Verified': 'var(--emerald-bright)',
  'Preparing': 'var(--gold-bright)',
  'Out for Delivery': 'var(--crimson)',
  'Delivered': 'var(--emerald-bright)',
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<OrderUpdate[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [prevStatuses, setPrevStatuses] = useState<Record<string, string>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    const user = JSON.parse(userStr);
    setUserEmail(user.email);

    // Load previous statuses
    const saved = localStorage.getItem('muragoods_order_statuses');
    if (saved) {
      try { setPrevStatuses(JSON.parse(saved)); } catch { /* empty */ }
    }
  }, []);

  // Poll for order updates
  useEffect(() => {
    if (!userEmail) return;

    async function checkOrders() {
      try {
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(userEmail)}`);
        const result = await res.json();
        if (!result.success || !Array.isArray(result.data)) return;

        const newNotifications: OrderUpdate[] = [];
        const currentStatuses: Record<string, string> = {};

        for (const order of result.data) {
          const orderId = order._id || order.id;
          const currentStatus = order.status;
          currentStatuses[orderId] = currentStatus;

          // Check if status changed from what we last saw
          if (prevStatuses[orderId] && prevStatuses[orderId] !== currentStatus) {
            const alreadyNotified = notifications.some(n => n.id === orderId && n.status === currentStatus);
            if (!alreadyNotified) {
              newNotifications.push({
                id: orderId,
                status: currentStatus,
                message: statusMessages[currentStatus] || `Status updated to ${currentStatus}`,
                timestamp: new Date().toISOString(),
                read: false,
              });
            }
          }
        }

        if (newNotifications.length > 0) {
          setNotifications(prev => [...newNotifications, ...prev].slice(0, 20));
        }

        setPrevStatuses(currentStatuses);
        localStorage.setItem('muragoods_order_statuses', JSON.stringify(currentStatuses));
      } catch { /* empty */ }
    }

    checkOrders();
    const interval = setInterval(checkOrders, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [userEmail, prevStatuses, notifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] rounded-xl hover:border-[var(--gold)] transition-all"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--crimson)] text-white text-[8px] rounded-full flex items-center justify-center" style={{ fontFamily: 'var(--font-arcade)' }}>
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[rgba(242,240,228,0.12)]">
            <h3 className="text-[10px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Notifications</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[8px] text-[var(--pewter)] hover:text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} className="text-[8px] text-[var(--crimson)] hover:text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center">
                <span className="text-2xl">🔕</span>
                <p className="text-[9px] text-[var(--pewter)] mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>No notifications yet</p>
                <p className="text-[8px] text-[var(--pewter)] mt-1">Order status updates will appear here</p>
              </div>
            ) : (
              notifications.map((notif, i) => (
                <div key={`${notif.id}-${i}`} className={`p-4 border-b border-[rgba(242,240,228,0.08)] transition-colors ${notif.read ? 'opacity-60' : 'bg-[rgba(212,175,55,0.03)]'}`}>
                  <div className="flex items-start gap-3">
                    {!notif.read && <div className="w-2 h-2 bg-[var(--gold-bright)] rounded-full shrink-0 mt-1.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-[var(--cream)] leading-relaxed">{notif.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[7px] px-2 py-0.5 rounded border" style={{ fontFamily: 'var(--font-arcade)', color: statusColors[notif.status], borderColor: statusColors[notif.status], background: `${statusColors[notif.status]}15` }}>
                          {notif.status}
                        </span>
                        <span className="text-[7px] text-[var(--pewter)]">{timeAgo(notif.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <Link href="/orders" onClick={() => setIsOpen(false)} className="block p-3 text-center border-t border-[rgba(242,240,228,0.12)] text-[9px] text-[var(--gold)] hover:bg-[var(--charcoal-light)] transition-colors" style={{ fontFamily: 'var(--font-arcade)' }}>
            View All Orders →
          </Link>
        </div>
      )}
    </div>
  );
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
