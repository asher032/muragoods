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

          {/* Three main choices */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.8s ease 0.9s' }}>
            {/* Anonymous Letter */}
            <Link href="/untold-words/anonymous/create" style={{ textDecoration: 'none' }}>
              <div style={{ background: 'linear-gradient(135deg, rgba(200,150,255,0.1), rgba(200,150,255,0.04))', border: '1px solid rgba(200,150,255,0.2)', borderRadius: '20px', padding: '32px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)', minHeight: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'; e.currentTarget.style.borderColor = 'rgba(200,150,255,0.5)'; e.currentTarget.style.boxShadow = '0 20px 60px rgba(200,150,255,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.borderColor = 'rgba(200,150,255,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>💌</span>
                <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '13px', color: '#c896ff', marginBottom: '8px' }}>Anonymous Letter</h2>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: '16px' }}>Words you want the world to read, but not know who wrote.</p>
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#c896ff', padding: '8px 20px', borderRadius: '10px', border: '1px solid rgba(200,150,255,0.3)', background: 'rgba(200,150,255,0.08)' }}>Write Anonymously →</span>
              </div>
            </Link>

            {/* Virtual Letter */}
            <Link href="/untold-words/letter/create" style={{ textDecoration: 'none' }}>
              <div style={{ background: 'linear-gradient(135deg, rgba(255,100,150,0.1), rgba(255,100,150,0.04))', border: '1px solid rgba(255,100,150,0.2)', borderRadius: '20px', padding: '32px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)', minHeight: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'; e.currentTarget.style.borderColor = 'rgba(255,100,150,0.5)'; e.currentTarget.style.boxShadow = '0 20px 60px rgba(255,100,150,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,100,150,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>💗</span>
                <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '13px', color: '#ffb4a2', marginBottom: '8px' }}>Virtual Letter</h2>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: '16px' }}>A private letter made for someone special. Send it to their Gmail.</p>
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffb4a2', padding: '8px 20px', borderRadius: '10px', border: '1px solid rgba(255,100,150,0.3)', background: 'rgba(255,100,150,0.08)' }}>Write a Letter →</span>
              </div>
            </Link>

            {/* Song Message */}
            <Link href="/untold-words/song/create" style={{ textDecoration: 'none' }}>
              <div style={{ background: 'linear-gradient(135deg, rgba(30,215,96,0.08), rgba(123,47,247,0.06))', border: '1px solid rgba(30,215,96,0.2)', borderRadius: '20px', padding: '32px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)', minHeight: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'; e.currentTarget.style.borderColor = 'rgba(30,215,96,0.5)'; e.currentTarget.style.boxShadow = '0 20px 60px rgba(30,215,96,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.borderColor = 'rgba(30,215,96,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>🎵</span>
                <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '13px', color: '#1ed760', marginBottom: '8px' }}>Say It Through a Song</h2>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: '16px' }}>Let a song say what you can&apos;t. Add a Spotify link.</p>
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#1ed760', padding: '8px 20px', borderRadius: '10px', border: '1px solid rgba(30,215,96,0.3)', background: 'rgba(30,215,96,0.08)' }}>Choose a Song →</span>
              </div>
            </Link>
          </div>

          {/* Explore links */}
          <div style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease 1.1s', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/untold-words/anonymous/archive" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)', textDecoration: 'none', letterSpacing: '0.1em', padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', transition: 'all 0.3s ease' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#c896ff'; e.currentTarget.style.borderColor = 'rgba(200,150,255,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >📚 Browse Archive</Link>
            <Link href="/untold-words/gallery" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)', textDecoration: 'none', letterSpacing: '0.1em', padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', transition: 'all 0.3s ease' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ffd60a'; e.currentTarget.style.borderColor = 'rgba(255,214,10,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >🖼️ Gallery</Link>
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
