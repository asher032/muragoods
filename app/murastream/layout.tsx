'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import MuraStreamLayout from './components/MuraStreamLayout';
import { ScrollIcon } from './components/MuraStreamIcons';
import { useMuraStreamStore } from './hooks/useMuraStreamStore';
import { LATEST_CHANGELOG, CHANGELOG_SEEN_KEY } from './data/changelog';

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

  // Settings → real behavior: theme + card density classes on <html>.
  // (Autoplay-next is consumed directly by the watch page; these two are
  // global presentation concerns owned here.)
  const { settings } = useMuraStreamStore();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('ms-light', settings.appearance === 'light');
    root.classList.toggle('ms-compact', settings.compactCards);
  }, [settings.appearance, settings.compactCards]);

  // One-time "What's New" toast for returning users when a fresh changelog
  // entry ships. Dismissing marks it seen (same key the nav badge uses).
  const [toast, setToast] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(CHANGELOG_SEEN_KEY) !== LATEST_CHANGELOG.id) {
        setToast(true);
        const t = setTimeout(() => setToast(false), 15000);
        return () => clearTimeout(t);
      }
    } catch { /* empty */ }
  }, []);
  const dismissToast = (visit: boolean) => {
    setToast(false);
    try { localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG.id); } catch { /* empty */ }
    if (visit) window.location.href = '/murastream/changelog';
  };

  return (
    <div className="ms-root">
      <style jsx global>{`
        /* ─── Theme variables (light mode via html.ms-light) ── */
        .ms-root {
          --ms-bg: #0A0A0A;
          --ms-surface: #111;
          --ms-surface-2: #171717;
          --ms-border: #1A1A1A;
          --ms-border-2: #2A2A2A;
          --ms-text: #E5E5E5;
          --ms-text-strong: #F5F5F5;
          --ms-text-muted: #A0A0A0;
          --ms-text-dim: #888;
          --ms-text-faint: #666;
          --ms-text-ghost: #555;
          --ms-overlay: rgba(20,20,20,0.97);
          --ms-line: rgba(255,255,255,0.06);
        }
        html.ms-light .ms-root {
          --ms-bg: #E9E9EF;
          --ms-surface: #F7F7FB;
          --ms-surface-2: #FDFDFE;
          --ms-border: #D8D8E2;
          --ms-border-2: #C6C6D4;
          --ms-text: #2A2A33;
          --ms-text-strong: #17171E;
          --ms-text-muted: #5A5A66;
          --ms-text-dim: #6E6E7A;
          --ms-text-faint: #8A8A96;
          --ms-text-ghost: #A2A2AE;
          --ms-overlay: rgba(247,247,251,0.98);
          --ms-line: rgba(20,20,40,0.1);
        }
        /* ─── Card System ────────────────────────────────── */
        .ms-card {
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: 190px;
          justify-self: center;
          background-color: transparent;
          border-radius: 14px;
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
        .ms-card-rating span { color: #E50914; }
        .ms-card-country {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(229,9,20,0.85);
          backdrop-filter: blur(8px);
          border-radius: 6px;
          padding: 3px 8px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #fff;
          z-index: 2;
        }
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
          background: rgba(229, 9, 20, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: scale(0.8);
          transition: transform 0.2s ease;
          box-shadow: 0 4px 20px rgba(229,9,20,0.4);
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
          background: #E50914;
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
          background: linear-gradient(90deg, #E50914, #B20710);
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
          color: var(--ms-text);
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
          color: var(--ms-text-faint);
        }
        .ms-card-episode { color: #E50914; font-weight: 600; }
        /* ─── Scroll Row ──────────────────────────────── */
        .ms-scroll::-webkit-scrollbar { height: 4px; }
        .ms-scroll::-webkit-scrollbar-track { background: transparent; }
        .ms-scroll::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 2px; }
        .ms-scroll::-webkit-scrollbar-thumb:hover { background: #3A3A3A; }
        .ms-row { margin-bottom: 56px; }
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
          color: var(--ms-text-strong);
          margin: 0;
          letter-spacing: -0.01em;
        }
        .ms-row-more {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          color: #E50914;
          text-decoration: none;
          font-weight: 500;
          transition: opacity 0.2s;
          opacity: 0.8;
        }
        .ms-row-more:hover { opacity: 1; }
        .ms-row-items {
          display: flex;
          gap: 28px;
          overflow-x: auto;
          padding: 8px 4px 22px;
          scroll-behavior: smooth;
          scroll-snap-type: x proximity;
        }
        .ms-row-items > * { width: 190px; scroll-snap-align: start; }
        /* ─── Keyboard focus (accessibility) ─────────────── */
        .ms-card:focus-visible {
          outline: 2px solid #E50914;
          outline-offset: 4px;
          border-radius: 12px;
        }
        .ms-card:focus-visible .ms-card-overlay,
        .ms-card:focus-visible .ms-card-actions-row {
          opacity: 1;
          transform: translateY(0);
        }
        .ms-root a:focus-visible,
        .ms-root button:focus-visible,
        .ms-root input:focus-visible,
        .ms-root select:focus-visible,
        .ms-root [tabindex]:focus-visible {
          outline: 2px solid #E50914;
          outline-offset: 2px;
          border-radius: 8px;
        }
        /* ─── Section Labels ───────────────────────────── */
        .ms-section-label {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #E50914;
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
        /* No forwards fill: a retained transform would create a permanent
           stacking context and trap absolutely-positioned popovers (watch
           party menu) beneath the player. */
        .ms-page-transition-enter {
          animation: msPageEnter 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        .ms-page-transition-exit {
          animation: msPageExit 0.15s ease-in forwards;
        }        /* ─── Root / settings-driven appearance ─────────── */
        .ms-root { background: var(--ms-bg); min-height: 100vh; }
        html.ms-compact .ms-card { max-width: 150px; }
        html.ms-compact .ms-row-items > * { width: 150px; }
        /* ─── Shared page container: full-bleed, centered ── */
        .ms-page-pad {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
          padding: 28px clamp(20px, 4vw, 44px);
          box-sizing: border-box;
        }
        /* ─── Player source probe spinner (watch page) ───── */
        .custom-loader {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 4px solid rgba(229, 9, 20, 0.15);
          border-top-color: #E50914;
          animation: customLoaderSpin 0.9s linear infinite;
        }
        @keyframes customLoaderSpin {
          to { transform: rotate(360deg); }
        }
        /* ─── Top-10 ranked row (home trending) ────────────
            Cards are pinned to 190px so the poster height is deterministic
            (285px), and numerals are anchored from the wrapper TOP to the
            poster's bottom edge — title wrapping can never shift them. */
        .ms-rank-item {
          position: relative;
          flex-shrink: 0;
          width: fit-content;
        }
        .ms-rank-item .ms-card {
          width: 190px;
          max-width: 190px;
        }
        .ms-rank-row .ms-row-items {
          padding-left: 44px;
        }
        .ms-rank {
          position: absolute;
          left: -18px;
          top: 193px; /* numeral box bottom lands on the poster's bottom edge */
          z-index: 2;
          font-family: 'Arial Black', -apple-system, 'Segoe UI', sans-serif;
          font-weight: 900;
          font-size: 118px;
          line-height: 0.78;
          color: #0d0d12;
          -webkit-text-stroke: 3px #E50914;
          paint-order: stroke fill;
          pointer-events: none;
          user-select: none;
        }
        .ms-rank.ms-rank-wide {
          font-size: 96px;
          left: -12px;
          top: 210px; /* same bottom edge as the regular numerals */
        }
      `}</style>
      {/* What's New toast (one-time per changelog entry) */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 84, right: 20, zIndex: 500,
          background: 'var(--ms-overlay)', border: '1px solid rgba(229,9,20,0.4)',
          borderRadius: 12, padding: '14px 16px', width: 300, maxWidth: 'calc(100vw - 32px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
        }}>
          <p style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ScrollIcon size={13} color="#E50914" />
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: 9, color: '#E50914', letterSpacing: '0.1em' }}>WHAT'S NEW IN MURASTREAM</span>
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#E5E5E5', fontWeight: 600 }}>
            {LATEST_CHANGELOG.title}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => dismissToast(true)} style={{
              flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #E50914',
              background: 'rgba(229,9,20,0.15)', color: '#E50914', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>See what's new</button>
            <button onClick={() => dismissToast(false)} style={{
              padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ms-border-2)',
              background: 'transparent', color: 'var(--ms-text-dim)', fontSize: 12, cursor: 'pointer',
            }}>Dismiss</button>
          </div>
        </div>
      )}
      <MuraStreamLayout>
        <div className={`ms-page-transition-${transitionStage}`}>
          {displayChildren}
        </div>
      </MuraStreamLayout>
    </div>
  );
}
