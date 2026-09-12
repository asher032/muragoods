'use client';

import Link from 'next/link';

// MuraStream changelog — what's new, newest first.
// Static data owned here; append an entry when a feature ships.

type Entry = {
  version: string;
  date: string;
  title: string;
  items: { label: string; text: string }[];
};

const CHANGELOG: Entry[] = [
  {
    version: 'Source Intelligence',
    date: 'September 2026',
    title: 'Smarter, cleaner playback',
    items: [
      { label: '⚑', text: 'Report button in the player — flag broken or ad-heavy sources. Reports feed trust scores and the admin dashboard.' },
      { label: '🟢', text: 'Trust badges on the active source, backed by real community reports (Trusted / Mixed / Low / Reported broken).' },
      { label: '⏱', text: 'Per-title source memory — repeat plays skip the health probe entirely and open your last working provider instantly.' },
      { label: 'S · N · F', text: 'Keyboard shortcuts: S cycles sources, N jumps to the next episode, F fullscreen, M mute, ←/→ seek episodes.' },
      { label: '▶', text: 'Instant next-episode autoplay when the player signals the episode ended — no countdown.' },
    ],
  },
  {
    version: 'K · C · J Dramas',
    date: 'September 2026',
    title: 'Asian drama universe',
    items: [
      { label: '🌐', text: 'Dedicated drama browse page with K-Dramas, C-Dramas, and J-Dramas — genre, year, and sort filters plus infinite scroll.' },
      { label: '🎬', text: 'Featured hero banner spotlighting the #1 trending drama of your current filter.' },
      { label: '🌏', text: 'Country badges (K-DRAMA / C-DRAMA / J-DRAMA) on cards across the whole app so origins are recognizable everywhere.' },
      { label: '2', text: 'Fixed episode numbering bug that made every TV episode play as Episode 1.' },
    ],
  },
  {
    version: 'The Free Vault',
    date: 'September 2026',
    title: 'Real downloads, zero ads, guaranteed',
    items: [
      { label: '📥', text: 'Four Creative-Commons films (Big Buck Bunny, Sintel, Elephants Dream, Tears of Steel) with real download buttons — fully legal.' },
      { label: '⚙', text: 'Native HLS player with a true quality selector (Auto/1080p/720p/…), progress resume, and no third-party embeds.' },
      { label: '🚫', text: 'The only section where zero ads is guaranteed by construction — there is no external player to inject anything.' },
    ],
  },
  {
    version: 'Player v2',
    date: 'September 2026',
    title: 'Clean sources, health checks, fallbacks',
    items: [
      { label: '🔍', text: 'Server-side source verification — players probe all providers for the exact title before opening, so dead sources are skipped instead of silently stalling.' },
      { label: '🧹', text: 'Ad-heavy providers demoted to last-resort; notorious popup sources removed entirely.' },
      { label: '4K', text: 'VidLink, Videasy, Vidking, and Vidfast lead the queue — all ad-free and 4K-capable, with HD/4K labels on every source button.' },
      { label: '↻', text: 'Automatic fallback chain: if a source fails mid-playback it is marked red and playback hops to the next healthy provider.' },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 64px' }}>
      <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: 20, color: '#E5E5E5', margin: '0 0 6px', letterSpacing: '0.06em' }}>
        📜 MURASTREAM CHANGELOG
      </h1>
      <p style={{ fontSize: 13, color: '#888', margin: '0 0 32px' }}>
        Everything new in MuraStream, newest first.
      </p>

      <div style={{ position: 'relative', paddingLeft: 24 }}>
        {/* timeline rail */}
        <div style={{
          position: 'absolute', left: 7, top: 6, bottom: 6, width: 2,
          background: 'linear-gradient(to bottom, rgba(184,92,255,0.5), rgba(184,92,255,0.05))',
        }} />

        {CHANGELOG.map((entry) => (
          <section key={entry.version} style={{ position: 'relative', marginBottom: 36 }}>
            {/* node */}
            <div style={{
              position: 'absolute', left: -24, top: 4, width: 12, height: 12, borderRadius: '50%',
              background: '#B85CFF', boxShadow: '0 0 10px rgba(184,92,255,0.6)',
            }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: 13, color: '#B85CFF', margin: 0, letterSpacing: '0.08em' }}>
                {entry.version.toUpperCase()}
              </h2>
              <span style={{ fontSize: 11, color: '#555' }}>{entry.date}</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#E5E5E5', margin: '6px 0 12px' }}>{entry.title}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {entry.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    flexShrink: 0, minWidth: 34, textAlign: 'center',
                    fontSize: 10, fontWeight: 700, color: '#B85CFF',
                    background: 'rgba(184,92,255,0.1)', border: '1px solid rgba(184,92,255,0.3)',
                    borderRadius: 6, padding: '3px 6px', marginTop: 1,
                  }}>{item.label}</span>
                  <span style={{ fontSize: 13, color: '#A0A0A0', lineHeight: 1.5 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Link href="/murastream" style={{ color: '#B85CFF', fontSize: 13, textDecoration: 'none' }}>
        ← Back to MuraStream
      </Link>
    </div>
  );
}
