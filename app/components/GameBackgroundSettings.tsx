'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BACKGROUND_OPTIONS,
  GameBackground,
  backgroundForLevel,
  backgroundName,
  resolveThemeId,
  type BackgroundId,
} from '@/app/components/GameBackground';

// ─── Game background settings ───────────────────────────────────────────
// Built-in theme IDs only — stored as a theme id (or 'auto' = level
// default). There is NO backgroundUrl anywhere: no https://, no external
// fetch, previews render from the same internal palettes.

const STORAGE_KEY = 'mg-game-settings';
export const AUTO_ID = 'auto';

export interface GameBackgroundSettings {
  /** Theme id, or 'auto' to follow the level default. */
  background: string;
  parallax: boolean;
  particles: boolean;
  motion: boolean;
  brightness: number;
  intensity: number;
}

const DEFAULTS: GameBackgroundSettings = {
  background: AUTO_ID,
  parallax: true,
  particles: true,
  motion: true,
  brightness: 1,
  intensity: 1,
};

function sanitize(raw: Partial<GameBackgroundSettings>): GameBackgroundSettings {
  const num = (v: unknown, lo: number, hi: number, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
  };
  let background = typeof raw.background === 'string' ? raw.background : AUTO_ID;
  // Unknown/deleted ids fall back to Night Campus (persisted below).
  if (background !== AUTO_ID) background = resolveThemeId(background);
  return {
    background,
    parallax: raw.parallax !== false,
    particles: raw.particles !== false,
    motion: raw.motion !== false,
    brightness: num(raw.brightness, 0.4, 1.3, 1),
    intensity: num(raw.intensity, 0.3, 1.5, 1),
  };
}

function readStored(): GameBackgroundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const fixed = sanitize(JSON.parse(raw) as Partial<GameBackgroundSettings>);
    // Rewrite a stale/unknown id so it never renders broken again.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fixed));
    } catch { /* best-effort */ }
    return fixed;
  } catch {
    return { ...DEFAULTS };
  }
}

/** Player's saved background settings. Applies instantly, no reload. */
export function useGameBackgroundSettings(levelDefault?: BackgroundId) {
  const [settings, setSettings] = useState<GameBackgroundSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(readStored());
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<GameBackgroundSettings>) => {
    setSettings((prev) => {
      const next = sanitize({ ...prev, ...patch });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* best-effort */ }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    setSettings({ ...DEFAULTS });
  }, []);

  const fallback = levelDefault ?? 'nightCampus';
  const theme: BackgroundId =
    settings.background === AUTO_ID ? fallback : resolveThemeId(settings.background);

  return { theme, themeLabel: backgroundName(theme), settings, update, reset, ready };
}

/** Drop-in background for play pages: level default + player override. */
export function ThemedGameBackground({ level }: { level: number }) {
  const lvl = Math.max(1, Math.min(5, Math.floor(level) || 1));
  const { theme, settings } = useGameBackgroundSettings(backgroundForLevel(lvl));
  return (
    <GameBackground
      theme={theme}
      level={lvl}
      parallax={settings.parallax}
      particles={settings.particles}
      motion={settings.motion}
      brightness={settings.brightness}
      intensity={settings.intensity}
    />
  );
}

// ─── Visual preview (same internal palettes, zero network) ──────────────
const PREVIEW_GRADIENTS: Record<string, [string, string, string]> = {
  nightCampus: ['#0a0a24', '#141436', '#2a2a5e'],
  deepSpace: ['#02020c', '#0a0a30', '#1a1a5e'],
  mysticForest: ['#04140e', '#0d3a24', '#1a5a38'],
  neonCity: ['#0d0318', '#2a0a48', '#5a1a6e'],
  fantasyCastle: ['#0a0618', '#1e1440', '#3a2a6e'],
  arcade: ['#12041f', '#2e1450', '#5a2068'],
  sunsetCity: ['#1c0b26', '#7a2a48', '#e07a35'],
  sky: ['#12395e', '#2f7ab5', '#8ecae6'],
  midnight: ['#020207', '#070716', '#101028'],
};

export function BackgroundPreview({ id, label }: { id: BackgroundId; label?: string }) {
  const g = PREVIEW_GRADIENTS[id] ?? PREVIEW_GRADIENTS.nightCampus;
  const opt = BACKGROUND_OPTIONS.find((o) => o.id === id);
  return (
    <span
      aria-hidden
      style={{
        position: 'relative', display: 'block', width: '100%', aspectRatio: '16/9',
        borderRadius: 10, overflow: 'hidden',
        background: `linear-gradient(180deg, ${g[0]} 0%, ${g[1]} 55%, ${g[2]} 100%)`,
        border: '1px solid rgba(255,255,255,0.14)',
      }}
    >
      <span style={{ position: 'absolute', top: '18%', left: '18%', color: '#fff', fontSize: 11, opacity: 0.9 }}>✦</span>
      <span style={{ position: 'absolute', top: '34%', right: '22%', color: '#fff', fontSize: 8, opacity: 0.6 }}>✦</span>
      <span style={{ position: 'absolute', bottom: '14%', left: '12%', right: '12%', height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.45)' }} />
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))',
      }}>
        {opt?.emoji ?? '🌙'}
      </span>
      {label && (
        <span style={{
          position: 'absolute', left: 6, bottom: 5, fontSize: 9, fontWeight: 800,
          color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)',
        }}>
          {label}
        </span>
      )}
    </span>
  );
}

// ─── Selector: [ 🌙 Night Campus ▼ ] with visual options ────────────────
export function BackgroundSelector({
  value, onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = value === AUTO_ID
    ? { id: AUTO_ID, name: 'Level Default', emoji: '✨', blurb: 'Follows each level' }
    : BACKGROUND_OPTIONS.find((o) => o.id === resolveThemeId(value)) ?? BACKGROUND_OPTIONS[0];

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12, padding: '10px 14px', color: '#fff', cursor: 'pointer',
          fontSize: 14, fontWeight: 700,
        }}
      >
        <span style={{ fontSize: 18 }}>{current.emoji}</span>
        <span style={{ flex: 1, textAlign: 'left' }}>{current.name}</span>
        <span aria-hidden style={{ opacity: 0.6, fontSize: 12 }}>▼</span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', zIndex: 50, top: 'calc(100% + 8px)', left: 0, right: 0,
            maxHeight: 340, overflowY: 'auto', padding: 10,
            background: '#15151d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          }}
        >
          {[{ id: AUTO_ID, name: 'Level Default', emoji: '✨', blurb: 'Follows each level' }, ...BACKGROUND_OPTIONS].map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={value === o.id || (value !== AUTO_ID && o.id !== AUTO_ID && resolveThemeId(value) === o.id)}
              onClick={() => { onChange(o.id); setOpen(false); }}
              style={{
                background: 'transparent',
                border: (value === o.id || (value !== AUTO_ID && o.id !== AUTO_ID && resolveThemeId(value) === o.id))
                  ? '2px solid #ffd60a' : '2px solid transparent',
                borderRadius: 12, padding: 6, cursor: 'pointer', textAlign: 'left',
              }}
            >
              {o.id === AUTO_ID ? (
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '100%', aspectRatio: '16/9', borderRadius: 10, fontSize: 26,
                  background: 'linear-gradient(135deg, #241040, #0a0a24)',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}>
                  ✨
                </span>
              ) : (
                <BackgroundPreview id={o.id as BackgroundId} />
              )}
              <span style={{ display: 'block', color: '#fff', fontSize: 12, fontWeight: 700, marginTop: 6 }}>{o.emoji} {o.name}</span>
              <span style={{ display: 'block', color: '#888', fontSize: 10.5 }}>{o.blurb}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, label, onFlip }: { on: boolean; label: string; onFlip: () => void }) {
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-pressed={on}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 0', color: '#ddd', fontSize: 13.5,
      }}
    >
      <span>{label}</span>
      <span style={{
        width: 40, height: 22, borderRadius: 11, position: 'relative',
        background: on ? '#ffd60a' : 'rgba(255,255,255,0.14)', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18,
          borderRadius: 9, background: on ? '#111' : '#fff', transition: 'left 0.2s',
        }} />
      </span>
    </button>
  );
}

function Slider({ label, value, min, max, step, onPick }: {
  label: string; value: number; min: number; max: number; step: number; onPick: (v: number) => void;
}) {
  return (
    <label style={{ display: 'block', fontSize: 13.5, color: '#ddd', padding: '6px 0' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: '#ffd60a', fontWeight: 700 }}>{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onPick(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#ffd60a', cursor: 'pointer' }}
      />
    </label>
  );
}

// ─── Full settings panel (embed in Game Center) ─────────────────────────
export function GameBackgroundSettings() {
  const { themeLabel, settings, update, reset } = useGameBackgroundSettings();

  const field: React.CSSProperties = { marginBottom: 4 };
  const lab: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 700, letterSpacing: 1 };

  return (
    <div>
      <div style={field}>
        <span style={lab}>BACKGROUND</span>
        <BackgroundSelector value={settings.background} onChange={(id) => update({ background: id })} />
        <p style={{ fontSize: 11.5, color: '#888', margin: '6px 0 0' }}>
          Now showing: <strong style={{ color: '#ffd60a' }}>{themeLabel}</strong>
          {settings.background === AUTO_ID ? ' (level default)' : ' (your override)'}
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 18px', marginTop: 8 }}>
        <div>
          <Toggle on={settings.parallax} label="Parallax" onFlip={() => update({ parallax: !settings.parallax })} />
          <Toggle on={settings.particles} label="Particles" onFlip={() => update({ particles: !settings.particles })} />
          <Toggle on={settings.motion} label="Background Motion" onFlip={() => update({ motion: !settings.motion })} />
        </div>
        <div>
          <Slider label="Brightness" value={settings.brightness} min={0.4} max={1.3} step={0.05} onPick={(v) => update({ brightness: v })} />
          <Slider label="Intensity" value={settings.intensity} min={0.3} max={1.5} step={0.1} onPick={(v) => update({ intensity: v })} />
        </div>
      </div>
      <button
        type="button"
        onClick={reset}
        style={{ marginTop: 8, background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
      >
        Reset to defaults
      </button>
    </div>
  );
}
