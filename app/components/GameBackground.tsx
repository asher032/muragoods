'use client';

import { useEffect, useMemo, useRef } from 'react';

// ─── Reusable Muragoods level background ───────────────────────────────
// One shared game-world backdrop for every Muragoods game — layered,
// parallaxed, themed, cheap (CSS transforms + one small inline SVG, no
// images, no per-game duplication).
//
//   <GameBackground theme="nightCampus" level={1} parallax />
//
// Built-in theme IDs only — there is deliberately NO backgroundUrl /
// remoteBackground / externalBackground anywhere in this system. Every
// backdrop is generated from internal CSS gradients + inline SVG scenery.
// Adding a background = one entry in THEMES + one entry in
// BACKGROUND_OPTIONS (previews, selector and level defaults pick it up
// automatically).

export type BackgroundId =
  | 'nightCampus' | 'deepSpace' | 'mysticForest' | 'neonCity'
  | 'fantasyCastle' | 'arcade' | 'sunsetCity' | 'sky' | 'midnight'
  | 'underground';

/** Legacy ids used by older pages — resolved to canonical themes, never URLs. */
export type GameTheme = BackgroundId
  | 'campus' | 'night' | 'space' | 'forest' | 'city' | 'castle';

export interface BackgroundOption {
  id: BackgroundId;
  name: string;
  emoji: string;
  blurb: string;
}

// Central configuration: adding a background means adding ONE entry here
// (plus its THEMES palette + scenery below).
export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: 'nightCampus', name: 'Night Campus', emoji: '🌙', blurb: 'Lamplit halls under starlight' },
  { id: 'deepSpace', name: 'Deep Space', emoji: '🌌', blurb: 'Nebulae and drifting starfields' },
  { id: 'mysticForest', name: 'Mystic Forest', emoji: '🌲', blurb: 'Fireflies over moonlit hills' },
  { id: 'neonCity', name: 'Neon City', emoji: '🏙️', blurb: 'Rain-slick towers, electric glow' },
  { id: 'fantasyCastle', name: 'Fantasy Castle', emoji: '🏰', blurb: 'Sorcerer spires and wisp-light' },
  { id: 'arcade', name: 'Arcade', emoji: '🎮', blurb: 'Synthwave grid and cabinet glow' },
  { id: 'sunsetCity', name: 'Sunset City', emoji: '🌆', blurb: 'Golden hour over downtown' },
  { id: 'sky', name: 'Sky', emoji: '☁️', blurb: 'Bright drifting clouds' },
  { id: 'midnight', name: 'Midnight', emoji: '⬛', blurb: 'Near-black alpine quiet' },
];

const THEME_ALIASES: Record<string, BackgroundId> = {
  campus: 'nightCampus',
  night: 'midnight',
  space: 'deepSpace',
  forest: 'mysticForest',
  city: 'neonCity',
  castle: 'fantasyCastle',
  arcade: 'arcade',
  underground: 'underground',
};

/** Resolve any stored id to a real theme. Unknown/deleted ids fall back to
 *  Night Campus — a broken background is never rendered. */
export function resolveThemeId(id: unknown): BackgroundId {
  if (typeof id === 'string') {
    if ((THEMES as Record<string, unknown>)[id]) return id as BackgroundId;
    const alias = THEME_ALIASES[id];
    if (alias) return alias;
  }
  return 'nightCampus';
}

export function backgroundName(id: unknown): string {
  const resolved = resolveThemeId(id);
  return BACKGROUND_OPTIONS.find((o) => o.id === resolved)?.name ?? 'Night Campus';
}

/** Default background per level. Players may override via settings. */
export const LEVEL_BACKGROUNDS: Record<number, BackgroundId> = {
  1: 'nightCampus',
  2: 'neonCity',
  3: 'mysticForest',
  4: 'deepSpace',
  5: 'fantasyCastle',
};

export function backgroundForLevel(level: number): BackgroundId {
  const lvl = Math.max(1, Math.min(5, Math.floor(level) || 1));
  return LEVEL_BACKGROUNDS[lvl];
}
// Layers (all pointer-events:none, never capture gameplay clicks):
//   sky gradient → stars → clouds → distant scenery (SVG) → midground
//   → foreground glow/vignette → particles.
// Gameplay/UI always paints above: this root is position:fixed z-0, so each
// page keeps its content in normal flow ABOVE it by giving the content
// wrapper position:relative + z-index:1 (one line per page).

interface ThemeDef {
  sky: [string, string, string];
  starColor: string;
  starCount: number;
  cloudColor: string;
  scene: 'campus' | 'peaks' | 'grid' | 'stars' | 'hills' | 'skyline' | 'cave' | 'castle' | 'sunset' | 'dayclouds';
  glow: string;
  particle: string;
}

const THEMES: Record<BackgroundId, ThemeDef> = {
  nightCampus: {
    sky: ['#0a0a24', '#141436', '#1e1e4a'],
    starColor: '#ffffff', starCount: 36,
    cloudColor: 'rgba(120,130,220,0.10)',
    scene: 'campus', glow: 'rgba(255,214,10,0.10)', particle: '#ffd60a',
  },
  midnight: {
    sky: ['#020207', '#060614', '#0b0b22'],
    starColor: '#cfe0ff', starCount: 48,
    cloudColor: 'rgba(90,100,200,0.06)',
    scene: 'peaks', glow: 'rgba(72,149,239,0.08)', particle: '#4895ef',
  },
  arcade: {
    sky: ['#12041f', '#241040', '#3a1650'],
    starColor: '#ffd6ff', starCount: 30,
    cloudColor: 'rgba(200,100,255,0.08)',
    scene: 'grid', glow: 'rgba(200,80,255,0.12)', particle: '#ff4dd8',
  },
  deepSpace: {
    sky: ['#02020c', '#080828', '#101048'],
    starColor: '#ffffff', starCount: 56,
    cloudColor: 'rgba(80,90,220,0.07)',
    scene: 'stars', glow: 'rgba(72,149,239,0.12)', particle: '#7df9ff',
  },
  mysticForest: {
    sky: ['#04140e', '#0a2a1c', '#103826'],
    starColor: '#eaffea', starCount: 28,
    cloudColor: 'rgba(120,220,170,0.07)',
    scene: 'hills', glow: 'rgba(6,214,160,0.10)', particle: '#06d6a0',
  },
  neonCity: {
    sky: ['#0d0318', '#200a38', '#3a0f52'],
    starColor: '#ffe9c4', starCount: 30,
    cloudColor: 'rgba(255,77,216,0.08)',
    scene: 'skyline', glow: 'rgba(255,77,216,0.14)', particle: '#00e5ff',
  },
  underground: {
    sky: ['#100a04', '#241408', '#3a220c'],
    starColor: '#ffe9b0', starCount: 22,
    cloudColor: 'rgba(255,190,100,0.06)',
    scene: 'cave', glow: 'rgba(255,180,60,0.12)', particle: '#ffd60a',
  },
  fantasyCastle: {
    sky: ['#0a0618', '#181032', '#282058'],
    starColor: '#e6dcff', starCount: 40,
    cloudColor: 'rgba(150,120,255,0.08)',
    scene: 'castle', glow: 'rgba(150,110,255,0.12)', particle: '#c896ff',
  },
  sunsetCity: {
    sky: ['#1c0b26', '#5a1f3d', '#c65a2e'],
    starColor: '#ffe9c4', starCount: 18,
    cloudColor: 'rgba(255,170,110,0.10)',
    scene: 'sunset', glow: 'rgba(255,150,80,0.16)', particle: '#ffb35c',
  },
  sky: {
    sky: ['#12395e', '#2a6a9e', '#5fa8cf'],
    starColor: '#ffffff', starCount: 12,
    cloudColor: 'rgba(255,255,255,0.22)',
    scene: 'dayclouds', glow: 'rgba(255,255,255,0.12)', particle: '#e8f6ff',
  },
};

// Deterministic scatter (seeded — identical server/client markup, no
// hydration mismatch, no Math.random in render).
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Scenery({ scene }: { scene: ThemeDef['scene'] }) {
  const win = 'rgba(255,214,10,0.55)';
  const dark = '#0b0b22';
  const dark2 = '#08081a';
  switch (scene) {
    case 'campus':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          {/* left + right building clusters keep the center gameplay zone clear */}
          <g opacity="0.85" fill={dark}>
            <rect x="0" y="90" width="150" height="130" />
            <rect x="160" y="120" width="110" height="100" />
            <rect x="930" y="110" width="120" height="110" />
            <rect x="1060" y="80" width="140" height="140" />
          </g>
          <g opacity="0.9" fill={dark2}>
            <rect x="40" y="60" width="90" height="160" />
            <rect x="980" y="55" width="80" height="165" />
          </g>
          {/* warm lit windows */}
          <g fill={win} opacity="0.8">
            {Array.from({ length: 24 }).map((_, i) => {
              const bx = [48, 70, 92, 168, 190, 212, 988, 1010, 1032, 1068, 1090, 1112][i % 12];
              const by = 70 + Math.floor(i / 12) * 0 + (i % 4) * 28;
              return <rect key={i} x={bx} y={by} width="10" height="12" rx="1" opacity={i % 3 === 0 ? 0.25 : 0.8} />;
            })}
          </g>
          {/* trees + lamps at the edges */}
          <g opacity="0.9" fill={dark2}>
            <circle cx="300" cy="150" r="34" /><rect x="296" y="170" width="8" height="50" />
            <circle cx="880" cy="155" r="30" /><rect x="876" y="172" width="8" height="48" />
          </g>
          <g stroke="#ffd60a" strokeWidth="3" opacity="0.5">
            <line x1="330" y1="220" x2="330" y2="150" />
            <line x1="850" y1="220" x2="850" y2="150" />
          </g>
          <g fill="#ffd60a" opacity="0.7">
            <circle cx="330" cy="146" r="6" /><circle cx="850" cy="146" r="6" />
          </g>
        </svg>
      );
    case 'peaks':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          <polygon points="0,220 180,70 340,220" fill={dark} opacity="0.8" />
          <polygon points="860,220 1040,60 1200,220" fill={dark} opacity="0.8" />
          <polygon points="240,220 420,110 600,220" fill={dark2} opacity="0.9" />
          <polygon points="620,220 780,120 960,220" fill={dark2} opacity="0.9" />
          <polygon points="180,70 205,95 155,95" fill="#dfe8ff" opacity="0.25" />
          <polygon points="1040,60 1062,84 1018,84" fill="#dfe8ff" opacity="0.25" />
        </svg>
      );
    case 'grid':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          <g stroke="rgba(255,77,216,0.35)" strokeWidth="1.5">
            {Array.from({ length: 13 }).map((_, i) => (
              <line key={`v${i}`} x1={600 + (i - 6) * 90} y1="220" x2={600 + (i - 6) * 22} y2="120" />
            ))}
            {[200, 180, 162, 146].map((y) => (
              <line key={`h${y}`} x1="0" y1={y} x2="1200" y2={y} />
            ))}
          </g>
          <rect x="0" y="118" width="1200" height="3" fill="rgba(255,77,216,0.5)" />
          <circle cx="600" cy="60" r="34" fill="none" stroke="#ffd60a" strokeWidth="3" opacity="0.6" />
          <circle cx="600" cy="60" r="22" fill="none" stroke="#ff4dd8" strokeWidth="2" opacity="0.5" />
        </svg>
      );
    case 'stars':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          <circle cx="180" cy="60" r="26" fill="#2a2a6a" opacity="0.9" />
          <circle cx="172" cy="54" r="26" fill="none" />
          <circle cx="1020" cy="90" r="14" fill="rgba(125,249,255,0.35)" />
          <ellipse cx="1020" cy="90" rx="34" ry="8" fill="none" stroke="rgba(125,249,255,0.4)" strokeWidth="2" transform="rotate(-18 1020 90)" />
          <circle cx="600" cy="150" r="60" fill="rgba(72,149,239,0.10)" />
        </svg>
      );
    case 'hills':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          <ellipse cx="180" cy="240" rx="320" ry="120" fill={dark} opacity="0.85" />
          <ellipse cx="1020" cy="250" rx="340" ry="130" fill={dark} opacity="0.85" />
          <ellipse cx="600" cy="280" rx="420" ry="130" fill={dark2} opacity="0.9" />
          <g fill="#0e3a26" opacity="0.9">
            <circle cx="120" cy="150" r="26" /><circle cx="160" cy="160" r="20" />
            <circle cx="1060" cy="155" r="24" /><circle cx="1100" cy="162" r="18" />
          </g>
          <g fill="#06d6a0" opacity="0.5">
            <circle cx="120" cy="150" r="3" /><circle cx="1060" cy="155" r="3" />
            <circle cx="300" cy="180" r="2.5" /><circle cx="900" cy="182" r="2.5" />
          </g>
        </svg>
      );
    case 'skyline':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          <g fill={dark} opacity="0.85">
            <rect x="0" y="100" width="120" height="120" /><rect x="130" y="70" width="90" height="150" />
            <rect x="980" y="75" width="90" height="145" /><rect x="1080" y="105" width="120" height="115" />
          </g>
          <g fill={dark2} opacity="0.9">
            <rect x="230" y="120" width="80" height="100" /><rect x="890" y="125" width="70" height="95" />
          </g>
          <g fill="rgba(255,150,80,0.6)">
            {Array.from({ length: 20 }).map((_, i) => (
              <rect key={i} x={[138, 160, 182, 988, 1010, 1032, 1090, 1112][i % 8]} y={85 + (i % 5) * 24} width="9" height="11" rx="1" opacity={i % 4 === 0 ? 0.2 : 0.7} />
            ))}
          </g>
        </svg>
      );
    case 'cave':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          <polygon points="0,0 90,0 40,220 0,220" fill={dark} opacity="0.9" />
          <polygon points="1200,0 1110,0 1160,220 1200,220" fill={dark} opacity="0.9" />
          <polygon points="120,0 150,90 110,140 140,220 60,220 90,120" fill={dark2} opacity="0.9" />
          <polygon points="1080,0 1050,90 1090,140 1060,220 1140,220 1110,120" fill={dark2} opacity="0.9" />
          <g fill="#ffd60a" opacity="0.65">
            <polygon points="70,150 76,162 70,174 64,162" /><polygon points="1130,140 1136,152 1130,164 1124,152" />
            <polygon points="105,180 109,188 105,196 101,188" /><polygon points="1095,175 1099,183 1095,191 1091,183" />
          </g>
        </svg>
      );
    case 'castle':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          <g fill={dark} opacity="0.9">
            <rect x="60" y="90" width="70" height="130" /><rect x="60" y="70" width="70" height="25" />
            <rect x="1070" y="90" width="70" height="130" /><rect x="1070" y="70" width="70" height="25" />
          </g>
          <g fill={win} opacity="0.55">
            <rect x="82" y="110" width="10" height="16" rx="5" /><rect x="102" y="110" width="10" height="16" rx="5" />
            <rect x="1088" y="110" width="10" height="16" rx="5" /><rect x="1108" y="110" width="10" height="16" rx="5" />
          </g>
          <polygon points="95,70 95,20 125,45" fill={dark2} opacity="0.9" />
          <polygon points="1105,70 1105,20 1135,45" fill={dark2} opacity="0.9" />
          <g fill="#c896ff" opacity="0.4">
            <circle cx="95" cy="16" r="3" /><circle cx="1105" cy="16" r="3" />
          </g>
        </svg>
      );
    case 'sunset':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          {/* low sun + downtown silhouette in amber */}
          <circle cx="600" cy="168" r="52" fill="#ffcf7d" opacity="0.85" />
          <circle cx="600" cy="168" r="80" fill="#ff9d5c" opacity="0.25" />
          <g fill={dark} opacity="0.92">
            <rect x="0" y="120" width="150" height="100" /><rect x="160" y="90" width="100" height="130" />
            <rect x="270" y="130" width="80" height="90" /><rect x="850" y="125" width="80" height="95" />
            <rect x="940" y="85" width="110" height="135" /><rect x="1060" y="120" width="140" height="100" />
          </g>
          <g fill="#ffcf7d" opacity="0.7">
            {Array.from({ length: 18 }).map((_, i) => (
              <rect key={i} x={[168, 190, 212, 948, 970, 992, 1068, 1090, 1112][i % 9]} y={100 + (i % 5) * 22} width="9" height="11" rx="1" opacity={i % 4 === 0 ? 0.2 : 0.7} />
            ))}
          </g>
        </svg>
      );
    case 'dayclouds':
      return (
        <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice"
          style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          {/* bright sun + soft cloud banks, edges weighted to keep gameplay clear */}
          <circle cx="600" cy="70" r="36" fill="#fff6d8" opacity="0.9" />
          <circle cx="600" cy="70" r="58" fill="#fff6d8" opacity="0.2" />
          <g fill="rgba(255,255,255,0.5)">
            <ellipse cx="170" cy="150" rx="120" ry="26" /><ellipse cx="260" cy="132" rx="80" ry="20" />
            <ellipse cx="1020" cy="155" rx="130" ry="26" /><ellipse cx="930" cy="136" rx="70" ry="18" />
            <ellipse cx="600" cy="200" rx="220" ry="26" opacity="0.6" />
          </g>
          <g fill="rgba(10,40,70,0.55)">
            <ellipse cx="120" cy="235" rx="260" ry="60" /><ellipse cx="1080" cy="238" rx="270" ry="60" />
          </g>
        </svg>
      );
  }
}

export function GameBackground({
  theme = 'nightCampus',
  level = 1,
  parallax = true,
  particles = true,
  motion = true,
  brightness = 1,
  intensity = 1,
}: {
  theme?: GameTheme;
  /** Level 1-5: deepens the atmosphere + density as the player progresses. */
  level?: number;
  parallax?: boolean;
  /** Floating light motes on/off. */
  particles?: boolean;
  /** Master motion switch: off disables parallax + all CSS animation. */
  motion?: boolean;
  /** 0.4 (dim) – 1.3 (bright). */
  brightness?: number;
  /** 0.3 (calm) – 1.5 (dense). Scales stars, motes and glow. */
  intensity?: number;
}) {
  const id = resolveThemeId(theme);
  const t = THEMES[id];
  const lvl = Math.max(1, Math.min(5, Math.floor(level) || 1));
  const bright = Math.max(0.4, Math.min(1.3, Number(brightness) || 1));
  const dense = Math.max(0.3, Math.min(1.5, Number(intensity) || 1));
  const animated = motion !== false;
  const noAnim = animated ? undefined : ('none' as const);
  const skyRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  const stars = useMemo(() => {
    const rand = mulberry32(1234 + lvl * 77);
    // Gameplay readability: keep the middle band sparse, edges dense.
    return Array.from({ length: Math.round((t.starCount + lvl * 4) * dense) }).map((_, i) => {
      const edge = rand();
      const x = edge < 0.32 ? rand() * 30 : edge < 0.64 ? 70 + rand() * 30 : rand() * 100;
      return {
        id: i,
        left: `${x}%`,
        top: `${rand() * 62}%`,
        size: rand() < 0.85 ? 2 : 3,
        opacity: 0.25 + rand() * 0.55,
        twinkle: 2.5 + rand() * 4,
        delay: rand() * 5,
      };
    });
  }, [t, lvl, dense]);

  const motes = useMemo(() => {
    if (!particles) return [];
    const rand = mulberry32(987 + lvl * 31);
    return Array.from({ length: Math.round((10 + lvl) * dense) }).map((_, i) => ({
      id: i,
      left: `${8 + rand() * 84}%`,
      top: `${30 + rand() * 55}%`,
      size: 3 + rand() * 3,
      duration: 9 + rand() * 10,
      delay: rand() * 9,
    }));
  }, [lvl, particles, dense]);

  useEffect(() => {
    if (!parallax || !animated) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let pending = false;
    const apply = () => {
      pending = false;
      const y = window.scrollY || 0;
      // Subtle scroll parallax: distant layers barely move, nearer ones more.
      if (skyRef.current) skyRef.current.style.transform = `translate3d(0,${y * 0.03}px,0)`;
      if (starsRef.current) starsRef.current.style.transform = `translate3d(0,${y * 0.07}px,0)`;
      if (sceneRef.current) sceneRef.current.style.transform = `translate3d(0,${y * 0.14}px,0)`;
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [parallax, animated]);

  // Higher levels deepen the sky + strengthen the accent glow (progression
  // reads instantly, mechanics untouched).
  const depth = 1 - lvl * 0.06;
  const sky = `linear-gradient(180deg, ${t.sky[0]} 0%, ${t.sky[1]} 55%, ${t.sky[2]} 100%)`;

  return (
    <div aria-hidden className="gb-root"
      style={{
        position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden',
        pointerEvents: 'none', background: '#05050f',
      }}>
      {/* 1 — sky */}
      <div ref={skyRef} style={{
        position: 'absolute', inset: '-4% 0', background: sky,
        filter: bright === 1 ? undefined : `brightness(${bright})`,
      }} />
      {/* 2 — stars */}
      <div ref={starsRef} style={{ position: 'absolute', inset: 0 }}>
        {stars.map((s) => (
          <span key={s.id} className="gb-star" style={{
            position: 'absolute', left: s.left, top: s.top,
            width: s.size, height: s.size, borderRadius: '50%',
            background: t.starColor, opacity: s.opacity,
            animationDuration: `${s.twinkle}s`, animationDelay: `${s.delay}s`,
            animation: noAnim,
          }} />
        ))}
      </div>
      {/* 3 — clouds / atmosphere drift */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="gb-cloud" style={{
            position: 'absolute',
            left: `${[4, 52, 30][i]}%`, top: `${[10, 6, 22][i]}%`,
            width: `${[340, 460, 280][i]}px`, height: '120px',
            background: `radial-gradient(ellipse, ${t.cloudColor} 0%, transparent 70%)`,
            filter: 'blur(6px)',
            animationDuration: `${[46, 64, 38][i]}s`,
            animation: noAnim,
          }} />
        ))}
      </div>
      {/* 4 — distant scenery */}
      <div ref={sceneRef} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38vh', minHeight: 180, opacity: depth + 0.15 }}>
        <Scenery scene={t.scene} />
      </div>
      {/* 5 — midground horizon glow */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '24vh',
        background: `linear-gradient(180deg, transparent 0%, ${t.glow} 130%)`,
      }} />
      {/* 6 — foreground: edge vignette keeps corners calm + readability */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 90% 75% at 50% 42%, transparent 55%, rgba(0,0,5,0.55) 100%)',
      }} />
      {/* 7 — accent light orbs at the edges (never center) */}
      <div className="gb-orb" style={{
        position: 'absolute', left: '-70px', top: '30%', width: 220, height: 220,
        borderRadius: '50%', background: `radial-gradient(circle, ${t.glow} 0%, transparent 70%)`,
        opacity: Math.max(0.3, Math.min(1.2, dense)), animation: noAnim,
      }} />
      <div className="gb-orb" style={{
        position: 'absolute', right: '-70px', bottom: '12%', width: 260, height: 260,
        borderRadius: '50%', background: `radial-gradient(circle, ${t.glow} 0%, transparent 70%)`,
        opacity: Math.max(0.3, Math.min(1.2, dense)), animation: noAnim,
      }} />
      {/* 8 — floating motes */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {motes.map((m) => (
          <span key={m.id} className="gb-mote" style={{
            position: 'absolute', left: m.left, top: m.top,
            width: m.size, height: m.size, borderRadius: '50%',
            background: t.particle, opacity: 0.5,
            boxShadow: `0 0 8px ${t.particle}`,
            animationDuration: `${m.duration}s`, animationDelay: `${m.delay}s`,
            animation: noAnim,
          }} />
        ))}
      </div>
    </div>
  );
}
