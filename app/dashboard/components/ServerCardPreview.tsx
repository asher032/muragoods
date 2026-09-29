'use client';

import { serverCardBackgroundMeta } from '@/app/lib/server-card-backgrounds';

// ── Live server-card preview ─────────────────────────────────────────────
// Shows the actual imported asset (object-fit: cover, like the bot's
// cover-resize) under a readability shade, with the card layout mocked on
// top. Bound to the draft value, so picking a card updates it instantly.
// Clearly labeled as a preview; the bot renders the real PNG on Discord.

export default function ServerCardPreview({ themeId, accent }: { themeId: unknown; accent: unknown }) {
  const meta = serverCardBackgroundMeta(themeId);
  const color = typeof accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#5865F2';

  return (
    <div style={{ marginTop: 10 }}>
      <div
        aria-label={`Preview of the ${meta.name} server card background`}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 460,
          aspectRatio: '900 / 260',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.12)',
          background: '#14141c',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={meta.file}
          alt=""
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* readability shade (mirrors the bot's overlay) */}
        <span
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(8,8,14,0.55) 0%, rgba(8,8,14,0.35) 45%, rgba(8,8,14,0.72) 100%)',
          }}
        />
        {/* avatar */}
        <span
          aria-hidden
          style={{
            position: 'absolute', left: '4.4%', top: '21%', width: '16.5%', aspectRatio: '1',
            borderRadius: '50%', background: 'rgba(255,255,255,0.16)',
            border: '2px solid rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.75)', fontSize: 22, fontWeight: 800,
          }}
        >
          ?
        </span>
        {/* name */}
        <span
          aria-hidden
          style={{
            position: 'absolute', left: '24.5%', top: '15%', color: '#fff',
            fontSize: 'clamp(13px, 3.4vw, 20px)', fontWeight: 800, letterSpacing: '-0.01em',
          }}
        >
          Username
        </span>
        {/* level + rank */}
        <span
          aria-hidden
          style={{
            position: 'absolute', left: '24.5%', top: '42%', color,
            fontSize: 'clamp(9px, 2.2vw, 13px)', fontWeight: 700, letterSpacing: '0.04em',
          }}
        >
          LEVEL 12&nbsp;&nbsp;•&nbsp;&nbsp;RANK #3
        </span>
        {/* progress bar */}
        <span
          aria-hidden
          style={{
            position: 'absolute', left: '24.5%', right: '6.5%', top: '63.5%', height: '13.5%',
            borderRadius: 999, background: 'rgba(255,255,255,0.16)',
          }}
        >
          <span
            style={{
              display: 'block', width: '68%', height: '100%',
              borderRadius: 999, background: color,
            }}
          />
        </span>
        {/* xp line */}
        <span
          aria-hidden
          style={{
            position: 'absolute', left: '24.5%', top: '81%',
            color: 'rgba(255,255,255,0.65)', fontSize: 'clamp(8px, 2vw, 12px)',
          }}
        >
          1,240 / 1,500 XP
        </span>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
        Preview — {meta.emoji} {meta.name}. The bot renders the real card on Discord when levels change.
      </p>
    </div>
  );
}
