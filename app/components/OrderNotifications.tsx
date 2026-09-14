'use client';

import { useEffect, useRef } from 'react';
import { useNotifications } from './NotificationSystem';
import { sendNotification } from './NotificationSetup';
type OrderData = {
  _id: string;
  id: string;
  customer: string;
  status: string;
  total: number;
  userId: string;
};

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

function isAdminUser(): boolean {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    const user = JSON.parse(userStr);
    return ADMIN_EMAILS.includes(user.email);
  } catch { return false; }
}

// Send a real push notification (works outside Chrome too)
async function sendPushNotification(title: string, body: string, url: string) {
  try {
    // In-app notification
    sendNotification(title, body, url);

    // Server-side push notification (for when browser is closed)
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        url,
        tag: 'order-update',
        adminOnly: true,
      }),
    });
  } catch { /* empty */ }
}

export function OrderNotificationPoller() {
  const { addNotification } = useNotifications();
  const prevStatusesRef = useRef<Record<string, string>>({});
  const initialLoadRef = useRef(true);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;

    const user = JSON.parse(userStr);
    if (!user.email) return;

    const admin = isAdminUser();

    const fetchOrders = async () => {
      try {
        const isAdmin = admin ? '&isAdmin=true' : '';
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(user.email)}${isAdmin}`);
        const result = await res.json();
        if (!result.success) return;

        const orders: OrderData[] = result.data;

        orders.forEach(order => {
          const orderId = order._id || order.id;
          const prevStatus = prevStatusesRef.current[orderId];

          if (prevStatus && prevStatus !== order.status) {
            const statusMessages: Record<string, { title: string; body: string }> = {
              'Payment Verified': { title: 'Payment Verified', body: `Order #${orderId.slice(-5).toUpperCase()} payment verified!` },
              'Preparing': { title: 'Preparing Order', body: `Order #${orderId.slice(-5).toUpperCase()} is being prepared!` },
              'Out for Delivery': { title: 'Out for Delivery!', body: `Order #${orderId.slice(-5).toUpperCase()} is on its way!` },
              'Delivered': { title: 'Order Delivered!', body: `Order #${orderId.slice(-5).toUpperCase()} delivered! Points earned.` },
              'Cancelled': { title: 'Order Cancelled', body: `Order #${orderId.slice(-5).toUpperCase()} has been cancelled.` },
            };

            const msg = statusMessages[order.status];
            if (msg) {
              addNotification('order', msg.title, msg.body, `/order/${orderId}`);

              // Send push notification for admin (works outside browser)
              if (admin && (order.status === 'Payment Verified' || order.status === 'Preparing')) {
                sendPushNotification(
                  msg.title,
                  msg.body,
                  `/order/${orderId}`
                );
              }
            }
          }

          // For admin: notify about NEW orders
          if (admin && !prevStatus && initialLoadRef.current === false) {
            const isNewCustomerOrder = order.status === 'Pending' || order.status === 'Payment Pending';
            if (isNewCustomerOrder) {
              const shortId = orderId.slice(-5).toUpperCase();
              addNotification('order', 'New Order!', `New order #${shortId} from ${order.customer || 'Customer'} — ₱${order.total}`, `/order/${orderId}`);

              // Send real push notification for new orders
              sendPushNotification(
                'New Order Received!',
                `Order #${shortId} from ${order.customer || 'Customer'} — ₱${order.total}`,
                `/order/${orderId}`
              );
            }
          }

          prevStatusesRef.current[orderId] = order.status;
        });

        initialLoadRef.current = false;
      } catch { /* empty */ }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [addNotification]);

  return null;
}
