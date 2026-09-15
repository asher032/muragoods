import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — MuraStream',
  description: 'Privacy Policy for MuraStream and the MuraBot Discord bot.',
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Overview',
    body: [
      'This policy explains what data MuraStream (muragoods.vercel.app) and the MuraBot Discord bot collect, why, and how you can have it removed. We collect the minimum data needed to run the features you use.',
    ],
  },
  {
    title: 'Account / Profile Information',
    body: [
      'If you create an account we store: your email address, a bcrypt hash of your password (never the password itself), your display name, and optional profile fields you add (avatar, bio).',
      'You can edit or delete this information from your account settings page at any time.',
    ],
  },
  {
    title: 'Discord Information (MuraBot)',
    body: [
      'When you use MuraBot in a Discord server, the bot stores: your Discord user ID and username alongside bot-generated data (XP totals, coin balances, warnings, movie requests you made, tickets you opened).',
      'The bot does NOT receive or store your email address, password, or DMs. Message content is processed only for XP and automod in servers where those features are active — it is not persistently stored.',
      'Server-level configuration (channel IDs, role IDs, toggles) is stored per Discord server so each server\'s settings stay separate.',
    ],
  },
  {
    title: 'Watch History & Watchlist',
    body: [
      'Continue-watching progress, watchlist entries, and favorites are stored in your browser\'s local storage and/or your account data so they sync across devices. You can clear them from the My Space dashboard or by deleting your account.',
    ],
  },
  {
    title: 'Comments & Community Content',
    body: [
      'Comments you post (with a display name, timestamp, and content) are stored and shown publicly on the relevant title page. You can edit or delete your own comments; ownership is verified server-side.',
      'Reports about rule-breaking comments are visible to moderators only.',
    ],
  },
  {
    title: 'Movie Requests',
    body: [
      'When you submit a movie/TV/anime request, we store the title, media type, your display name, timestamp, vote count, and request status. This is public within the requests page and, for Discord requests, within the server that made them.',
    ],
  },
  {
    title: 'Points & Rewards',
    body: [
      'MuraPoints balances, transaction records, and reward redemptions are stored per account (and per Discord server for bot economy coins). These are not shared publicly beyond leaderboards you can opt out of.',
    ],
  },
  {
    title: 'Cookies & Local Storage',
    body: [
      'We use a signed, httpOnly session cookie to keep you logged in — it contains no readable personal data. Preferences and playback progress may also live in browser local storage on your device, which you can clear via your browser or the site\'s settings.',
      'No third-party advertising or tracking cookies are used.',
    ],
  },
  {
    title: 'IP & Security Logs',
    body: [
      'Rate-limit counters (keyed by hashed IP for anonymous actions) and security events (failed logins, suspicious requests) are stored transiently to prevent abuse. They are not used for marketing and are auto-deleted on a short retention cycle.',
    ],
  },
  {
    title: 'Third-Party API Services',
    body: [
      'Media metadata comes from TMDB. When you browse titles, your request goes through our server which contacts TMDB — TMDB receives the request but not your identity. Playback relies on third-party sources governed by their own policies.',
    ],
  },
  {
    title: 'Music Commands (Discord)',
    body: [
      'Music playback uses yt-dlp to stream audio from public platforms. Search queries you type are sent to the platform to find the track. The bot does not build listening profiles or store history beyond an optional per-server recently-played list.',
    ],
  },
  {
    title: 'Data Retention',
    body: [
      'Account data is kept while your account is active. Watch party rooms auto-expire after 6 hours of inactivity. Rate-limit records auto-expire within minutes to hours. Discord per-server settings are kept while the bot remains in the server.',
    ],
  },
  {
    title: 'Data Deletion',
    body: [
      'You can delete your MuraStream account from the account settings page, which removes profile, comments, and site preferences. For Discord data (XP, coins, warnings, requests), ask a server admin or contact the operator — per-server data is deleted when the bot leaves or on request.',
    ],
  },
  {
    title: 'Security',
    body: [
      'Passwords are hashed with bcrypt. Sessions use signed httpOnly cookies. Administrative actions require verified admin identity on the server. No credit-card or payment data is collected anywhere in the Services.',
    ],
  },
  {
    title: 'Children & Teens',
    body: [
      'The Services are not directed at children under 13. If you believe a child under 13 has provided personal information, contact the operator and it will be deleted promptly. Discord users are additionally subject to Discord\'s minimum age requirements.',
    ],
  },
  {
    title: 'Changes to This Policy',
    body: [
      'This policy may be updated to reflect feature changes. The effective date at the top will be updated; significant changes will be announced on the site or in the Discord community.',
    ],
  },
  {
    title: 'Contact',
    body: [
      'Privacy questions or deletion requests can be raised via the MuraStream community Discord or a support ticket opened with MuraBot.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(1200px 600px at 70% -10%, rgba(229,9,20,0.18), transparent), #0a0a0c',
        color: '#f5f5f7',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: '48px 20px 80px',
      }}
    >
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 14 }}>
          ← Back to MuraStream
        </Link>

        <div
          style={{
            marginTop: 18,
            padding: '34px 34px 40px',
            background: 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(13px)',
            WebkitBackdropFilter: 'blur(13px)',
            border: '1px solid rgba(255,255,255,0.20)',
            borderRadius: 20,
          }}
        >
          <p style={{ margin: 0, color: '#e50914', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
            MURASTREAM
          </p>
          <h1 style={{ margin: '8px 0 4px', fontSize: 34, fontWeight: 800 }}>Privacy Policy</h1>
          <p style={{ margin: '0 0 26px', color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
            Effective date: September 15, 2026
          </p>

          {SECTIONS.map((section) => (
            <section key={section.title} style={{ marginBottom: 26 }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>{section.title}</h2>
              {section.body.map((para, i) => (
                <p
                  key={i}
                  style={{
                    margin: '0 0 10px',
                    lineHeight: 1.65,
                    fontSize: 14.5,
                    color: 'rgba(255,255,255,0.82)',
                  }}
                >
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p style={{ marginTop: 22, textAlign: 'center' }}>
          <Link
            href="/terms"
            style={{
              color: 'rgba(255,255,255,0.7)',
              textDecoration: 'none',
              fontSize: 14,
              marginRight: 22,
            }}
          >
            Terms of Service →
          </Link>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 14 }}>
            Home
          </Link>
        </p>
      </div>
    </main>
  );
}
