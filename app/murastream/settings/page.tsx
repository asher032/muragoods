'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/app/components/Sidebar';

type Settings = {
  defaultSource: string;
  subtitleLang: string;
  autoplay: boolean;
  theme: string;
  gridLayout: 'grid' | 'list';
  defaultCategory: string;
};

const DEFAULT_SETTINGS: Settings = {
  defaultSource: 'vidking',
  subtitleLang: 'en',
  autoplay: true,
  theme: 'dark',
  gridLayout: 'grid',
  defaultCategory: 'trending',
};

const SOURCES = [
  { id: 'vidking', label: 'VidKing' },
  { id: 'videasy', label: 'Videasy' },
];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
];

const CATEGORIES = [
  { id: 'trending', label: 'Trending' },
  { id: 'movies', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'anime', label: 'Anime' },
];

export default function MuraStreamSettings() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('murastream_settings');
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch { /* empty */ }
  }, []);

  const update = (key: keyof Settings, value: Settings[keyof Settings]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem('murastream_settings', JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const sectionStyle = {
    background: 'rgba(26,26,46,0.5)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
  };

  const labelStyle = {
    fontFamily: 'var(--font-arcade)' as const,
    fontSize: '8px' as const,
    color: '#888',
    marginBottom: '6px',
    display: 'block' as const,
  };  return (
    <>
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <button onClick={() => setSidebarOpen(true)} style={{
        position: 'fixed', top: '12px', left: '12px', zIndex: 200,
        background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,214,10,0.2)',
        borderRadius: '8px', padding: '8px', cursor: 'pointer',
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffd60a" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5" />
        </svg>
      </button>

      <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto', paddingTop: '60px' }}>
        <h1 style={{
          fontFamily: 'var(--font-arcade)', fontSize: '14px',
          color: 'var(--mario-yellow)', margin: '0 0 4px',
        }}>
          ⚙️ MuraStream Settings
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '12px',
          color: '#888', margin: '0 0 24px',
        }}>
          Customize your streaming experience
        </p>

        {saved && (
          <div style={{
            background: 'rgba(6,214,160,0.1)', border: '1px solid rgba(6,214,160,0.3)',
            borderRadius: '8px', padding: '8px 12px', marginBottom: '16px',
            fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#06d6a0',
          }}>
            ✓ Settings saved
          </div>
        )}

        {/* Default Source */}
        <div style={sectionStyle}>
          <label style={labelStyle}>DEFAULT STREAMING SOURCE</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {SOURCES.map(src => (
              <button key={src.id} onClick={() => update('defaultSource', src.id)} style={{
                padding: '6px 12px', borderRadius: '8px',
                border: settings.defaultSource === src.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
                background: settings.defaultSource === src.id ? 'rgba(255,214,10,0.15)' : 'transparent',
                color: settings.defaultSource === src.id ? 'var(--mario-yellow)' : '#888',
                fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
              }}>{src.label}</button>
            ))}
          </div>
        </div>

        {/* Subtitle Language */}
        <div style={sectionStyle}>
          <label style={labelStyle}>DEFAULT SUBTITLE LANGUAGE</label>
          <select
            value={settings.subtitleLang}
            onChange={e => update('subtitleLang', e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              background: 'rgba(15,15,26,0.8)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontFamily: 'var(--font-body)', fontSize: '13px',
              outline: 'none',
            }}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </div>

        {/* Autoplay */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <label style={{ ...labelStyle, marginBottom: '2px' }}>AUTOPLAY</label>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: '#666', margin: 0 }}>
                Automatically play next episode
              </p>
            </div>
            <button onClick={() => update('autoplay', !settings.autoplay)} style={{
              width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: settings.autoplay ? 'var(--mario-yellow)' : 'rgba(255,255,255,0.1)',
              position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                position: 'absolute', top: '3px',
                left: settings.autoplay ? '23px' : '3px',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        </div>

        {/* Default Category */}
        <div style={sectionStyle}>
          <label style={labelStyle}>DEFAULT BROWSING CATEGORY</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => update('defaultCategory', cat.id)} style={{
                padding: '6px 12px', borderRadius: '8px',
                border: settings.defaultCategory === cat.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
                background: settings.defaultCategory === cat.id ? 'rgba(255,214,10,0.15)' : 'transparent',
                color: settings.defaultCategory === cat.id ? 'var(--mario-yellow)' : '#888',
                fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
              }}>{cat.label}</button>
            ))}
          </div>
        </div>

        {/* Grid Layout */}
        <div style={sectionStyle}>
          <label style={labelStyle}>DISPLAY LAYOUT</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => update('gridLayout', 'grid')} style={{
              padding: '6px 12px', borderRadius: '8px',
              border: settings.gridLayout === 'grid' ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
              background: settings.gridLayout === 'grid' ? 'rgba(255,214,10,0.15)' : 'transparent',
              color: settings.gridLayout === 'grid' ? 'var(--mario-yellow)' : '#888',
              fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
            }}>▦ Grid</button>
            <button onClick={() => update('gridLayout', 'list')} style={{
              padding: '6px 12px', borderRadius: '8px',
              border: settings.gridLayout === 'list' ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
              background: settings.gridLayout === 'list' ? 'rgba(255,214,10,0.15)' : 'transparent',
              color: settings.gridLayout === 'list' ? 'var(--mario-yellow)' : '#888',
              fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
            }}>☰ List</button>
          </div>
        </div>

        {/* About */}
        <div style={{ ...sectionStyle, textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#444', margin: 0 }}>
            MuraStream — Powered by TMDB
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: '#333', margin: '4px 0 0' }}>
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </div>

        <div style={{ height: '80px' }} />
      </div>
    </>
  );
}
