'use client';

import { useState, useEffect, useRef } from 'react';
import { useJarvis } from './JARVISProvider';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

export function JARVISOrb() {
  const { openJarvis, isOpen } = useJarvis();
  const [isAdmin, setIsAdmin] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const orbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setIsAdmin(ADMIN_EMAILS.includes(user.email));
      }
    } catch { /* empty */ }
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!orbRef.current) return;
      const r = orbRef.current.getBoundingClientRect();
      setMousePos({
        x: (e.clientX - (r.left + r.width / 2)) / r.width,
        y: (e.clientY - (r.top + r.height / 2)) / r.height,
      });
    };
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, []);

  if (!isAdmin || isOpen) return null;

  return (
    <>
      <style jsx>{`
        .jarvis-orb-float {
          position: fixed;
          bottom: 80px;
          right: 20px;
          z-index: 9000;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.3s ease;
          animation: orb-float 3s ease-in-out infinite;
        }
        .jarvis-orb-float:hover {
          transform: scale(1.15);
        }
        .jarvis-orb-float:active {
          transform: scale(0.95);
        }
        .orb-core-float {
          position: absolute;
          inset: 8px;
          border-radius: 50%;
          background: radial-gradient(
            circle at ${50 + mousePos.x * 20}% ${50 + mousePos.y * 20}%,
            #00e5ff, #0066ff, #001a66
          );
          box-shadow:
            0 0 20px rgba(0,229,255,0.4),
            0 0 40px rgba(0,100,255,0.2),
            inset 0 0 15px rgba(255,255,255,0.1);
          animation: core-pulse 3s ease-in-out infinite;
          transition: box-shadow 0.3s;
        }
        .jarvis-orb-float:hover .orb-core-float {
          box-shadow:
            0 0 30px rgba(0,229,255,0.6),
            0 0 60px rgba(0,100,255,0.3),
            inset 0 0 20px rgba(255,255,255,0.15);
        }
        .orb-ring-float {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1.5px solid rgba(0,229,255,0.2);
          animation: ring-rotate 20s linear infinite;
        }
        .orb-ring2-float {
          position: absolute;
          inset: -5px;
          border-radius: 50%;
          border: 1px dashed rgba(0,229,255,0.1);
          animation: ring-rotate 30s linear infinite reverse;
        }
        .orb-particles-float {
          position: absolute;
          inset: -12px;
          pointer-events: none;
        }
        .particle-f {
          position: absolute;
          width: 2px;
          height: 2px;
          border-radius: 50%;
          background: rgba(0,229,255,0.5);
          animation: p-drift 4s ease-in-out infinite;
        }
        .particle-f:nth-child(1) { top: 5%; left: 20%; animation-delay: 0s; }
        .particle-f:nth-child(2) { top: 25%; right: 10%; animation-delay: 1s; }
        .particle-f:nth-child(3) { bottom: 15%; left: 8%; animation-delay: 2s; }
        .particle-f:nth-child(4) { bottom: 30%; right: 15%; animation-delay: 3s; }
        @keyframes orb-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes core-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes ring-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes p-drift {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 0.8; transform: translateY(-8px); }
        }
        .orb-tooltip {
          position: absolute;
          bottom: 64px;
          right: 0;
          background: rgba(0,10,25,0.9);
          border: 1px solid rgba(0,229,255,0.2);
          border-radius: 8px;
          padding: 6px 10px;
          white-space: nowrap;
          font-family: var(--font-arcade);
          font-size: 8px;
          color: #00e5ff;
          letter-spacing: 0.1em;
          opacity: 0;
          transform: translateY(4px);
          transition: all 0.2s;
          pointer-events: none;
        }
        .jarvis-orb-float:hover .orb-tooltip {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>

      <div className="jarvis-orb-float" ref={orbRef} onClick={openJarvis} title="JARVIS AI">
        <div className="orb-ring-float" />
        <div className="orb-ring2-float" />
        <div className="orb-core-float" />
        <div className="orb-particles-float">
          <div className="particle-f" />
          <div className="particle-f" />
          <div className="particle-f" />
          <div className="particle-f" />
        </div>
        <div className="orb-tooltip">J.A.R.V.I.S — Ctrl+/</div>
      </div>
    </>
  );
}
