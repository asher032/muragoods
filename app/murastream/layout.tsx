'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import MuraStreamLayout from './components/MuraStreamLayout';

export default function MuraStreamLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [transitionStage, setTransitionStage] = useState('enter');

  useEffect(() => {
    setTransitionStage('exit');
    const timer = setTimeout(() => {
      setDisplayChildren(children);
      setTransitionStage('enter');
    }, 150);
    return () => clearTimeout(timer);
  }, [pathname]);

  // Also update children when they change (same page, different data)
  useEffect(() => {
    setDisplayChildren(children);
  }, [children]);

  return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh' }}>
      <style jsx global>{`
        /* ─── Card System ────────────────────────────────── */
        .ms-card {
          display: flex;
          flex-direction: column;
          width: 200px;
          background-color: transparent;
          border-radius: 12px;
          overflow: visible;
          transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.3s;
          cursor: pointer;
          box-sizing: border-box;
          flex-shrink: 0;
          text-decoration: none;
          color: inherit;
        }
        .ms-card:hover {
          transform: translateY(-8px) scale(1.02);
          z-index: 10;
        }
        .ms-card-image {
          width: 100%;
          aspect-ratio: 2/3;
          border-radius: 12px;
          overflow: hidden;
          background-color: #141414;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .ms-card-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.4s ease, filter 0.4s ease;
        }
        .ms-card:hover .ms-card-image img {
          transform: scale(1.05);
          filter: brightness(0.7);
        }
        .ms-card-noimg {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #141414 0%, #1A1A2E 100%);
        }
        .ms-card-rating {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(8px);
          border-radius: 6px;
          padding: 3px 8px;
          display: flex;
          align-items: center;
          gap: 3px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 11px;
          font-weight: 600;
          color: #fff;
          z-index: 2;
        }
        .ms-card-rating span { color: #B85CFF; }
        .ms-card-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%, rgba(0,0,0,0.3) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          opacity: 0;
          transition: opacity 0.3s ease;
          border-radius: 12px;
          z-index: 3;
        }
        .ms-card:hover .ms-card-overlay { opacity: 1; }
        .ms-card-play {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(184, 92, 255, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: scale(0.8);
          transition: transform 0.2s ease;
          box-shadow: 0 4px 20px rgba(184,92,255,0.4);
        }
        .ms-card:hover .ms-card-play { transform: scale(1); }
        .ms-card-actions-row {
          position: absolute;
          bottom: 10px;
          left: 10px;
          right: 10px;
          display: flex;
          gap: 6px;
          opacity: 0;
          transform: translateY(4px);
          transition: all 0.25s ease 0.05s;
        }
        .ms-card:hover .ms-card-actions-row { opacity: 1; transform: translateY(0); }
        .ms-card-action-btn {
          flex: 1;
          padding: 6px 0;
          border-radius: 6px;
          border: none;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transition: all 0.15s;
        }
        .ms-card-action-btn.primary {
          background: #B85CFF;
          color: #fff;
        }
        .ms-card-action-btn.primary:hover { background: #a04fe0; }
        .ms-card-action-btn.secondary {
          background: rgba(255,255,255,0.12);
          color: #fff;
          backdrop-filter: blur(4px);
        }
        .ms-card-action-btn.secondary:hover { background: rgba(255,255,255,0.2); }
        .ms-card-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(255,255,255,0.15);
          z-index: 2;
        }
        .ms-card-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #B85CFF, #9333EA);
          border-radius: 0 3px 0 0;
          transition: width 0.3s;
        }
        .ms-card-info {
          padding: 10px 2px 0;
        }
        .ms-card-title {
          margin: 0;
          font-size: 13px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-weight: 600;
          color: #E5E5E5;
          cursor: default;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ms-card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 3px;
          font-size: 12px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #777;
        }
        .ms-card-episode { color: #B85CFF; font-weight: 600; }
        /* ─── Scroll Row ──────────────────────────────── */
        .ms-scroll::-webkit-scrollbar { height: 4px; }
        .ms-scroll::-webkit-scrollbar-track { background: transparent; }
        .ms-scroll::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 2px; }
        .ms-scroll::-webkit-scrollbar-thumb:hover { background: #3A3A3A; }
        .ms-row { margin-bottom: 40px; }
        .ms-row-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          padding: 0 4px;
        }
        .ms-row-title {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: #F5F5F5;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .ms-row-more {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          color: #B85CFF;
          text-decoration: none;
          font-weight: 500;
          transition: opacity 0.2s;
          opacity: 0.8;
        }
        .ms-row-more:hover { opacity: 1; }
        .ms-row-items {
          display: flex;
          gap: 18px;
          overflow-x: auto;
          padding: 8px 4px 16px;
          scroll-behavior: smooth;
          scroll-snap-type: x proximity;
        }
        .ms-row-items > * { scroll-snap-align: start; }
        /* ─── Section Labels ───────────────────────────── */
        .ms-section-label {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #B85CFF;
          margin-bottom: 16px;
        }
        /* ─── Smooth page transitions ──────────────────── */
        @keyframes msPageEnter {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes msPageExit {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-8px); }
        }
        .ms-page-transition-enter {
          animation: msPageEnter 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        .ms-page-transition-exit {
          animation: msPageExit 0.15s ease-in forwards;
        }
      `}</style>
      <MuraStreamLayout>
        <div className={`ms-page-transition-${transitionStage}`}>
          {displayChildren}
        </div>
      </MuraStreamLayout>
    </div>
  );
}
