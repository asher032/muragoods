'use client';

import { useState } from 'react';
import { useMuraStreamStore, type MuraStreamSettings } from '../hooks/useMuraStreamStore';

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: '40px', height: '22px', borderRadius: '11px',
        background: enabled ? '#E50914' : 'var(--ms-border-2)',
        border: 'none', cursor: 'pointer', padding: 0,
        position: 'relative', transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: '18px', height: '18px', borderRadius: '50%',
        background: '#FFF', position: 'absolute', top: '2px',
        left: enabled ? '20px' : '2px', transition: 'left 0.2s',
      }} />
    </button>
  );
}

export default function MuraStreamSettingsPage() {
  const { settings, updateSettings, clearHistory, clearAllLibrary } = useMuraStreamStore();
  const [saved, setSaved] = useState(false);

  const update = (key: keyof MuraStreamSettings, value: boolean | number | string) => {
    updateSettings({ [key]: value } as Partial<MuraStreamSettings>);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggle = (key: keyof MuraStreamSettings) => update(key, !settings[key]);

  const handleClear = (action: () => void) => {
    action();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '500px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: 'var(--ms-text)', margin: 0 }}>
          SETTINGS
        </h1>
        {saved && (
          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#06d6a0', background: 'rgba(6,214,160,0.1)', padding: '4px 10px', borderRadius: '4px' }}>
            ✓ Saved
          </span>
        )}
      </div>

      {/* PLAYBACK */}
      <Section title="PLAYBACK">
        <SettingRow label="Autoplay" desc="Play videos automatically">
          <Toggle enabled={settings.autoplay} onChange={() => toggle('autoplay')} />
        </SettingRow>
        <SettingRow label="Autoplay Next Episode" desc="Auto-play next episode in series">
          <Toggle enabled={settings.autoplayNext} onChange={() => toggle('autoplayNext')} />
        </SettingRow>
        <SettingRow label="Continue Watching" desc="Track playback progress">
          <Toggle enabled={settings.continueWatching} onChange={() => toggle('continueWatching')} />
        </SettingRow>
      </Section>

      {/* SUBTITLES */}
      <Section title="SUBTITLES">
        <SettingRow label="Subtitle Language" desc="Default subtitle language">
          <select
            value={settings.subtitleLang}
            onChange={e => update('subtitleLang', e.target.value)}
            style={{
              background: 'var(--ms-surface-2)', border: '1px solid var(--ms-border-2)', borderRadius: '6px',
              color: 'var(--ms-text)', padding: '6px 10px', fontFamily: 'var(--font-arcade)', fontSize: '9px',
              cursor: 'pointer',
            }}
          >
            <option value="en">English</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="fil">Filipino</option>
          </select>
        </SettingRow>
        <SettingRow label="Subtitle Size" desc={`${settings.subtitleSize}%`}>
          <input
            type="range" min="75" max="200" step="25"
            value={settings.subtitleSize}
            onChange={e => update('subtitleSize', parseInt(e.target.value))}
            style={{ width: '100px', accentColor: '#E50914' }}
          />
        </SettingRow>
      </Section>

      {/* APPEARANCE */}
      <Section title="KEYBOARD SHORTCUTS">
        <SettingRow label="Enable shortcuts" desc="S source · N next · F fullscreen · M mute · ←/→ episodes">
          <Toggle enabled={settings.shortcutsEnabled} onChange={() => toggle('shortcutsEnabled')} />
        </SettingRow>
      </Section>

      <Section title="APPEARANCE">
        <SettingRow label="Theme" desc="Choose your interface theme">
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['dark', 'light', 'system'] as const).map(theme => (
              <button key={theme} onClick={() => update('appearance', theme)} style={{
                padding: '5px 10px', borderRadius: '6px',
                border: settings.appearance === theme ? '1px solid #E50914' : '1px solid var(--ms-border-2)',
                background: settings.appearance === theme ? 'rgba(229,9,20,0.12)' : 'var(--ms-surface-2)',
                color: settings.appearance === theme ? '#E50914' : 'var(--ms-text-dim)',
                fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
                textTransform: 'capitalize',
              }}>
                {theme}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Compact Cards" desc="Smaller movie cards">
          <Toggle enabled={settings.compactCards} onChange={() => toggle('compactCards')} />
        </SettingRow>
      </Section>

      {/* PRIVACY */}
      <Section title="PRIVACY">
        <SettingRow label="Watch History" desc="Track what you watch">
          <Toggle enabled={settings.watchHistory} onChange={() => toggle('watchHistory')} />
        </SettingRow>
        <SettingRow label="Personalized Recommendations" desc="Get recommendations based on your activity">
          <Toggle enabled={settings.recommendations} onChange={() => toggle('recommendations')} />
        </SettingRow>
        <SettingRow label="Clear Watch History" desc="Remove all watch history">
          <button onClick={() => handleClear(clearHistory)} style={{
            padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(230,57,70,0.3)',
            background: 'rgba(230,57,70,0.1)', color: '#e63946',
            fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
          }}>Clear</button>
        </SettingRow>
        <SettingRow label="Clear Library Data" desc="Remove all library, list, and likes data">
          <button onClick={() => handleClear(clearAllLibrary)} style={{
            padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(230,57,70,0.3)',
            background: 'rgba(230,57,70,0.1)', color: '#e63946',
            fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
          }}>Clear All</button>
        </SettingRow>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'var(--ms-text-ghost)', letterSpacing: '0.15em', margin: '0 0 10px' }}>
        {title}
      </p>
      <div style={{ background: 'var(--ms-surface)', borderRadius: '10px', border: '1px solid var(--ms-border)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', borderBottom: '1px solid var(--ms-border)',
    }}>
      <div style={{ flex: 1, marginRight: '16px' }}>
        <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '13px', color: 'var(--ms-text)', margin: 0 }}>{label}</p>
        {desc && <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '11px', color: 'var(--ms-text-faint)', margin: '2px 0 0' }}>{desc}</p>}
      </div>
      {children}
    </div>
  );
}
