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
    const baseClasses = 'fixed inset-0 flex items-center justify-center z-50 p-4';
    const modalClasses = 'border-2 border-[var(--gold)] bg-[var(--charcoal)] max-w-lg w-full animate-bounce';

    switch (type) {
      case 'success':
      case 'order-placed':
        return {
          backdrop: baseClasses + ' bg-[rgba(10,10,10,0.85)]',
          modal: modalClasses,
          headerBg: 'border-b-2 border-[var(--gold)]',
          headerText: 'text-[var(--gold-bright)]',
          headerTitle: type === 'order-placed' ? 'ORDER PLACED!' : 'SUCCESS!',
        };
      case 'order-completed':
        return {
          backdrop: baseClasses + ' bg-[rgba(10,10,10,0.85)]',
          modal: modalClasses,
          headerBg: 'border-b-2 border-[var(--crimson)]',
          headerText: 'text-[var(--gold-bright)]',
          headerTitle: 'ORDER COMPLETED!',
        };
      case 'error':
        return {
          backdrop: baseClasses + ' bg-[rgba(10,10,10,0.85)]',
          modal: modalClasses,
          headerBg: 'border-b-2 border-[var(--crimson)]',
          headerText: 'text-[var(--crimson)]',
          headerTitle: 'ERROR!',
        };
      case 'warning':
        return {
          backdrop: baseClasses + ' bg-[rgba(10,10,10,0.85)]',
          modal: modalClasses,
          headerBg: 'border-b-2 border-[var(--gold)]',
          headerText: 'text-[var(--gold-bright)]',
          headerTitle: 'WARNING!',
        };
      default:
        return {
          backdrop: baseClasses + ' bg-[rgba(10,10,10,0.85)]',
          modal: modalClasses,
          headerBg: 'border-b-2 border-[var(--gold)]',
          headerText: 'text-[var(--gold)]',
          headerTitle: 'INFO',
        };
    }
  };

  const styles = getStyles();

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`p-5 ${styles.headerBg}`}>
          <h2
            className={`text-sm uppercase ${styles.headerText}`}
            style={{ fontFamily: 'var(--font-arcade)' }}
          >
            {styles.headerTitle}
          </h2>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 bg-[var(--charcoal)]">
          <p className="text-sm text-[var(--cream)] text-center" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
            {title}
          </p>
          <p className="text-sm text-[var(--pewter)] text-center">{message}</p>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-[rgba(212,175,55,0.2)] p-4 bg-[var(--charcoal-light)] text-center">
          <button
            onClick={onClose}
            className="deco-btn deco-btn-gold w-full"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
