'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface SongData {
  shortId: string;
  recipientName: string;
  senderName: string;
  isAnonymous: boolean;
  songTitle: string;
  artist: string;
  message: string;
  messageTitle: string;
  photoUrl: string;
  memoryDate: string;
  views: number;
  createdAt: string;
}

export default function ViewSongMessage() {
  const params = useParams();
  const shortId = params.id as string;
  const [song, setSong] = useState<SongData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    async function fetchSong() {
      try {
        const res = await fetch(`/api/untold-words/songs?id=${shortId}`);
        const result = await res.json();
        if (result.success) {
          setSong(result.data);
        } else {
          setError('Message not found or has been deleted.');
        }
      } catch {
        setError('Failed to load message.');
      }
      setLoading(false);
    }
    if (shortId) fetchSong();
  }, [shortId]);

  useEffect(() => {
    if (opened) {
      setTimeout(() => setShowContent(true), 600);
    }
  }, [opened]);

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)', animation: 'pulse 2s ease infinite' }}>Loading...</p>
        <style jsx>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
      </main>
    );
  }

  if (error || !song) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>📭</p>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>{error || 'Message not found'}</p>
          <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none' }}>← Back to Untold Words</Link>
        </div>
      </main>
    );
  }

  // Envelope/opening state
  if (!opened) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        {/* Ambient glow */}
        <div style={{ position: 'fixed', top: '30%', left: '30%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(123,47,247,0.06), transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />

        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', marginBottom: '16px' }}>TO</p>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: 'clamp(22px, 5vw, 36px)', color: '#ffd60a', textShadow: '0 0 40px rgba(255,214,10,0.2)', marginBottom: '8px' }}>{song.recipientName}</h1>
          </div>

          {/* Envelope */}
          <div onClick={() => setOpened(true)} style={{ cursor: 'pointer', margin: '32px auto', width: '160px', height: '120px', position: 'relative', transition: 'transform 0.3s ease' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {/* Envelope body */}
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a2e, #16213e)', border: '2px solid rgba(255,214,10,0.3)', borderRadius: '8px', position: 'relative', overflow: 'hidden' }}>
              {/* Flap */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,214,10,0.1), transparent)', clipPath: 'polygon(0 0, 50% 80%, 100% 0)' }} />
              {/* Heart seal */}
              <div style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '28px', filter: 'drop-shadow(0 0 10px rgba(255,100,150,0.4))' }}>💌</div>
            </div>
          </div>

          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '24px' }}>Open your letter 💌</p>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '8px' }}>From: {song.isAnonymous ? 'Someone who cares' : song.senderName}</p>
        </div>
      </main>
    );
  }

  // Opened — reveal content
  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18', padding: '40px 20px 100px' }}>
      {/* Ambient glows */}
      <div style={{ position: 'fixed', top: '10%', right: '10%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(123,47,247,0.06), transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '10%', left: '10%', width: '250px', height: '250px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,100,150,0.05), transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: '520px', margin: '0 auto', opacity: showContent ? 1 : 0, transform: showContent ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        {/* Song Card */}
        <div style={{ background: 'linear-gradient(135deg, rgba(123,47,247,0.12), rgba(255,100,150,0.06))', border: '1px solid rgba(123,47,247,0.2)', borderRadius: '24px', overflow: 'hidden', marginBottom: '24px' }}>
          {/* Album art area */}
          <div style={{ padding: '40px 32px 28px', textAlign: 'center', position: 'relative' }}>
            <div style={{ width: '140px', height: '140px', borderRadius: '20px', background: 'linear-gradient(135deg, #7b2ff7, #ff6496)', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 40px rgba(123,47,247,0.3)', position: 'relative' }}>
              <span style={{ fontSize: '56px' }}>🎵</span>
              {/* Animated music waves */}
              <div style={{ position: 'absolute', bottom: '-2px', left: 0, right: 0, height: '20px', display: 'flex', justifyContent: 'center', gap: '3px', alignItems: 'flex-end' }}>
                {[...Array(12)].map((_, i) => (
                  <div key={i} style={{ width: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.5)', animation: `wave 1s ease-in-out ${i * 0.1}s infinite`, height: '8px' }} />
                ))}
              </div>
            </div>

            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#fff', marginBottom: '4px' }}>{song.songTitle}</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>{song.artist}</p>
            {song.messageTitle && <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#e8b4f8', marginTop: '12px' }}>&ldquo;{song.messageTitle}&rdquo;</p>}
          </div>

          {/* Message */}
          <div style={{ padding: '0 32px 32px' }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '24px' }}>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.8, fontStyle: 'italic' }}>&ldquo;{song.message}&rdquo;</p>
            </div>
          </div>
        </div>

        {/* Photo if any */}
        {song.photoUrl && (
          <div style={{ borderRadius: '16px', overflow: 'hidden', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <img src={song.photoUrl} alt="Memory" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
        )}

        {/* Memory date */}
        {song.memoryDate && (
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em' }}>📅 {song.memoryDate}</p>
          </div>
        )}

        {/* Sender */}
        <div style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>— {song.isAnonymous ? 'Anonymous' : song.senderName}</p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>For {song.recipientName}</p>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '40px', padding: '32px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', marginBottom: '8px' }}>&ldquo;Some words are easier to send than to say.&rdquo;</p>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.15em' }}>MADE WITH MURAGOODS</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes wave {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
      `}</style>
    </main>
  );
}
