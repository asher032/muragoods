'use client';

import { SERVER_CARD_BACKGROUNDS } from '@/app/lib/server-card-backgrounds';

// ── Level Background selector ────────────────────────────────────────────
// Visual cards for the imported picture assets (one per asset id). Grid is
// responsive by construction: 3–5 per row desktop, 2–3 tablet, 2 mobile.
// Buttons are natively keyboard-operable; aria-pressed marks selection.

export default function LevelBackgroundSelector({
  value, onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Level Background"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
        gap: 10,
      }}
    >
      {SERVER_CARD_BACKGROUNDS.map((b) => {
        const selected = value === b.id;
        return (
          <button
            key={b.id}
            type="button"
            aria-pressed={selected}
            aria-label={`${b.name}${selected ? ' (selected)' : ''}`}
            onClick={() => onChange(b.id)}
            style={{
              position: 'relative',
              padding: 0,
              borderRadius: 12,
              overflow: 'hidden',
              cursor: 'pointer',
              border: selected ? '2px solid var(--cc-accent)' : '2px solid rgba(255,255,255,0.10)',
              background: '#14141c',
              boxShadow: selected ? '0 0 0 2px rgba(88,101,242,0.35), 0 8px 24px rgba(0,0,0,0.45)' : 'none',
              transition: 'transform .15s ease, border-color .15s ease, box-shadow .15s ease',
              transform: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.file}
              alt=""
              aria-hidden
              loading="lazy"
              style={{ display: 'block', width: '100%', aspectRatio: '900 / 260', objectFit: 'cover' }}
            />
            <span
              aria-hidden
              style={{
                position: 'absolute', inset: 0,
                background: selected
                  ? 'linear-gradient(to top, rgba(8,8,14,0.55) 0%, transparent 55%)'
                  : 'linear-gradient(to top, rgba(8,8,14,0.72) 0%, transparent 60%)',
              }}
            />
            {selected && (
              <span
                aria-hidden
                style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 22, height: 22, borderRadius: 11,
                  background: 'var(--cc-accent)', color: '#fff',
                  fontSize: 13, fontWeight: 800, lineHeight: '22px', textAlign: 'center',
                }}
              >
                ✓
              </span>
            )}
            <span
              style={{
                position: 'absolute', left: 8, bottom: 6,
                color: '#fff', fontSize: 11.5, fontWeight: 700,
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}
            >
              {b.emoji} {b.name}
            </span>
          </button>
        );
      })}
      <style jsx>{`
        @media (max-width: 640px) {
          div[role='group'] { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}
