'use client';

import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { ScrollText } from 'lucide-react';

export default function TermsOfServicePage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Terms of Service" />

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px 60px' }}>
        {/* Header Card */}
        <div style={{
          background: 'var(--mario-bg-card)',
          border: '1px solid rgba(255,214,10,0.15)',
          borderRadius: '16px',
          padding: '32px 24px',
          textAlign: 'center',
          marginBottom: '20px',
        }}>
          <span style={{ fontSize: '36px' }}><ScrollText className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
          <h1 style={{
            fontFamily: 'var(--font-arcade)',
            fontSize: '14px',
            color: 'var(--mario-yellow)',
            textTransform: 'uppercase',
            marginTop: '12px',
            textShadow: '2px 2px 0 rgba(0,0,0,0.5)',
          }}>Terms of Service</h1>
          <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginTop: '8px' }}>
            Last Updated: August 24, 2026
          </p>
        </div>

        {/* Content */}
        <div style={{
          background: 'var(--mario-bg-card)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '28px 24px',
          lineHeight: 1.7,
        }}>
          <p style={{ color: 'var(--mario-text)', fontSize: '13px', marginBottom: '16px' }}>
            Welcome to <strong style={{ color: 'var(--mario-yellow)' }}>MuraGoods</strong> (&quot;we,&quot; &quot;us,&quot; &quot;our,&quot; or the &quot;Site&quot;). MuraGoods is an online shop that also provides entertainment features such as mini-games, trivia, and an anonymous confession area.
          </p>
          <p style={{ color: 'var(--mario-text)', fontSize: '13px', marginBottom: '24px' }}>
            By accessing or using the Site, you agree to these Terms of Service. If you do not agree with these terms, please do not use the Site.
          </p>

          {sections.map((section, i) => (
            <div key={i} style={{ marginBottom: '24px' }}>
              <h2 style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '10px',
                color: 'var(--mario-yellow)',
                textTransform: 'uppercase',
                marginBottom: '10px',
                paddingBottom: '6px',
                borderBottom: '1px solid rgba(255,214,10,0.15)',
              }}>{section.title}</h2>
              {section.content.map((paragraph, j) => (
                <p key={j} style={{
                  color: 'var(--mario-text)',
                  fontSize: '13px',
                  marginBottom: '10px',
                  paddingLeft: paragraph.startsWith('•') ? '16px' : '0',
                }}
                dangerouslySetInnerHTML={{ __html: paragraph.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--mario-yellow)">$1</strong>').replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" style="color:var(--mario-blue)">$1</a>') }}
                />
              ))}
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <Link href="/" className="mario-btn mario-btn-sm" style={{ display: 'inline-flex' }}>
            ← Back to MuraGoods
          </Link>
        </div>
      </div>
    </main>
  );
}

const sections = [
  {
    title: '1. Using Our Website',
    content: [
      'You agree to use MuraGoods responsibly and only for lawful purposes.',
      'You must not:',
      '• Use the Site to harass, threaten, bully, or harm others.',
      '• Post illegal, hateful, sexually explicit, or seriously harmful content.',
      '• Impersonate another person.',
      '• Attempt to hack, disrupt, or damage the Site.',
      '• Cheat, exploit bugs, or manipulate games, points, rankings, or rewards.',
      '• Use automated systems to abuse the Site.',
      '• Submit false information for purchases or accounts.',
      'We may restrict or remove access to users who violate these rules.',
    ],
  },
  {
    title: '2. Our Shop',
    content: [
      'MuraGoods may offer merchandise, food, digital items, or other products through the Site.',
      'We try to keep product descriptions, prices, photos, and availability accurate. However, errors may occasionally occur.',
      'We reserve the right to correct pricing or listing errors, change product availability, cancel an order when necessary, limit product quantities, and update product information without notice.',
    ],
  },
  {
    title: '3. Orders and Payments',
    content: [
      'When you place an order, you are requesting to purchase the selected products.',
      'An order may be rejected or cancelled if a product is unavailable, there is an obvious pricing or listing error, payment cannot be completed, or we reasonably believe the order is fraudulent or abusive.',
      'You are responsible for providing accurate information needed to process your order.',
    ],
  },
  {
    title: '4. Anonymous Confessions',
    content: [
      'MuraGoods may provide an Anonymous Confession feature where users can submit messages without publicly displaying their identity.',
      '&quot;Anonymous&quot; means that your displayed submission may not show your name or profile. It does not guarantee that information connected to a submission can never be associated with its sender.',
      'Do not submit private or sensitive information about yourself or another person.',
      'You must not use the confession feature to threaten or target someone, bully or harass another person, spread private information, make serious accusations presented as facts without reliable evidence, post sexual content, encourage dangerous or illegal behavior, spam the system, or impersonate another person.',
      'We may review, remove, hide, or restrict submissions that violate these Terms or our community rules.',
    ],
  },
  {
    title: '5. User-Submitted Content',
    content: [
      'You may be able to submit confessions, comments, usernames, answers, reviews, or other content to MuraGoods.',
      'You remain responsible for the content you submit. By submitting content, you give MuraGoods permission to display, store, moderate, and format that content as reasonably necessary to operate the Site.',
      'We do not claim ownership of your original content simply because you submit it. We may remove content that violates these Terms, our community guidelines, or applicable laws.',
    ],
  },
  {
    title: '6. Mini-Games and Trivia',
    content: [
      'MuraGoods may contain games, quizzes, trivia, challenges, leaderboards, points, badges, or similar features.',
      'These features are intended for entertainment. Game scores, rankings, points, badges, and rewards may be changed, reset, or removed when necessary.',
      'Attempting to manipulate scores, exploit bugs, or gain an unfair advantage is prohibited.',
      'If prizes or rewards are offered, additional rules may apply to those specific activities.',
    ],
  },
  {
    title: '7. Community Safety',
    content: [
      'We want MuraGoods to remain fun and welcoming. If you encounter content that violates our rules, you may report it through available reporting tools or contact us at muragoods0@gmail.com.',
      'We may review reports and take appropriate action, including removing content or restricting accounts.',
    ],
  },
  {
    title: '8. Privacy',
    content: [
      'Your use of MuraGoods may involve the collection and processing of information. Please review our Privacy Policy to understand what information we collect, how we use it, how long we retain it, and what choices you may have.',
      'Anonymous posting should not be treated as a promise that no technical information is ever collected or retained.',
    ],
  },
  {
    title: '9. Intellectual Property',
    content: [
      'The MuraGoods name, branding, logos, graphics, design, original text, software, and other materials may belong to MuraGoods or its licensors.',
      'You may not copy, reproduce, sell, redistribute, or modify our protected materials without permission, except where permitted by law.',
    ],
  },
  {
    title: '10. Third-Party Services',
    content: [
      'MuraGoods may contain links to or integrations with third-party services. We are not responsible for the content, availability, policies, or actions of third-party services.',
    ],
  },
  {
    title: '11. Site Availability',
    content: [
      'We will make reasonable efforts to keep MuraGoods available, but we cannot guarantee that the Site will always be available without interruption, free from bugs or errors, completely secure, compatible with every device, or free from inaccurate user-submitted content.',
    ],
  },
  {
    title: '12. Account Suspension',
    content: [
      'We may suspend or terminate access to an account or feature if we reasonably believe that a user violated these Terms, abused other users, attempted to compromise the Site, manipulated games or rewards, or used the Site for illegal or harmful activities.',
    ],
  },
  {
    title: '13. Disclaimer',
    content: [
      'The Site and its entertainment features are provided on an &quot;as available&quot; basis. We do not guarantee that user-submitted confessions, trivia answers, comments, reviews, or other content are accurate, reliable, or appropriate.',
    ],
  },
  {
    title: '14. Limitation of Liability',
    content: [
      'To the extent permitted by applicable law, MuraGoods will not be responsible for losses or damages resulting from your use of the Site, inability to access the Site, user-generated content, game results, or interactions with other users.',
    ],
  },
  {
    title: '15. Changes to These Terms',
    content: [
      'We may update these Terms from time to time. When we make changes, we may update the &quot;Last Updated&quot; date above. Continued use of MuraGoods after changes become effective means you accept the updated Terms.',
    ],
  },
  {
    title: '16. Contact Us',
    content: [
      'If you have questions, concerns, reports, or requests regarding these Terms, contact us:',
      '**MuraGoods** — **Email:** muragoods0@gmail.com — **Website:** https://muragoods.vercel.app/',
    ],
  },
  {
    title: '',
    content: [
      '<strong style="color:var(--mario-yellow);font-size:14px">By using MuraGoods, you acknowledge that you have read and agree to these Terms of Service.</strong>',
    ],
  },
];
