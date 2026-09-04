'use client';

import MuraStreamLayout from './components/MuraStreamLayout';

export default function MuraStreamLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh' }}>
      <style jsx global>{`
        .ms-card {
          display: flex;
          flex-direction: column;
          width: 230px;
          height: 280px;
          max-height: 330px;
          background-color: #111111;
          border: 1px solid #2A2A2A;
          border-radius: 10px;
          overflow: hidden;
          transition: all 0.3s;
          cursor: pointer;
          box-sizing: border-box;
          padding: 10px;
          flex-shrink: 0;
        }
        .ms-card:hover {
          transform: translateY(-10px);
          box-shadow: 0px 20px 20px rgba(0, 0, 0, 0.3);
          border-color: #B85CFF;
        }
        .ms-card-image {
          width: 100%;
          height: 64%;
          border-radius: 10px;
          margin-bottom: 12px;
          overflow: hidden;
          background-color: #1A1A1A;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .ms-card-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .ms-card-noimg {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #1A1A1A, #222);
        }
        .ms-card-rating {
          position: absolute;
          top: 6px;
          right: 6px;
          background: rgba(0,0,0,0.75);
          border-radius: 6px;
          padding: 2px 6px;
          display: flex;
          align-items: center;
          gap: 3px;
          font-family: var(--font-arcade);
          font-size: 8px;
          color: #B85CFF;
        }
        .ms-card-rating span { color: #B85CFF; }
        .ms-card-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .ms-card:hover .ms-card-overlay { opacity: 1; }
        .ms-card-play {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(184, 92, 255, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ms-card-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(255,255,255,0.1);
        }
        .ms-card-progress-bar {
          height: 100%;
          background: #B85CFF;
          border-radius: 0 2px 0 0;
          transition: width 0.3s;
        }
        .ms-card-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .ms-card-title {
          margin: 0;
          font-size: 14px;
          font-family: "Lucida Sans", "Lucida Sans Regular", "Lucida Grande", "Lucida Sans Unicode", Geneva, Verdana, sans-serif;
          font-weight: 600;
          color: #FFFFFF;
          cursor: default;
          -webkit-box-orient: vertical;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          line-clamp: 1;
        }
        .ms-card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-family: "Lucida Sans", "Lucida Sans Regular", Geneva, Verdana, sans-serif;
          color: #A0A0A0;
        }
        .ms-card-episode { color: #B85CFF; }
        .ms-card-actions {
          display: flex;
          gap: 6px;
          padding-top: 4px;
        }
        .ms-card-action {
          background: none;
          border: 1px solid #2A2A2A;
          border-radius: 6px;
          padding: 4px 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .ms-card-action:hover {
          border-color: #B85CFF;
          background: rgba(184, 92, 255, 0.1);
        }
        .ms-scroll::-webkit-scrollbar { height: 6px; }
        .ms-scroll::-webkit-scrollbar-track { background: transparent; }
        .ms-scroll::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 3px; }
        .ms-scroll::-webkit-scrollbar-thumb:hover { background: #3A3A3A; }
        .ms-row {
          margin-bottom: 32px;
        }
        .ms-row-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding: 0 4px;
        }
        .ms-row-title {
          font-family: var(--font-arcade);
          font-size: 12px;
          color: #E5E5E5;
          margin: 0;
          letter-spacing: 0.05em;
        }
        .ms-row-more {
          font-family: var(--font-arcade);
          font-size: 9px;
          color: #555;
          text-decoration: none;
          transition: color 0.2s;
        }
        .ms-row-more:hover { color: #B85CFF; }
        .ms-row-items {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding: 8px 4px;
          scroll-behavior: smooth;
        }
      `}</style>
      <MuraStreamLayout>
        {children}
      </MuraStreamLayout>
    </div>
  );
}
