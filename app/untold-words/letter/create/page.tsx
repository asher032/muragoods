'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

const themes = [
  { id: 'default', name: 'Classic', bg: '#141428', border: 'rgba(255,100,150,0.3)', accent: '#ff6496' },
  { id: 'midnight', name: 'Midnight', bg: '#0a1628', border: 'rgba(100,150,255,0.3)', accent: '#6496ff' },
  { id: 'sunset', name: 'Sunset', bg: '#1a1008', border: 'rgba(255,180,100,0.3)', accent: '#ffb464' },
  { id: 'garden', name: 'Garden', bg: '#0a1a10', border: 'rgba(100,255,150,0.3)', accent: '#64ff96' },
  { id: 'lavender', name: 'Lavender', bg: '#140a1a', border: 'rgba(200,150,255,0.3)', accent: '#c896ff' },
];

export default function CreateLoveLetter() {
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [senderName, setSenderName] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [letterDate, setLetterDate] = useState('');
  const [signature, setSignature] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const [theme, setTheme] = useState('default');  const [showPreview, setShowPreview] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sendError, setSendError] = useState('');

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const currentTheme = themes.find(t => t.id === theme) || themes[0];

  const handleCreate = async () => {
    if (!recipientName || !title || !content) return;
    setCreating(true);
    try {
      const res = await fetch('/api/untold-words/letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName,
          senderName: isAnonymous ? 'Anonymous' : senderName || 'Someone who loves you',
          isAnonymous,
          title,
          content,
          letterDate,
          signature,
          songTitle,
          songArtist,
          theme,
        }),
      });
      const result = await res.json();
      if (result.success) setCreated(result.data.shortId);
    } catch { /* empty */ }
    setCreating(false);
  };

  const link = created ? `${typeof window !== 'undefined' ? window.location.origin : ''}/untold-words/letter/${created}` : '';

  const handleSendEmail = async () => {
    if (!recipientEmail) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) { setSendError('Please enter a valid email address'); return; }
    setSending(true); setSendState('sending'); setSendError('');
    try {
      const res = await fetch('/api/untold-words/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail, letterUrl: link, senderName: isAnonymous ? 'Anonymous' : senderName || 'Someone who loves you', recipientName }),
      });
      const result = await res.json();
      if (result.success) { setSendState('sent'); } else { setSendState('error'); setSendError(result.error || 'Failed to send'); }
    } catch { setSendState('error'); setSendError('Network error. Please try again.'); }
    setSending(false);
  };

  if (created) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Letter Sent" />
        <div style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
            {sendState !== 'sent' ? (
              <>
                <div style={{ fontSize: '64px', marginBottom: '20px', animation: 'float 3s ease-in-out infinite' }}>💌</div>
                <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#ffd60a', marginBottom: '8px' }}>Your letter is ready!</h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>Send it to {recipientName}</p>

                {/* Send to Gmail */}
                <div style={{ background: 'rgba(255,100,150,0.06)', border: '1px solid rgba(255,100,150,0.2)', borderRadius: '16px', padding: '24px', marginBottom: '16px', textAlign: 'left' }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#ffb4a2', marginBottom: '4px' }}>💌 Send this letter</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '16px' }}>Send directly from muragoods0@gmail.com — the recipient gets a beautiful email with a link to open their letter.</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={recipientEmail} onChange={e => { setRecipientEmail(e.target.value); setSendError(''); }} placeholder="recipient@gmail.com" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 14px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                    <button onClick={handleSendEmail} disabled={sending || !recipientEmail} style={{ padding: '12px 20px', borderRadius: '10px', border: '1px solid rgba(255,100,150,0.4)', background: sending ? 'rgba(255,100,150,0.05)' : 'rgba(255,100,150,0.15)', color: '#ffb4a2', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: sending ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                      {sending ? 'SENDING...' : 'SEND'}
                    </button>
                  </div>
                  {sendError && <p style={{ fontSize: '11px', color: '#e63946', marginTop: '8px' }}>{sendError}</p>}
                  {sendState === 'sending' && <p style={{ fontSize: '12px', color: '#ffb4a2', marginTop: '12px', animation: 'pulse 1.5s ease infinite' }}>Sending your letter... 💌</p>}
                </div>

                {/* Copy & Share */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px', marginBottom: '20px', textAlign: 'left' }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>🔗 Or copy the link and share it yourself</p>
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', marginBottom: '12px', wordBreak: 'break-all' }}>
                    <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffb4a2' }}>{link}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => navigator.clipboard.writeText(link)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,100,150,0.3)', background: 'rgba(255,100,150,0.1)', color: '#ffb4a2', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>📋 Copy Link</button>
                    <button onClick={() => {
                      const subject = encodeURIComponent('You received a digital letter 💌');
                      const body = encodeURIComponent(`Hey ${recipientName},\n\nSomeone sent you a letter through Muragoods.\n\nOpen it here: ${link}\n\n— Sent via Muragoods Untold Letters`);
                      window.open(`https://mail.google.com/mail/?view=cm&to=&subject=${subject}&body=${body}`, '_blank');
                    }} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,180,100,0.3)', background: 'rgba(255,180,100,0.1)', color: '#ffb464', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>✉️ Open Gmail</button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← Back</Link>
                  <Link href={`/untold-words/letter/${created}`} style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none' }}>Preview →</Link>
                </div>
              </>
            ) : (
              /* Sent success */
              <>
                <div style={{ fontSize: '64px', marginBottom: '20px' }}>💗</div>
                <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#ffd60a', marginBottom: '8px' }}>Your letter has been sent! 💗</h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Sent to: <span style={{ color: '#ffb4a2' }}>{recipientEmail}</span></p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '28px', marginBottom: '20px' }}>
                  <Link href={`/untold-words/letter/${created}`} style={{ display: 'block', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.12)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', textAlign: 'center' }}>📖 Open Letter</Link>
                  <button onClick={() => navigator.clipboard.writeText(link)} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,100,150,0.4)', background: 'rgba(255,100,150,0.12)', color: '#ffb4a2', fontFamily: 'var(--font-arcade)', fontSize: '11px', cursor: 'pointer' }}>📋 Copy Link</button>
                  <Link href="/untold-words/letter/create" style={{ display: 'block', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', textAlign: 'center' }}>✍️ Send Another</Link>
                </div>
              </>
            )}
          </div>
        </div>
        <style jsx>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} } @keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      </main>
    );
  }

  const previewVisible = showPreview && recipientName && title && content;

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Write a Love Letter" />
      <div style={{ maxWidth: previewVisible ? '900px' : '600px', margin: '0 auto', padding: '80px 20px 100px', display: 'flex', gap: '24px', alignItems: 'flex-start', transition: 'all 0.3s ease' }}>
        {/* Form */}
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '16px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.2s' }}>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>💌</span>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#ffb4a2', marginBottom: '6px' }}>Write a digital love letter</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>Write a beautiful love letter online, add photos, and share it instantly.</p>
          </div>

          {/* Recipient */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>To *</label>
            <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Their name..." style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '15px', fontFamily: 'inherit', padding: '8px 0' }} />
          </div>

          {/* Sender */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>From</label>
              <button onClick={() => setIsAnonymous(!isAnonymous)} style={{ background: isAnonymous ? 'rgba(255,100,150,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isAnonymous ? 'rgba(255,100,150,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '8px', padding: '4px 10px', color: isAnonymous ? '#ffb4a2' : 'rgba(255,255,255,0.4)', fontSize: '9px', fontFamily: 'var(--font-arcade)', cursor: 'pointer', transition: 'all 0.2s' }}>
                {isAnonymous ? '🥷 Anonymous' : '✏️ Your name'}
              </button>
            </div>
            {!isAnonymous && <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Your name..." style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'inherit', padding: '8px 0' }} />}
          </div>

          {/* Title */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Letter Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. For You, Always" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#ffb4a2', fontSize: '16px', fontFamily: 'var(--font-arcade)', padding: '8px 0' }} />
          </div>

          {/* Content */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Your Letter *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Dear you,&#10;&#10;I&apos;ve been wanting to tell you this for a long time..." rows={8} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'Georgia, serif', padding: '8px 0', resize: 'vertical', lineHeight: 2 }} />
          </div>

          {/* Extras row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px' }}>
              <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>📅 Date</label>
              <input value={letterDate} onChange={e => setLetterDate(e.target.value)} placeholder="March 14, 2024" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '12px', fontFamily: 'inherit', padding: '4px 0' }} />
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px' }}>
              <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>✍️ Signature</label>
              <input value={signature} onChange={e => setSignature(e.target.value)} placeholder="With love, ..." style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '12px', fontFamily: 'inherit', padding: '4px 0' }} />
            </div>
          </div>

          {/* Song attachment */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>🎵 Attach a Song (optional)</label>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input value={songTitle} onChange={e => setSongTitle(e.target.value)} placeholder="Song title..." style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 12px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              <input value={songArtist} onChange={e => setSongArtist(e.target.value)} placeholder="Artist..." style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 12px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Theme picker */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>🎨 Theme</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {themes.map(t => (
                <button key={t.id} onClick={() => setTheme(t.id)} style={{ padding: '6px 14px', borderRadius: '10px', border: `2px solid ${theme === t.id ? t.accent : 'rgba(255,255,255,0.08)'}`, background: theme === t.id ? `${t.accent}22` : 'rgba(255,255,255,0.03)', color: theme === t.id ? t.accent : 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: 'var(--font-arcade)', cursor: 'pointer', transition: 'all 0.2s' }}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <button onClick={() => setShowPreview(!showPreview)} disabled={!recipientName || !title || !content} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-arcade)', fontSize: '11px', cursor: 'pointer', opacity: !recipientName || !title || !content ? 0.4 : 1 }}>
              👁️ {showPreview ? 'HIDE' : 'PREVIEW'}
            </button>
            <button onClick={handleCreate} disabled={creating || !recipientName || !title || !content} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,100,150,0.4)', background: creating ? 'rgba(255,100,150,0.05)' : 'rgba(255,100,150,0.15)', color: '#ffb4a2', fontFamily: 'var(--font-arcade)', fontSize: '11px', cursor: creating ? 'wait' : 'pointer', opacity: !recipientName || !title || !content ? 0.4 : 1 }}>
              {creating ? 'CREATING...' : '💌 SEND YOUR LETTER'}
            </button>
          </div>
        </div>

        {/* Live Preview */}
        {previewVisible && (
          <div style={{ flex: '0 0 380px', position: 'sticky', top: '100px', opacity: loaded ? 1 : 0, transition: 'opacity 0.4s ease 0.4s' }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textAlign: 'center', marginBottom: '12px' }}>LIVE PREVIEW</p>
            <div style={{ background: currentTheme.bg, border: `1px solid ${currentTheme.border}`, borderRadius: '20px', overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
              {/* Letter header */}
              <div style={{ padding: '32px 28px 16px', textAlign: 'center', borderBottom: `1px solid ${currentTheme.border}22` }}>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: '8px' }}>A letter for</p>
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '20px', color: currentTheme.accent, fontStyle: 'italic', marginBottom: '4px' }}>{recipientName}</h2>
                {letterDate && <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>{letterDate}</p>}
              </div>

              {/* Title */}
              <div style={{ padding: '20px 28px 0', textAlign: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: currentTheme.accent }}>&ldquo;{title}&rdquo;</h3>
              </div>

              {/* Content */}
              <div style={{ padding: '20px 28px' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '13px', color: 'rgba(255,255,255,0.65)', lineHeight: 2, whiteSpace: 'pre-wrap' }}>
                  {content.split('\n').map((line, i) => (
                    <p key={i} style={{ marginBottom: '8px' }}>{line || <br />}</p>
                  ))}
                </div>
              </div>

              {/* Song */}
              {songTitle && (
                <div style={{ padding: '0 28px 20px' }}>
                  <div style={{ background: `${currentTheme.accent}11`, border: `1px solid ${currentTheme.accent}33`, borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>🎵</span>
                    <div>
                      <p style={{ fontSize: '12px', color: currentTheme.accent, fontWeight: 600 }}>{songTitle}</p>
                      {songArtist && <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{songArtist}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Signature */}
              <div style={{ padding: '16px 28px 28px', borderTop: `1px solid ${currentTheme.accent}22`, textAlign: 'right' }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: '13px', color: currentTheme.accent, fontStyle: 'italic' }}>{signature || (isAnonymous ? '— Anonymous' : `— ${senderName || 'Someone who loves you'}`)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
