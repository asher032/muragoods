'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Bird, Cloud, Eye, Flower2, Handshake, Heart, HeartCrack } from 'lucide-react';
interface ConfessionData {
  shortId: string;
  title: string;
  content: string;
  category: string;
  visibility: string;
  likes: number;
  views: number;
  createdAt: string;
}

const catColors: Record<string, { emoji: React.ReactNode; color: string }> = {
  Confession: { emoji: <Heart color={'#c896ff'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color: '#c896ff' },
  Appreciation: { emoji: <Heart color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color: '#ffd60a' },
  'Missing Someone': { emoji: <HeartCrack color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color:'#ff6496' },
  Friendship: { emoji: <Handshake className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color: '#64ff96' },
  Crush: { emoji: <Flower2 color={'#ff4d8d'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color: '#ffb4da' },
  'Moving On': { emoji: <Bird className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color:'#6496ff' },
  'Random Thoughts': { emoji: <Cloud className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color:'#ffb464' },
};

export default function ViewConfession() {
  const params = useParams();
  const shortId = params.id as string;
  const [confession, setConfession] = useState<ConfessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    async function fetchConfession() {
      try {
        const res = await fetch(`/api/untold-words/confessions?id=${shortId}`);
        const result = await res.json();
        if (result.success) {
          setConfession(result.data);
          setLikes(result.data.likes || 0);
        } else {
          setError('Confession not found or has been removed.');
        }
      } catch { setError('Failed to load confession.'); }
      setLoading(false);
    }
    if (shortId) fetchConfession();
  }, [shortId]);

  useEffect(() => {
    if (opened) setTimeout(() => setShowContent(true), 400);
  }, [opened]);

  const handleLike = async () => {
    try {
      const res = await fetch(`/api/untold-words/confessions?id=${shortId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'like' }),
      });
      const result = await res.json();
      if (result.success) { setLikes(result.data.likes); setLiked(result.data.liked); }
    } catch { /* empty */ }
  };

  const handleReport = async () => {
    if (reported) return;
    try {
      await fetch(`/api/untold-words/confessions?id=${shortId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'report' }),
      });
      setReported(true);
    } catch { /* empty */ }
  };

  if (loading) return <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)', animation: 'pulse 2s ease infinite' }}>Loading...</p><style jsx>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style></main>;

  if (error || !confession) return <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}><div style={{ textAlign: 'center' }}><p style={{ fontSize: '48px', marginBottom: '16px'}}></p><p style={{ fontFamily:'var(--font-arcade)', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>{error}</p><Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#c896ff', textDecoration: 'none' }}>← Back to Untold Words</Link></div></main>;

  const cat = catColors[confession.category] || catColors['Confession'];

  if (!opened) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ position: 'fixed', top: '20%', left: '20%', width: '400px', height: '400px', borderRadius: '50%', background: `radial-gradient(circle, ${cat.color}10, transparent 70%)`, filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '60px', marginBottom: '24px' }}>{cat.emoji}</div>
          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: cat.color, background: cat.color + '15', padding: '4px 12px', borderRadius: '8px', marginBottom: '16px', display: 'inline-block' }}>{confession.category}</span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: 'clamp(18px, 5vw, 26px)', color: cat.color, marginTop: '16px', marginBottom: '24px' }}>{confession.title}</h1>
          <div onClick={() => setOpened(true)} style={{ cursor: 'pointer', margin: '0 auto', width: '160px', height: '120px', transition: 'transform 0.3s ease' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ width: '100%', height: '100%', background: '#141428', border: `2px solid ${cat.color}40`, borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: `linear-gradient(180deg, ${cat.color}15, transparent)`, clipPath: 'polygon(0 0, 50% 80%, 100% 0)' }} />
              <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '28px', filter: `drop-shadow(0 0 12px ${cat.color}60)` }}>{cat.emoji}</div>
            </div>
          </div>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '28px' }}>Open this confession</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18', padding: '40px 20px 100px' }}>
      <div style={{ position: 'fixed', top: '10%', right: '10%', width: '300px', height: '300px', borderRadius: '50%', background: `radial-gradient(circle, ${cat.color}08, transparent 70%)`, filter: 'blur(80px)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: '520px', margin: '0 auto', opacity: showContent ? 1 : 0, transform: showContent ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        <div style={{ background: '#141428', border: `1px solid ${cat.color}30`, borderRadius: '24px', overflow: 'hidden', boxShadow: `0 16px 48px rgba(0,0,0,0.3), 0 0 60px ${cat.color}08` }}>
          <div style={{ padding: '36px 32px 24px', textAlign: 'center', borderBottom: `1px solid ${cat.color}15` }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{cat.emoji}</div>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: cat.color, background: cat.color + '15', padding: '3px 10px', borderRadius: '6px' }}>{confession.category}</span>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: cat.color, marginTop: '16px', marginBottom: '4px' }}>{confession.title}</h1>
            <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{new Date(confession.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>

          <div style={{ padding: '28px 32px' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '15px', color: 'rgba(255,255,255,0.65)', lineHeight: 2.2, whiteSpace: 'pre-wrap' }}>
              {confession.content.split('\n').map((line, i) => (
                <p key={i} style={{ marginBottom: '10px', opacity: showContent ? 1 : 0, transform: showContent ? 'translateY(0)' : 'translateY(10px)', transition: `all 0.5s ease ${0.3 + i * 0.04}s` }}>{line || <br />}</p>
              ))}
            </div>
          </div>

          <div style={{ padding: '16px 32px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${cat.color}10` }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <button onClick={handleLike} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: liked ? '#ff6496' : 'rgba(255,255,255,0.3)', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', padding: '4px 0' }}>
                <span style={{ fontSize: '18px' }}>{liked ? <Heart color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> : <Heart color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />}</span>
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>{likes}</span>
              </button>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}><Eye className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {confession.views}</span>
            </div>
            <button onClick={handleReport} disabled={reported} style={{ background: 'none', border: 'none', color: reported ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.2)', fontSize: '10px', cursor: reported ? 'default' : 'pointer', fontFamily: 'var(--font-arcade)' }}>
              {reported ? 'Reported' : 'Report'}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '24px' }}>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)' }}>Written by someone who needed to let this out.</p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '16px', padding: '32px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>← Back to Untold Words</Link>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', marginTop: '16px', fontStyle: 'italic' }}>&ldquo;Some words are easier to send than to say.&rdquo;</p>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.12)', letterSpacing: '0.15em', marginTop: '8px' }}>MADE WITH MURAGOODS</p>
        </div>
      </div>
    </main>
  );
}
