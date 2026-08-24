'use client';

import { useEffect, useRef } from 'react';
import { useNotifications } from './NotificationSystem';

type OrderData = {
  _id: string;
  id: string;
  customer: string;
  status: string;
  total: number;
  userId: string;
};

export function OrderNotificationPoller() {
  const { addNotification } = useNotifications();
  const prevStatusesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;

    const user = JSON.parse(userStr);
    if (!user.email) return;

    // Initial fetch to set baselines
    const fetchOrders = async () => {
      try {
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(user.email)}`);
        const result = await res.json();
        if (!result.success) return;

        const orders: OrderData[] = result.data;

        orders.forEach(order => {
          const orderId = order._id || order.id;
          const prevStatus = prevStatusesRef.current[orderId];

          if (prevStatus && prevStatus !== order.status) {
            // Status changed — send notification
            const statusMessages: Record<string, { title: string; body: string }> = {
              'Payment Verified': { title: '✅ Payment Verified', body: `Your order #${orderId.slice(-5).toUpperCase()} payment has been verified!` },
              'Preparing': { title: '👨‍🍳 Preparing Your Order', body: `Your order #${orderId.slice(-5).toUpperCase()} is now being prepared!` },
              'Out for Delivery': { title: '🚚 Out for Delivery!', body: `Your order #${orderId.slice(-5).toUpperCase()} is on its way to you!` },
              'Delivered': { title: '🎉 Order Delivered!', body: `Your order #${orderId.slice(-5).toUpperCase()} has been delivered. Enjoy! 🪙 Points earned.` },
              'Cancelled': { title: '❌ Order Cancelled', body: `Your order #${orderId.slice(-5).toUpperCase()} has been cancelled.` },
            };

            const msg = statusMessages[order.status];
            if (msg) {
              addNotification('order', msg.title, msg.body, `/order/${orderId}`);
            }
          }

          prevStatusesRef.current[orderId] = order.status;
        });
      } catch { /* empty */ }
    };

    // Fetch immediately to set baselines
    fetchOrders();

    // Poll every 15 seconds
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [addNotification]);

  return null;
}
