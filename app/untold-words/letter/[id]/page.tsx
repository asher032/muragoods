'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface LetterData {
  shortId: string;
  recipientName: string;
  senderName: string;
  isAnonymous: boolean;
  title: string;
  content: string;
  photos: string[];
  letterDate: string;
  signature: string;
  songTitle: string;
  songArtist: string;
  theme: string;
  views: number;
  createdAt: string;
}

const themeMap: Record<string, { bg: string; border: string; accent: string }> = {
  default: { bg: '#141428', border: 'rgba(255,100,150,0.3)', accent: '#ff6496' },
  midnight: { bg: '#0a1628', border: 'rgba(100,150,255,0.3)', accent: '#6496ff' },
  sunset: { bg: '#1a1008', border: 'rgba(255,180,100,0.3)', accent: '#ffb464' },
  garden: { bg: '#0a1a10', border: 'rgba(100,255,150,0.3)', accent: '#64ff96' },
  lavender: { bg: '#140a1a', border: 'rgba(200,150,255,0.3)', accent: '#c896ff' },
};

export default function ViewLoveLetter() {
  const params = useParams();
  const shortId = params.id as string;
  const [letter, setLetter] = useState<LetterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    async function fetchLetter() {
      try {
        const res = await fetch(`/api/untold-words/letters?id=${shortId}`);
        const result = await res.json();
        if (result.success) {
          setLetter(result.data);
        } else {
          setError('Letter not found or has been deleted.');
        }
      } catch {
        setError('Failed to load letter.');
      }
      setLoading(false);
    }
    if (shortId) fetchLetter();
  }, [shortId]);

  useEffect(() => {
    if (opened) {
      setTimeout(() => setShowContent(true), 400);
      setTimeout(() => setShowContent(true), 800);
    }
  }, [opened]);

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)', animation: 'pulse 2s ease infinite' }}>Loading your letter...</p>
        <style jsx>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
      </main>
    );
  }

  if (error || !letter) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>📭</p>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>{error || 'Letter not found'}</p>
          <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none' }}>← Back to Untold Words</Link>
        </div>
      </main>
    );
  }

  const t = themeMap[letter.theme] || themeMap.default;

  // Envelope state
  if (!opened) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ position: 'fixed', top: '20%', right: '20%', width: '400px', height: '400px', borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}10, transparent 70%)`, filter: 'blur(80px)', pointerEvents: 'none' }} />

        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', marginBottom: '16px' }}>A LETTER FOR</p>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(26px, 6vw, 42px)', color: t.accent, fontStyle: 'italic', textShadow: `0 0 40px ${t.accent}30`, marginBottom: '8px' }}>{letter.recipientName}</h1>

          <div onClick={() => setOpened(true)} style={{ cursor: 'pointer', margin: '40px auto', width: '180px', height: '140px', position: 'relative', transition: 'transform 0.3s ease' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ width: '100%', height: '100%', background: t.bg, border: `2px solid ${t.border}`, borderRadius: '12px', position: 'relative', overflow: 'hidden', boxShadow: `0 8px 32px ${t.accent}15` }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: `linear-gradient(180deg, ${t.accent}15, transparent)`, clipPath: 'polygon(0 0, 50% 80%, 100% 0)' }} />
              <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '32px', filter: `drop-shadow(0 0 12px ${t.accent}60)` }}>💌</div>
            </div>
          </div>

          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '28px' }}>Open your letter 💌</p>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '8px' }}>From: {letter.isAnonymous ? 'Anonymous' : letter.senderName}</p>
        </div>
      </main>
    );
  }

  // Letter content
  return (
    <main style={{ minHeight: '100vh', background: t.bg, padding: '40px 20px 100px' }}>
      <div style={{ position: 'fixed', top: '10%', right: '10%', width: '300px', height: '300px', borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}08, transparent 70%)`, filter: 'blur(80px)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: '560px', margin: '0 auto', opacity: showContent ? 1 : 0, transform: showContent ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        {/* Letter envelope card */}
        <div style={{ background: `${t.bg}`, border: `1px solid ${t.border}`, borderRadius: '24px', overflow: 'hidden', boxShadow: `0 16px 48px rgba(0,0,0,0.3), 0 0 60px ${t.accent}08` }}>
          {/* Header */}
          <div style={{ padding: '40px 32px 24px', textAlign: 'center', borderBottom: `1px solid ${t.accent}15` }}>
            <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: '8px' }}>A letter for</p>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '28px', color: t.accent, fontStyle: 'italic', marginBottom: '4px' }}>{letter.recipientName}</h1>
            {letter.letterDate && <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>{letter.letterDate}</p>}
          </div>

          {/* Title */}
          <div style={{ padding: '28px 32px 0', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: t.accent }}>&ldquo;{letter.title}&rdquo;</h2>
          </div>

          {/* Content — typed out feel */}
          <div style={{ padding: '28px 32px' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '15px', color: 'rgba(255,255,255,0.7)', lineHeight: 2.2, whiteSpace: 'pre-wrap' }}>
              {letter.content.split('\n').map((line, i) => (
                <p key={i} style={{ marginBottom: '10px', opacity: showContent ? 1 : 0, transform: showContent ? 'translateY(0)' : 'translateY(10px)', transition: `all 0.5s ease ${0.3 + i * 0.05}s` }}>
                  {line || <br />}
                </p>
              ))}
            </div>
          </div>

          {/* Photos */}
          {letter.photos && letter.photos.length > 0 && (
            <div style={{ padding: '0 32px 24px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {letter.photos.map((photo, i) => (
                <div key={i} style={{ borderRadius: '12px', overflow: 'hidden', flex: '1 1 200px', border: `1px solid ${t.accent}22` }}>
                  <img src={photo} alt="Memory" style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          )}

          {/* Attached song */}
          {letter.songTitle && (
            <div style={{ padding: '0 32px 24px' }}>
              <div style={{ background: `${t.accent}10`, border: `1px solid ${t.accent}25`, borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `linear-gradient(135deg, ${t.accent}40, ${t.accent}20)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '22px' }}>🎵</span>
                </div>
                <div>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: t.accent }}>{letter.songTitle}</p>
                  {letter.songArtist && <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{letter.songArtist}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Signature */}
          <div style={{ padding: '24px 32px 32px', textAlign: 'right' }}>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: '15px', color: t.accent, fontStyle: 'italic' }}>
              {letter.signature || (letter.isAnonymous ? '— Anonymous' : `— ${letter.senderName || 'Someone who loves you'}`)}
            </p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>For {letter.recipientName}</p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '48px', padding: '32px 0', borderTop: `1px solid ${t.accent}10` }}>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', marginBottom: '8px' }}>&ldquo;Some words are easier to send than to say.&rdquo;</p>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.15em' }}>MADE WITH MURAGOODS</p>
        </div>
      </div>
    </main>
  );
}
