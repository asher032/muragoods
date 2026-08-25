'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

export default function CreateSongMessage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [senderName, setSenderName] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [songTitle, setSongTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [messageTitle, setMessageTitle] = useState('');
  const [message, setMessage] = useState('');
  const [memoryDate, setMemoryDate] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const handleCreate = async () => {
    if (!recipientName || !songTitle || !artist || !message) return;
    setCreating(true);
    try {
      const res = await fetch('/api/untold-words/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName,
          senderName: isAnonymous ? 'Anonymous' : senderName || 'Someone who cares',
          isAnonymous,
          songTitle,
          artist,
          messageTitle,
          message,
          memoryDate,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setCreated(result.data.shortId);
      }
    } catch { /* empty */ }
    setCreating(false);
  };

  const link = created ? `${typeof window !== 'undefined' ? window.location.origin : ''}/untold-words/song/${created}` : '';

  if (created) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Message Sent" />
        <div style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px', animation: 'float 3s ease-in-out infinite' }}>💌</div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#ffd60a', marginBottom: '12px' }}>Your song message is ready!</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>Share this link with {recipientName}</p>

            {/* Link display */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px', marginBottom: '20px', wordBreak: 'break-all' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#e8b4f8' }}>{link}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <button onClick={() => { navigator.clipboard.writeText(link); }} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid rgba(123,47,247,0.4)', background: 'rgba(123,47,247,0.12)', color: '#e8b4f8', fontFamily: 'var(--font-arcade)', fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s' }}>
                📋 COPY LINK
              </button>
              <button onClick={() => {
                const subject = encodeURIComponent('You have a message waiting for you 💌');
                const body = encodeURIComponent(`Hey ${recipientName},\n\nSomeone wanted to tell you something through a song. Open the link below to see your message:\n\n${link}\n\n— Sent via Muragoods Untold Words`);
                window.open(`https://mail.google.com/mail/?view=cm&to=&subject=${subject}&body=${body}`, '_blank');
              }} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,100,150,0.4)', background: 'rgba(255,100,150,0.12)', color: '#ffb4a2', fontFamily: 'var(--font-arcade)', fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s' }}>
                ✉️ SEND VIA GMAIL
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← Back</Link>
              <Link href={`/untold-words/song/${created}`} style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none' }}>Preview →</Link>
            </div>
          </div>
        </div>
        <style jsx>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }`}</style>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Say It Through a Song" />
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '80px 20px 100px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '36px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>🎵</span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#e8b4f8', marginBottom: '8px' }}>Say it through a song.</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>Sometimes a song says what words can&apos;t. Choose a song and let it carry the message you never knew how to say.</p>
        </div>

        {/* Form */}
        <div style={{ display: 'grid', gap: '16px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.2s' }}>
          {/* Recipient */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Who is this for? *</label>
            <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Their name..." style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '15px', fontFamily: 'inherit', padding: '8px 0' }} />
          </div>

          {/* Sender */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Who is this from?</label>
              <button onClick={() => setIsAnonymous(!isAnonymous)} style={{ background: isAnonymous ? 'rgba(123,47,247,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isAnonymous ? 'rgba(123,47,247,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '8px', padding: '4px 10px', color: isAnonymous ? '#e8b4f8' : 'rgba(255,255,255,0.4)', fontSize: '9px', fontFamily: 'var(--font-arcade)', cursor: 'pointer', transition: 'all 0.2s' }}>
                {isAnonymous ? '🥷 Anonymous' : '✏️ Your name'}
              </button>
            </div>
            {!isAnonymous && <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Your name (or leave blank for 'Someone who cares')" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'inherit', padding: '8px 0' }} />}
          </div>

          {/* Song */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>🎵 The Song *</label>
            <div style={{ display: 'grid', gap: '12px' }}>
              <input value={songTitle} onChange={e => setSongTitle(e.target.value)} placeholder="Song title..." style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px', color: '#fff', fontSize: '14px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artist name..." style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px', color: '#fff', fontSize: '14px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Message */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Your Message *</label>
            <input value={messageTitle} onChange={e => setMessageTitle(e.target.value)} placeholder="Title (optional)" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#e8b4f8', fontSize: '13px', fontFamily: 'var(--font-arcade)', padding: '4px 0 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Write what this song makes you think of..." rows={5} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'inherit', padding: '8px 0', resize: 'vertical', lineHeight: 1.7 }} />
          </div>

          {/* Memory date */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>📅 A Date That Matters (optional)</label>
            <input value={memoryDate} onChange={e => setMemoryDate(e.target.value)} placeholder="e.g. The day we first met, March 2024..." style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'inherit', padding: '8px 0' }} />
          </div>

          {/* Preview & Create */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button onClick={() => setShowPreview(!showPreview)} disabled={!recipientName || !songTitle || !artist || !message} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-arcade)', fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s', opacity: !recipientName || !songTitle || !artist || !message ? 0.4 : 1 }}>
              👁️ PREVIEW
            </button>
            <button onClick={handleCreate} disabled={creating || !recipientName || !songTitle || !artist || !message} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: '1px solid rgba(123,47,247,0.4)', background: creating ? 'rgba(123,47,247,0.05)' : 'rgba(123,47,247,0.15)', color: '#e8b4f8', fontFamily: 'var(--font-arcade)', fontSize: '11px', cursor: creating ? 'wait' : 'pointer', transition: 'all 0.2s', opacity: !recipientName || !songTitle || !artist || !message ? 0.4 : 1 }}>
              {creating ? 'CREATING...' : '💌 SEND YOUR MESSAGE'}
            </button>
          </div>
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <div onClick={() => setShowPreview(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', backdropFilter: 'blur(8px)' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#141428', border: '1px solid rgba(123,47,247,0.3)', borderRadius: '20px', padding: '0', maxWidth: '420px', width: '100%', overflow: 'hidden' }}>
              {/* Music card preview */}
              <div style={{ background: 'linear-gradient(135deg, rgba(123,47,247,0.2), rgba(255,100,150,0.1))', padding: '32px 28px 20px', textAlign: 'center' }}>
                <div style={{ width: '100px', height: '100px', borderRadius: '16px', background: 'linear-gradient(135deg, #7b2ff7, #ff6496)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(123,47,247,0.3)' }}>
                  <span style={{ fontSize: '40px' }}>🎵</span>
                </div>
                <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#fff', marginBottom: '4px' }}>{songTitle || 'Song Title'}</p>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{artist || 'Artist'}</p>
                {messageTitle && <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#e8b4f8', marginTop: '10px' }}>&ldquo;{messageTitle}&rdquo;</p>}
              </div>
              <div style={{ padding: '24px 28px' }}>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.8, fontStyle: 'italic', marginBottom: '20px' }}>{message || 'Your message...'}</p>
                {memoryDate && <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>📅 {memoryDate}</p>}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', textAlign: 'right' }}>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>— {isAnonymous ? 'Anonymous' : senderName || 'Someone who cares'}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>For {recipientName}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
