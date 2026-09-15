import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — MuraStream',
  description: 'Terms of Service for MuraStream and the MuraBot Discord bot.',
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Acceptance of Terms',
    body: [
      'By accessing MuraStream (muragoods.vercel.app) or using the MuraBot Discord bot ("the Services"), you agree to these Terms of Service. If you do not agree, do not use the Services.',
      'These terms apply to every visitor, registered account holder, and Discord user who interacts with MuraBot in a server where it is installed.',
    ],
  },
  {
    title: '2. Use of MuraStream',
    body: [
      'MuraStream is a media discovery and community platform. It surfaces metadata about movies, TV series, and anime through third-party services and links users to legitimate sources for playback.',
      'MuraStream is provided for personal, non-commercial use. You agree not to abuse, overload, or attempt to disrupt the Services.',
    ],
  },
  {
    title: '3. User Accounts',
    body: [
      'You may optionally create an account with an email address and password. You are responsible for keeping your credentials secure and for all activity that happens under your account.',
      'Accounts found to be abusive, spam-based, or in breach of these terms may be suspended or deleted at the operator\'s discretion.',
    ],
  },
  {
    title: '4. User-Generated Content',
    body: [
      'Comments, replies, movie requests, and other content you submit remain your responsibility. You grant the Services a limited license to store and display that content as part of normal operation.',
      'Content that is illegal, hateful, harassing, or sexual in nature targeting minors will be removed and may result in account termination.',
    ],
  },
  {
    title: '5. Discord Bot Usage',
    body: [
      'MuraBot provides media lookup, Watch Together room links, server moderation, leveling, and community features inside Discord servers that have added it.',
      'Server administrators are responsible for how they configure the bot. The bot follows Discord\'s own Terms of Service and Developer Policy. Misuse of the bot may be reported to the operator and to Discord.',
    ],
  },
  {
    title: '6. Music Features',
    body: [
      'The music playback feature streams audio from third-party platforms on request. Audio is streamed for in-the-moment listening; the bot does not store, redistribute, or provide downloads of copyrighted recordings.',
      'Availability of any track or platform is not guaranteed. If a source is unavailable, the bot reports the failure instead of circumventing it.',
    ],
  },
  {
    title: '7. Movie/TV/Anime Features',
    body: [
      'Metadata (titles, posters, ratings, descriptions) is provided by The Movie Database (TMDB) and other legitimate providers. Posters and artwork remain the property of their respective rights holders.',
      'MuraStream does not host, upload, or own third-party media content. Watch links route to the site\'s own player interface which relies on sources configured by the site operator.',
    ],
  },
  {
    title: '8. Watch Together',
    body: [
      'Watch Together creates synchronized viewing rooms on the MuraStream website. The room host controls the shared timeline; participants follow the host\'s playback.',
      'Room codes may be shared by users. Do not use Watch Together to harass others or to synchronize content you have no right to view.',
    ],
  },
  {
    title: '9. Movie Requests',
    body: [
      'Users may request titles be added to MuraStream. Requests are suggestions only — no guarantee of fulfillment is made. Duplicate requests are merged into votes.',
      'Requests may be rejected, marked unavailable, or removed by moderators.',
    ],
  },
  {
    title: '10. Community Rules',
    body: [
      'Be respectful to other users. No spam, no harassment, no hate speech, no sharing of malicious links.',
      'Server owners using MuraBot may enforce additional rules within their own Discord servers through the bot\'s moderation tools.',
    ],
  },
  {
    title: '11. Prohibited Activities',
    body: [
      'You agree not to: attack or reverse-engineer the Services; scrape at volumes that degrade service; exploit rate limits; impersonate staff; upload malware; circumvent security controls; or use the Services to violate any applicable law.',
    ],
  },
  {
    title: '12. Third-Party Services',
    body: [
      'The Services rely on third-party providers including TMDB (metadata), streaming source platforms, MongoDB (data storage), Vercel (hosting), and Discord (bot platform).',
      'Each third-party service has its own terms of service and privacy policy, which also govern your use of those components. We do not control and are not responsible for third-party services.',
    ],
  },
  {
    title: '13. Intellectual Property',
    body: [
      'The MuraStream name, interface design, and original code are the property of the site operator. Movie titles, posters, trailers, and other media metadata belong to their respective owners and are used under the providers\' terms (e.g., TMDB attribution requirements).',
      'Nothing in these terms transfers ownership of any third-party content to you.',
    ],
  },
  {
    title: '14. Availability of Service',
    body: [
      'The Services are offered "as is" and "as available." Downtime, feature changes, and discontinuation may occur without notice. No uptime guarantee is made, especially for free-tier hosting components.',
    ],
  },
  {
    title: '15. Limitation of Liability',
    body: [
      'To the maximum extent permitted by law, the operator is not liable for indirect, incidental, or consequential damages arising from use of the Services, including data loss, interrupted viewing, or third-party service failures.',
    ],
  },
  {
    title: '16. Changes to Terms',
    body: [
      'These terms may be updated at any time. Material changes will be reflected on this page with an updated effective date. Continued use after changes constitutes acceptance.',
    ],
  },
  {
    title: '17. Contact Information',
    body: [
      'Questions about these terms can be raised through the MuraStream /support channels or by opening a ticket in the official MuraStream Discord community.',
    ],
  },
];

export default function TermsPage() {
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
          <h1 style={{ margin: '8px 0 4px', fontSize: 34, fontWeight: 800 }}>Terms of Service</h1>
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
            href="/privacy"
            style={{
              color: 'rgba(255,255,255,0.7)',
              textDecoration: 'none',
              fontSize: 14,
              marginRight: 22,
            }}
          >
            Privacy Policy →
          </Link>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 14 }}>
            Home
          </Link>
        </p>
      </div>
    </main>
  );
}
