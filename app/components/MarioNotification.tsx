'use client';

import { useEffect } from 'react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning' | 'order-placed' | 'order-completed';

interface MarioNotificationProps {
  title: string;
  message: string;
  type: NotificationType;
  duration?: number;
  onClose: () => void;
}

export function MarioNotification({ title, message, type, duration = 5000, onClose }: MarioNotificationProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getStyles = () => {
    const baseClasses = "fixed inset-0 flex items-center justify-center z-50 p-4";
    const modalClasses = "mario-card max-w-lg w-full shadow-2xl animate-bounce border-4 border-black";
    
    switch (type) {
      case 'success':
      case 'order-placed':
        return {
          backdrop: baseClasses + " bg-black/50",
          modal: modalClasses + " bg-white",
          headerBg: "bg-green-600",
          headerText: "text-white",
          bodyBg: "bg-white",
          icon: "✅",
          headerTitle: type === 'order-placed' ? "🎮 ORDER PLACED! 🎮" : "✅ SUCCESS!"
        };
      case 'order-completed':
        return {
          backdrop: baseClasses + " bg-black/50",
          modal: modalClasses + " bg-white",
          headerBg: "bg-red-600",
          headerText: "text-yellow-300",
          bodyBg: "bg-white",
          icon: "🎉",
          headerTitle: "🎉 ORDER COMPLETED! 🎉"
        };
      case 'error':
        return {
          backdrop: baseClasses + " bg-black/50",
          modal: modalClasses + " bg-white",
          headerBg: "bg-red-600",
          headerText: "text-white",
          bodyBg: "bg-red-50",
          icon: "❌",
          headerTitle: "⚠️ ERROR!"
        };
      case 'warning':
        return {
          backdrop: baseClasses + " bg-black/50",
          modal: modalClasses + " bg-white",
          headerBg: "bg-yellow-400",
          headerText: "text-black",
          bodyBg: "bg-yellow-50",
          icon: "⚠️",
          headerTitle: "⚠️ WARNING!"
        };
      default:
        return {
          backdrop: baseClasses + " bg-black/50",
          modal: modalClasses + " bg-white",
          headerBg: "bg-blue-600",
          headerText: "text-white",
          bodyBg: "bg-blue-50",
          icon: "ℹ️",
          headerTitle: "ℹ️ INFO"
        };
    }
  };

  const styles = getStyles();

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`${styles.headerBg} p-6 border-b-4 border-black`}>
          <h2 className={`text-3xl font-black uppercase tracking-widest ${styles.headerText}`}>
            {styles.headerTitle}
          </h2>
        </div>

        {/* Body */}
        <div className={`${styles.bodyBg} p-6 space-y-4`}>
          <p className="text-lg font-black text-black text-center">{title}</p>
          <p className="text-base font-bold text-slate-700 text-center">{message}</p>

          {/* Mario-themed decorative elements */}
          <div className="flex justify-center gap-4 text-3xl pt-4">
            <span>🍙</span>
            <span>🌭</span>
            <span>☕</span>
            <span>🍪</span>
          </div>
        </div>

        {/* Footer with close button */}
        <div className="bg-black p-4 border-t-4 border-black text-center">
          <button
            onClick={onClose}
            className="mario-btn bg-yellow-400 text-black hover:bg-yellow-300 uppercase font-black text-sm tracking-widest w-full"
          >
            🎮 Close
          </button>
        </div>
      </div>
    </div>
  );
}
