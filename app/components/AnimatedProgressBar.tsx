'use client';

import { useEffect, useState } from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  color?: string;
  height?: number;
}

export function AnimatedProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  color,
  height = 8,
}: ProgressBarProps) {
  const [mounted, setMounted] = useState(false);
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ width: '100%' }}>
      {(label || showValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          {label && (
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {label}
            </span>
          )}
          {showValue && (
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: color || 'var(--mario-yellow)' }}>
              {value}/{max}
            </span>
          )}
        </div>
      )}
      <div className="progress-bar-animated" style={{ height: `${height}px` }}>
        <div
          className="progress-fill"
          style={{
            width: mounted ? `${percentage}%` : '0%',
            background: color ? `linear-gradient(90deg, ${color}, ${color}cc)` : undefined,
          }}
        />
      </div>
    </div>
  );
}
