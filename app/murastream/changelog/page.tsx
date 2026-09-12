'use client';

import Link from 'next/link';
import { CHANGELOG } from '../data/changelog';

// MuraStream changelog — what's new, newest first.
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
          <section key={entry.id} style={{ position: 'relative', marginBottom: 36 }}>
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
