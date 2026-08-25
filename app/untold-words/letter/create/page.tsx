'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

export default function CreateAnonymousLetter() {
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [showConfirm, setShowConfirm] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sendError, setSendError] = useState('');

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return;
    if (visibility === 'public' && !showConfirm) { setShowConfirm(true); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/untold-words/anonymous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category: 'Letter', visibility }),
      });
      const result = await res.json();
      if (result.success) setCreated(result.data.shortId);
    } catch { /* empty */ }
    setCreating(false);
    setShowConfirm(false);
  };

  if (created) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Letter Published" />
        <div style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px', animation: 'float 3s ease-in-out infinite' }}>💌</div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#ffd60a', marginBottom: '8px' }}>Your letter is live!</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>
              {visibility === 'public' ? 'It\'s now part of the Untold Words gallery.' : 'Only people with the link can see it.'}
            </p>
            {sendState !== 'sent' ? (
              <>
                {/* Send via Gmail */}
                <div style={{ background: 'rgba(255,100,150,0.06)', border: '1px solid rgba(255,100,150,0.2)', borderRadius: '16px', padding: '20px', marginBottom: '16px', textAlign: 'left' }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#ffb4a2', marginBottom: '4px' }}>💌 Send this letter</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '12px' }}>Send from muragoods0@gmail.com — they get a link to read your letter.</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={recipientEmail} onChange={e => { setRecipientEmail(e.target.value); setSendError(''); }} placeholder="recipient@gmail.com" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 12px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                    <button onClick={async () => {
                      if (!recipientEmail) return;
                      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                      if (!emailRegex.test(recipientEmail)) { setSendError('Enter a valid email'); return; }
                      setSending(true); setSendState('sending'); setSendError('');
                      try {
                        const res = await fetch('/api/untold-words/send-email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ recipientEmail, letterUrl: (typeof window !== 'undefined' ? window.location.origin : '') + '/untold-words/letter/' + created, senderName: 'Anonymous', recipientName: 'You' }),
                        });
                        const result = await res.json();
                        if (result.success) setSendState('sent'); else { setSendState('error'); setSendError(result.error || 'Failed'); }
                      } catch { setSendState('error'); setSendError('Network error'); }
                      setSending(false);
                    }} disabled={sending || !recipientEmail} style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(255,100,150,0.4)', background: sending ? 'rgba(255,100,150,0.05)' : 'rgba(255,100,150,0.15)', color: '#ffb4a2', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: sending ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>{sending ? 'SENDING...' : 'SEND'}</button>
                  </div>
                  {sendError && <p style={{ fontSize: '10px', color: '#e63946', marginTop: '6px' }}>{sendError}</p>}
                </div>
                {/* Copy Link */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>🔗 Or copy the link</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => navigator.clipboard.writeText((typeof window !== 'undefined' ? window.location.origin : '') + '/untold-words/letter/' + created)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,100,150,0.3)', background: 'rgba(255,100,150,0.08)', color: '#ffb4a2', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>📋 Copy Link</button>
                    <button onClick={() => {
                      const subject = encodeURIComponent('You received an anonymous letter 💌');
                      const body = encodeURIComponent('Someone sent you a letter through Muragoods Untold Words.\n\nOpen it here: ' + (typeof window !== 'undefined' ? window.location.origin : '') + '/untold-words/letter/' + created + '\n\n— Sent via Muragoods');
                      window.open('https://mail.google.com/mail/?view=cm&to=&subject=' + subject + '&body=' + body, '_blank');
                    }} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,180,100,0.3)', background: 'rgba(255,180,100,0.08)', color: '#ffb464', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>✉️ Gmail</button>
                  </div>
                </div>
                <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← Back to Untold Words</Link>
              </>
            ) : (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>💗</div>
                <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: '#ffd60a', marginBottom: '8px' }}>Letter sent! 💗</h2>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>Sent to: <span style={{ color: '#ffb4a2' }}>{recipientEmail}</span></p>
                <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none' }}>← Back to Untold Words</Link>
              </>
            )}
          </div>
        </div>
        <style jsx>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }`}</style>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Anonymous Letter" />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 20px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>💌</span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#c896ff', marginBottom: '8px' }}>Write an Anonymous Letter</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>Some words are meant to be shared, even when you don&apos;t want your name attached.</p>
        </div>

        <div style={{ display: 'grid', gap: '16px', opacity: loaded ? 1 : 0, transition: 'all 0.6s ease 0.2s' }}>
          {/* Title */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your letter a title..." maxLength={100} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '16px', fontFamily: 'var(--font-arcade)', padding: '8px 0' }} />
            <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textAlign: 'right', marginTop: '4px' }}>{title.length}/100</p>
          </div>

          {/* Content */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Your Letter *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write what you've been holding inside..." rows={10} maxLength={2000} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'Georgia, serif', padding: '8px 0', resize: 'vertical', lineHeight: 2 }} />
            <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textAlign: 'right', marginTop: '4px' }}>{content.length}/2000</p>
          </div>

          {/* Visibility */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>Who can see this?</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setVisibility('public')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${visibility === 'public' ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.08)'}`, background: visibility === 'public' ? 'rgba(255,214,10,0.1)' : 'rgba(255,255,255,0.03)', color: visibility === 'public' ? '#ffd60a' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' }}>
                <span style={{ fontSize: '16px', display: 'block', marginBottom: '4px' }}>🌎</span>
                Public
                <span style={{ display: 'block', fontSize: '8px', marginTop: '4px', opacity: 0.6 }}>Visible in the gallery</span>
              </button>
              <button onClick={() => setVisibility('private')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${visibility === 'private' ? 'rgba(123,47,247,0.4)' : 'rgba(255,255,255,0.08)'}`, background: visibility === 'private' ? 'rgba(123,47,247,0.1)' : 'rgba(255,255,255,0.03)', color: visibility === 'private' ? '#e8b4f8' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' }}>
                <span style={{ fontSize: '16px', display: 'block', marginBottom: '4px' }}>🔒</span>
                Private
                <span style={{ display: 'block', fontSize: '8px', marginTop: '4px', opacity: 0.6 }}>Only with the link</span>
              </button>
            </div>
          </div>

          {/* Submit */}
          <button onClick={handleCreate} disabled={creating || !title.trim() || !content.trim()} style={{ padding: '16px', borderRadius: '14px', border: '2px solid rgba(200,150,255,0.4)', background: creating ? 'rgba(200,150,255,0.05)' : 'rgba(200,150,255,0.18)', color: '#c896ff', fontFamily: 'var(--font-arcade)', fontSize: '12px', cursor: creating || !title.trim() || !content.trim() ? 'not-allowed' : 'pointer', opacity: !title.trim() || !content.trim() ? 0.4 : 1, transition: 'all 0.2s' }}>
            {creating ? 'PUBLISHING...' : visibility === 'public' ? '💌 PUBLISH ANONYMOUSLY' : '🔒 PUBLISH PRIVATELY'}
          </button>
        </div>

        {/* Confirm Public Modal */}
        {showConfirm && (
          <div onClick={() => setShowConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', backdropFilter: 'blur(8px)' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#141428', border: '1px solid rgba(255,214,10,0.3)', borderRadius: '20px', padding: '32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌎</div>
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: '#ffd60a', marginBottom: '12px' }}>Make this letter public?</h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>Anyone may be able to read this letter in the Untold Words gallery. Your identity will remain anonymous.</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleCreate} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.12)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>Make Public</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
