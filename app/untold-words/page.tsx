'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

export default function UntoldWordsHome() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('user')) setIsLoggedIn(true);
    setTimeout(() => setLoaded(true), 100);
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18', overflow: 'hidden' }}>
      <NavBar pageLabel="Untold Words" />

      {/* Hero */}
      <section style={{ position: 'relative', minHeight: '85vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px 40px' }}>
        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: '10%', left: '20%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,100,150,0.08), transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '15%', width: '250px', height: '250px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(123,47,247,0.08), transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />

        <div style={{ textAlign: 'center', maxWidth: '640px', position: 'relative', zIndex: 1 }}>
          {/* Floating emojis */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '24px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.8s ease 0.2s' }}>
            {['💌', '🎵', '💌'].map((e, i) => (
              <span key={i} style={{ fontSize: '28px', animation: `float ${3 + i * 0.5}s ease-in-out infinite`, animationDelay: `${i * 0.3}s` }}>{e}</span>
            ))}
          </div>

          <h1 style={{
            fontFamily: 'var(--font-arcade)',
            fontSize: 'clamp(28px, 6vw, 48px)',
            color: '#ffd60a',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            textShadow: '0 0 40px rgba(255,214,10,0.2)',
            opacity: loaded ? 1 : 0,
            transform: loaded ? 'translateY(0)' : 'translateY(30px)',
            transition: 'all 0.8s ease 0.3s',
            marginBottom: '16px',
          }}>
            Untold Words
          </h1>

          <div style={{ width: '60px', height: '2px', background: 'linear-gradient(90deg, transparent, #ffd60a, transparent)', margin: '0 auto 20px', opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease 0.5s' }} />

          <p style={{
            fontFamily: 'var(--font-arcade)',
            fontSize: 'clamp(10px, 2vw, 13px)',
            color: '#e8b4f8',
            letterSpacing: '0.12em',
            marginBottom: '12px',
            opacity: loaded ? 1 : 0,
            transform: loaded ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.8s ease 0.5s',
          }}>
            A bunch of the untold words, sent through the song.
          </p>

          <p style={{
            fontSize: '14px',
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '440px',
            margin: '0 auto 48px',
            lineHeight: 1.7,
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.8s ease 0.7s',
          }}>
            Express your untold message through the song. There are things we can&apos;t say ourselves, so we let music and letters say them for us.
          </p>

          {/* Two main choices */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '32px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.8s ease 0.9s' }}>
            {/* Song Message */}
            <Link href="/untold-words/song/create" style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(123,47,247,0.12), rgba(255,100,150,0.06))',
                border: '1px solid rgba(123,47,247,0.2)',
                borderRadius: '20px',
                padding: '36px 28px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                minHeight: '220px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'; e.currentTarget.style.borderColor = 'rgba(123,47,247,0.5)'; e.currentTarget.style.boxShadow = '0 20px 60px rgba(123,47,247,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.borderColor = 'rgba(123,47,247,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🎵</span>
                <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#e8b4f8', marginBottom: '8px' }}>Say It Through a Song</h2>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>Sometimes a song says what words can&apos;t. Choose a song and let it carry the message.</p>
              </div>
            </Link>

            {/* Love Letter */}
            <Link href="/untold-words/letter/create" style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(255,100,150,0.12), rgba(255,180,100,0.06))',
                border: '1px solid rgba(255,100,150,0.2)',
                borderRadius: '20px',
                padding: '36px 28px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                minHeight: '220px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'; e.currentTarget.style.borderColor = 'rgba(255,100,150,0.5)'; e.currentTarget.style.boxShadow = '0 20px 60px rgba(255,100,150,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,100,150,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>💌</span>
                <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffb4a2', marginBottom: '8px' }}>Write a Digital Love Letter</h2>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>Write a beautiful love letter, add photos, and share it instantly with a unique link.</p>
              </div>
            </Link>
          </div>

          {/* Explore link */}
          <div style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease 1.1s' }}>
            <Link href="/untold-words/explore" style={{
              fontFamily: 'var(--font-arcade)',
              fontSize: '10px',
              color: 'rgba(255,255,255,0.3)',
              textDecoration: 'none',
              letterSpacing: '0.1em',
              padding: '10px 20px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ffd60a'; e.currentTarget.style.borderColor = 'rgba(255,214,10,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              I just want to explore →
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '40px 20px 80px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>How It Works</p>
        </div>
        {[
          { icon: '✨', title: 'Choose how to express yourself', desc: 'Pick a song or write a letter — whatever feels right.' },
          { icon: '📝', title: 'Create your message', desc: 'Add your words, a photo, maybe a date that matters.' },
          { icon: '🔗', title: 'Get your unique link', desc: 'Every message gets its own private URL.' },
          { icon: '💌', title: 'Send it to someone', desc: 'Share the link, send via email, or keep it for yourself.' },
        ].map((step, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: '16px',
            alignItems: 'flex-start',
            padding: '20px',
            borderRadius: '16px',
            marginBottom: '12px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            opacity: loaded ? 1 : 0,
            transform: loaded ? 'translateY(0)' : 'translateY(20px)',
            transition: `all 0.6s ease ${1.2 + i * 0.15}s`,
          }}>
            <span style={{ fontSize: '24px', flexShrink: 0, marginTop: '2px' }}>{step.icon}</span>
            <div>
              <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#ffd60a', marginBottom: '4px' }}>{step.title}</h3>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{step.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Footer quote */}
      <div style={{ padding: '40px 20px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', marginBottom: '8px' }}>&ldquo;Some words are easier to send than to say.&rdquo;</p>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.15em' }}>MADE WITH MURAGOODS</p>
      </div>

      {/* Float animation keyframe */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </main>
  );
}
