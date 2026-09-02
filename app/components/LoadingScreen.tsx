'use client';

import { useState, useEffect } from 'react';

export function LoadingScreen() {
  const [phase, setPhase] = useState<'logo' | 'text' | 'done'>('logo');
  const [dots, setDots] = useState('');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('text'), 600);
    const t2 = setTimeout(() => setPhase('done'), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loader-root">
      {/* Radial glow */}
      <div className="loader-glow" />

      {/* Orbital rings + logo */}
      <div className="loader-logo-wrap">
        <div className="loader-ring loader-ring-outer" />
        <div className="loader-ring loader-ring-inner" />

        <div className="loader-orb">
          <span className="loader-mushroom">🍄</span>
          <div className="loader-dot" />
        </div>
      </div>

      {/* Brand text */}
      <div className="loader-text" style={{
        opacity: phase !== 'logo' ? 1 : 0,
        transform: phase !== 'logo' ? 'translateY(0)' : 'translateY(10px)',
      }}>
        <p className="loader-brand">MURAGOODS</p>
        <p className="loader-sub">LOADING POWER-UPS{dots}</p>
      </div>

      {/* Progress bar */}
      <div className="loader-bar-track">
        <div className="loader-bar-fill" />
      </div>
    </div>
  );
}
