'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import MuraStreamLayout from './components/MuraStreamLayout';
import ContentLockGate from '@/app/components/ContentLockGate';
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
        /* ─── Theme variables ──────────────────────────────────
           Murastream sits on the ONE Muragoods foundation: the dark
           navy canvas, the shared surface ramp, the shared type
           ramp, and Muragoods yellow as the accent. The red that
           used to drive this whole product is now a SECONDARY
           cinematic accent (--ms-cinema) used only inside poster
           affordances, never for navigation, CTAs or focus. */
        .ms-root {
          --ms-bg: var(--mg-bg);
          --ms-surface: var(--mg-surface);
          --ms-surface-2: var(--mg-surface-2);
          --ms-border: var(--mg-border);
          --ms-border-2: var(--mg-border-strong);
          --ms-text: var(--mg-text);
          --ms-text-strong: var(--mg-text-strong);
          --ms-text-muted: var(--mg-text-muted);
          --ms-text-dim: var(--mg-text-dim);
          --ms-text-faint: var(--mg-text-faint);
          --ms-text-ghost: var(--mg-text-faint);
          --ms-overlay: var(--mg-overlay);
          --ms-line: var(--mg-border);
          --ms-font: var(--font-sans);
          /* Primary accent = the brand. */
          --ms-accent: var(--mg-brand);
          --ms-accent-hover: var(--mg-brand-hover);
          --ms-accent-soft: var(--mg-brand-soft);
          --ms-accent-softer: var(--mg-brand-softer);
          --ms-accent-border: var(--mg-border-brand);
          --ms-accent-ink: var(--mg-brand-ink);
          /* Secondary, cinematic only. */
          --ms-cinema: var(--mg-accent-stream);
          --ms-cinema-soft: var(--mg-accent-stream-soft);
        }
        html.ms-light .ms-root {
          --ms-bg: #f4f4f8;
          --ms-surface: #ffffff;
          --ms-surface-2: #fbfbfd;
          --ms-border: rgba(15, 15, 26, 0.12);
          --ms-border-2: rgba(15, 15, 26, 0.22);
          --ms-text: #23232c;
          --ms-text-strong: #10101a;
          --ms-text-muted: #55555f;
          --ms-text-dim: #6a6a76;
          --ms-text-faint: #8b8b97;
          --ms-text-ghost: #a0a0ac;
          --ms-overlay: rgba(255, 255, 255, 0.98);
          --ms-line: rgba(20, 20, 40, 0.1);
          --ms-accent: var(--mg-brand-deep);
          --ms-accent-hover: var(--mg-brand);
          --ms-accent-ink: #ffffff;
          --ms-accent-border: rgba(212, 160, 23, 0.5);
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
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          cursor: pointer;
          box-sizing: border-box;
          flex-shrink: 0;
          text-decoration: none;
          color: inherit;
        }
        .ms-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 14px 30px rgba(0,0,0,0.55);
          z-index: 10;
        }
        .ms-card-image {
          width: 100%;
          aspect-ratio: 2/3;
          border-radius: 12px;
          overflow: hidden;
          background-color: var(--mg-bg-deep);
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
          background: linear-gradient(135deg, var(--mg-bg-deep) 0%, var(--mg-surface) 100%);
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
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 600;
          color: var(--mg-text-strong);
          z-index: 2;
        }
        .ms-card-rating span { color: var(--ms-accent); }
        .ms-card-country {
          position: absolute;
          top: 8px;
          left: 8px;
          /* The one place the cinematic red earns its keep: a small
             country flag chip on a poster. Accent, not identity. */
          background: rgba(230, 57, 70, 0.85);
          backdrop-filter: blur(8px);
          border-radius: 6px;
          padding: 3px 8px;
          font-family: var(--font-sans);
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
          background: var(--ms-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: scale(0.8);
          transition: transform 0.2s ease;
          box-shadow: 0 4px 20px var(--mg-brand-glow);
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
          font-family: var(--font-sans);
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
          background: var(--ms-accent);
          color: var(--ms-accent-ink);
        }
        .ms-card-action-btn.primary:hover { background: var(--ms-accent-hover); }
        .ms-card-action-btn.secondary {
          background: rgba(255,255,255,0.12);
          color: var(--mg-text-strong);
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
          background: linear-gradient(90deg, var(--mg-brand), var(--mg-brand-deep));
          border-radius: 0 3px 0 0;
          transition: width 0.3s;
        }
        .ms-card-info {
          padding: 10px 2px 0;
        }
        .ms-card-title {
          margin: 0;
          font-size: 13px;
          font-family: var(--font-sans);
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
          min-height: 15px;
          font-size: 12px;
          font-family: var(--font-sans);
          color: var(--ms-text-faint);
        }
        .ms-card-episode { color: var(--ms-accent); font-weight: 600; }
        /* ─── Scroll Row ──────────────────────────────── */
        .ms-scroll::-webkit-scrollbar { height: 4px; }
        .ms-scroll::-webkit-scrollbar-track { background: transparent; }
        .ms-scroll::-webkit-scrollbar-thumb { background: var(--mg-surface-3); border-radius: 2px; }
        .ms-scroll::-webkit-scrollbar-thumb:hover { background: var(--mg-text-faint); }
        .ms-row { margin-bottom: 56px; }
        .ms-row-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          padding: 0 4px;
        }
        .ms-row-title {
          font-family: var(--font-sans);
          font-size: 18px;
          font-weight: 700;
          color: var(--ms-text-strong);
          margin: 0;
          letter-spacing: -0.01em;
        }
        .ms-row-more {
          font-family: var(--font-sans);
          font-size: 13px;
          color: var(--ms-accent);
          text-decoration: none;
          font-weight: 500;
          transition: opacity 0.2s;
          opacity: 0.8;
        }
        .ms-row-more:hover { opacity: 1; }
        .ms-row-items {
          display: flex;
          gap: 24px;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 8px 4px 22px;
          scroll-behavior: smooth;
          scroll-snap-type: x proximity;
        }
        .ms-row-items::-webkit-scrollbar { display: none; }
        .ms-row-items > * { width: clamp(150px, 24vw, 190px); flex-shrink: 0; scroll-snap-align: start; }
        .ms-row-tools { display: flex; align-items: center; gap: 8px; }
        .ms-row-nav {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 1px solid var(--ms-border);
          background: rgba(255,255,255,0.06);
          color: var(--ms-text);
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
          flex-shrink: 0;
        }
        .ms-row-nav:hover { background: var(--ms-accent-soft); border-color: var(--ms-accent); color: var(--ms-accent); }
        /* ─── Keyboard focus (accessibility) ─────────────── */
        .ms-card:focus-visible {
          outline: 2px solid var(--ms-accent);
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
          outline: 2px solid var(--ms-accent);
          outline-offset: 2px;
          border-radius: 8px;
        }
        /* ─── Section Labels ───────────────────────────── */
        .ms-section-label {
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--ms-accent);
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
        .ms-root { background: var(--ms-bg); min-height: 100vh; overflow-x: clip; }
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
          border: 4px solid var(--ms-accent-soft);
          border-top-color: var(--ms-accent);
          animation: customLoaderSpin 0.9s linear infinite;
        }
        @keyframes customLoaderSpin {
          to { transform: rotate(360deg); }
        }
        /* ─── Top-10 ranked row (home trending) ────────────
            Rank is a small badge INSIDE the poster (bottom-left) — nothing
            is positioned outside the card, so overflow/clipping is
            impossible by construction. Cards are fixed 150px (responsive
            steps below); the row scrolls the remainder. */
        .ms-rank-row {
          padding: 24px clamp(20px, 4vw, 40px) 32px;
          margin-bottom: 0;
        }
        .ms-rank-row .ms-row-header { margin-bottom: 24px; }
        .ms-rank-row .ms-card {
          flex: 0 0 150px;
          width: 150px;
          max-width: 150px;
        }
        .ms-rank-row .ms-card-image { border-radius: 10px; }
        .ms-rank-row .ms-card-title { font-size: 14px; line-height: 20px; }
        .ms-rank-row .ms-card-meta { margin-top: 4px; }
        .ms-rank-badge {
          position: absolute;
          left: 8px;
          bottom: 8px;
          background: rgba(0,0,0,0.72);
          backdrop-filter: blur(8px);
          border-radius: 8px;
          padding: 3px 9px;
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--mg-text-strong);
          z-index: 2;
          pointer-events: none;
        }
        @media (max-width: 1024px) {
          .ms-rank-row .ms-card { flex-basis: 140px; width: 140px; max-width: 140px; }
        }
        @media (max-width: 640px) {
          .ms-rank-row .ms-card { flex-basis: 128px; width: 128px; max-width: 128px; }
        }
      `}</style>
      {/* What's New toast (one-time per changelog entry) */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 84, right: 20, zIndex: 500,
          background: 'var(--ms-overlay)', border: '1px solid var(--ms-accent-soft)',
          borderRadius: 12, padding: '14px 16px', width: 300, maxWidth: 'calc(100vw - 32px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
        }}>
          <p style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ScrollIcon size={13} color="var(--ms-accent)" />
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: 9, color: 'var(--ms-accent)', letterSpacing: '0.1em' }}>WHAT'S NEW IN MURASTREAM</span>
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ms-text-strong)', fontWeight: 600 }}>
            {LATEST_CHANGELOG.title}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => dismissToast(true)} style={{
              flex: 1, padding: '8px', borderRadius: 6, border: '1px solid var(--ms-accent)',
              background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>See what's new</button>
            <button onClick={() => dismissToast(false)} style={{
              padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ms-border-2)',
              background: 'transparent', color: 'var(--ms-text-dim)', fontSize: 12, cursor: 'pointer',
            }}>Dismiss</button>
          </div>
        </div>
      )}
      <ContentLockGate>
        <MuraStreamLayout>
          <div className={`ms-page-transition-${transitionStage}`}>
            {displayChildren}
          </div>
        </MuraStreamLayout>
      </ContentLockGate>
    </div>
  );
}
