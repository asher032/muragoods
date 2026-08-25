'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  previewUrl: string;
  spotifyUrl: string;
  duration: number;
}

export default function CreateSongMessage() {
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [senderName, setSenderName] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [message, setMessage] = useState('');
  const [memoryDate, setMemoryDate] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sendError, setSendError] = useState('');

  // Song search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [spotifyLinkInput, setSpotifyLinkInput] = useState('');
  const [spotifyLinkError, setSpotifyLinkError] = useState('');

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const handlePasteSpotifyLink = () => {
    const url = spotifyLinkInput.trim();
    if (!url) return;
    // Extract track ID from Spotify URL
    const trackMatch = url.match(/track\/([a-zA-Z0-9]+)/);
    if (!trackMatch) { setSpotifyLinkError('Invalid Spotify link. Please paste a track URL.'); return; }
    const trackId = trackMatch[1];
    // Create a track object from the URL
    const track: Track = {
      id: trackId,
      title: 'Unknown Song',
      artist: 'Unknown Artist',
      album: '',
      artwork: '',
      previewUrl: '',
      spotifyUrl: `https://open.spotify.com/track/${trackId}`,
      duration: 0,
    };
    setSelectedTrack(track);
    setSpotifyLinkInput('');
    setSpotifyLinkError('');
  };

  const searchSongs = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) setSearchResults(data.tracks || []);
      else setSearchResults([]);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchSongs(value), 400);
  };

  const selectTrack = (track: Track) => {
    setSelectedTrack(track);
    setSearchQuery('');
    setSearchResults([]);
  };

  const togglePreview = (track: Track) => {
    if (!track.previewUrl) return;
    if (audioRef.current && playingPreview) {
      audioRef.current.pause();
      setPlayingPreview(false);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(track.previewUrl);
    audio.onended = () => setPlayingPreview(false);
    audioRef.current = audio;
    audio.play();
    setPlayingPreview(true);
  };

  const link = created ? `${typeof window !== 'undefined' ? window.location.origin : ''}/untold-words/song/${created}` : '';

  const handleCreate = async () => {
    if (!recipientName || !selectedTrack || !message) return;
    setCreating(true);
    try {
      const res = await fetch('/api/untold-words/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName,
          senderName: isAnonymous ? 'Anonymous' : senderName || 'Someone who cares',
          isAnonymous,
          songTitle: selectedTrack.title,
          artist: selectedTrack.artist,
          spotifyUrl: selectedTrack.spotifyUrl,
          artwork: selectedTrack.artwork,
          previewUrl: selectedTrack.previewUrl,
          messageTitle,
          message,
          memoryDate,
        }),
      });
      const result = await res.json();
      if (result.success) setCreated(result.data.shortId);
    } catch { /* empty */ }
    setCreating(false);
  };

  const handleSendEmail = async () => {
    if (!recipientEmail) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) { setSendError('Please enter a valid email address'); return; }
    setSending(true); setSendState('sending'); setSendError('');
    try {
      const res = await fetch('/api/untold-words/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail, letterUrl: link, senderName: isAnonymous ? 'Anonymous' : senderName || 'Someone who cares', recipientName }),
      });
      const result = await res.json();
      if (result.success) { setSendState('sent'); } else { setSendState('error'); setSendError(result.error || 'Failed to send'); }
    } catch { setSendState('error'); setSendError('Network error. Please try again.'); }
    setSending(false);
  };

  if (created) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Message Sent" />
        <div style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
            {sendState !== 'sent' ? (
              <>
                <div style={{ fontSize: '64px', marginBottom: '20px', animation: 'float 3s ease-in-out infinite' }}>🎵</div>
                <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#ffd60a', marginBottom: '8px' }}>Your song message is ready!</h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>Send it to {recipientName}</p>
                <div style={{ background: 'rgba(123,47,247,0.06)', border: '1px solid rgba(123,47,247,0.2)', borderRadius: '16px', padding: '24px', marginBottom: '16px', textAlign: 'left' }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#e8b4f8', marginBottom: '4px' }}>💌 Send this song message</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '16px' }}>Send directly from muragoods0@gmail.com.</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={recipientEmail} onChange={e => { setRecipientEmail(e.target.value); setSendError(''); }} placeholder="recipient@gmail.com" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 14px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                    <button onClick={handleSendEmail} disabled={sending || !recipientEmail} style={{ padding: '12px 20px', borderRadius: '10px', border: '1px solid rgba(123,47,247,0.4)', background: sending ? 'rgba(123,47,247,0.05)' : 'rgba(123,47,247,0.15)', color: '#e8b4f8', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: sending ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                      {sending ? 'SENDING...' : 'SEND'}
                    </button>
                  </div>
                  {sendError && <p style={{ fontSize: '11px', color: '#e63946', marginTop: '8px' }}>{sendError}</p>}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px', marginBottom: '20px', textAlign: 'left' }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>🔗 Or copy the link</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => navigator.clipboard.writeText(link)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(123,47,247,0.3)', background: 'rgba(123,47,247,0.1)', color: '#e8b4f8', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>📋 Copy Link</button>
                  </div>
                </div>
                <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← Back</Link>
              </>
            ) : (
              <>
                <div style={{ fontSize: '64px', marginBottom: '20px' }}>💗</div>
                <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#ffd60a', marginBottom: '8px' }}>Your song message has been sent! 💗</h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Sent to: <span style={{ color: '#e8b4f8' }}>{recipientEmail}</span></p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '28px' }}>
                  <Link href={`/untold-words/song/${created}`} style={{ display: 'block', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.12)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', textAlign: 'center' }}>🎵 Open Song Message</Link>
                  <Link href="/untold-words" style={{ display: 'block', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', textAlign: 'center' }}>← Back to Untold Words</Link>
                </div>
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
      <NavBar pageLabel="Say It Through a Song" />
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '80px 20px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>🎵</span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#e8b4f8', marginBottom: '8px' }}>Say it through a song.</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>Sometimes a song says what words can&apos;t. Search for a song and let it carry the message.</p>
        </div>

        <div style={{ display: 'grid', gap: '16px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.2s' }}>
          {/* Recipient */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Who is this for? *</label>
            <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Their name..." style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '15px', fontFamily: 'inherit', padding: '8px 0' }} />
          </div>

          {/* Song Search */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#1ed760', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>🎵 Choose a song *</label>

            {selectedTrack ? (
              /* Selected Track */
              <div style={{ background: 'rgba(30,215,96,0.06)', border: '1px solid rgba(30,215,96,0.25)', borderRadius: '14px', padding: '16px', display: 'flex', gap: '14px', alignItems: 'center' }}>
                {selectedTrack.artwork && (
                  <img src={selectedTrack.artwork} alt="" style={{ width: '72px', height: '72px', borderRadius: '10px', objectFit: 'cover' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#1ed760', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTrack.title}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTrack.artist}</p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {selectedTrack.previewUrl && (
                      <button onClick={() => togglePreview(selectedTrack)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(30,215,96,0.3)', background: playingPreview ? 'rgba(30,215,96,0.2)' : 'rgba(30,215,96,0.08)', color: '#1ed760', fontSize: '9px', fontFamily: 'var(--font-arcade)', cursor: 'pointer' }}>
                        {playingPreview ? '⏸ Pause' : '▶ Preview'}
                      </button>
                    )}
                    <button onClick={() => setSelectedTrack(null)} style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: '9px', fontFamily: 'var(--font-arcade)', cursor: 'pointer' }}>
                      Change
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Search Input */
              <div>
                <div style={{ position: 'relative' }}>
                  <input value={searchQuery} onChange={e => handleSearchChange(e.target.value)} placeholder="Search for a song..." style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(30,215,96,0.2)', borderRadius: '12px', padding: '14px 16px', color: '#fff', fontSize: '14px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  {searching && <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#1ed760', animation: 'pulse 1s ease infinite' }}>⏳</span>}
                </div>
                {searchQuery && !searching && searchResults.length === 0 && (
                  <div style={{ marginTop: '12px', padding: '16px', background: 'rgba(30,215,96,0.04)', border: '1px solid rgba(30,215,96,0.15)', borderRadius: '12px', textAlign: 'center' }}>
                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>No results found. You can paste a Spotify link instead:</p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input value={spotifyLinkInput} onChange={e => { setSpotifyLinkInput(e.target.value); setSpotifyLinkError(''); }} placeholder="https://open.spotify.com/track/..." style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(30,215,96,0.2)', borderRadius: '10px', padding: '10px 12px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }} />
                      <button onClick={handlePasteSpotifyLink} disabled={!spotifyLinkInput} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(30,215,96,0.3)', background: spotifyLinkInput ? 'rgba(30,215,96,0.15)' : 'rgba(255,255,255,0.03)', color: '#1ed760', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: spotifyLinkInput ? 'pointer' : 'not-allowed' }}>Use Link</button>
                    </div>
                    {spotifyLinkError && <p style={{ fontSize: '10px', color: '#e63946', marginTop: '8px' }}>{spotifyLinkError}</p>}
                  </div>
                )}
                {searchResults.length > 0 && (
                  <div style={{ marginTop: '12px', maxHeight: '360px', overflowY: 'auto', display: 'grid', gap: '6px' }}>
                    {searchResults.map(track => (
                      <div key={track.id} onClick={() => selectTrack(track)} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(30,215,96,0.3)'; e.currentTarget.style.background = 'rgba(30,215,96,0.04)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                      >
                        {track.artwork && <img src={track.artwork} alt="" style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '12px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</p>
                          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artist} · {track.album}</p>
                        </div>
                        {track.previewUrl && (
                          <button onClick={e => { e.stopPropagation(); togglePreview(track); }} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(30,215,96,0.3)', background: playingPreview ? 'rgba(30,215,96,0.2)' : 'rgba(30,215,96,0.08)', color: '#1ed760', fontSize: '10px', cursor: 'pointer', flexShrink: 0 }}>
                            ▶
                          </button>
                        )}
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>Select →</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', textAlign: 'center' }}>Or paste a Spotify link directly:</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={spotifyLinkInput} onChange={e => { setSpotifyLinkInput(e.target.value); setSpotifyLinkError(''); }} placeholder="https://open.spotify.com/track/..." style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(30,215,96,0.2)', borderRadius: '10px', padding: '10px 12px', color: '#fff', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }} />
                    <button onClick={handlePasteSpotifyLink} disabled={!spotifyLinkInput} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(30,215,96,0.3)', background: spotifyLinkInput ? 'rgba(30,215,96,0.15)' : 'rgba(255,255,255,0.03)', color: '#1ed760', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: spotifyLinkInput ? 'pointer' : 'not-allowed' }}>Use Link</button>
                  </div>
                  {spotifyLinkError && <p style={{ fontSize: '10px', color: '#e63946', marginTop: '6px', textAlign: 'center' }}>{spotifyLinkError}</p>}
                </div>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '8px', textAlign: 'center' }}>Powered by Spotify</p>
              </div>
            )}
          </div>

          {/* Sender */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Who is this from?</label>
              <button onClick={() => setIsAnonymous(!isAnonymous)} style={{ background: isAnonymous ? 'rgba(123,47,247,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isAnonymous ? 'rgba(123,47,247,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '8px', padding: '4px 10px', color: isAnonymous ? '#e8b4f8' : 'rgba(255,255,255,0.4)', fontSize: '9px', fontFamily: 'var(--font-arcade)', cursor: 'pointer', transition: 'all 0.2s' }}>
                {isAnonymous ? '🥷 Anonymous' : '✏️ Your name'}
              </button>
            </div>
            {!isAnonymous && <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Your name..." style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'inherit', padding: '8px 0' }} />}
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
            <input value={memoryDate} onChange={e => setMemoryDate(e.target.value)} placeholder="e.g. The day we first met..." style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'inherit', padding: '8px 0' }} />
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button onClick={() => setShowPreview(!showPreview)} disabled={!recipientName || !selectedTrack || !message} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-arcade)', fontSize: '11px', cursor: 'pointer', opacity: !recipientName || !selectedTrack || !message ? 0.4 : 1 }}>
              👁️ PREVIEW
            </button>
            <button onClick={handleCreate} disabled={creating || !recipientName || !selectedTrack || !message} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: '1px solid rgba(123,47,247,0.4)', background: creating ? 'rgba(123,47,247,0.05)' : 'rgba(123,47,247,0.15)', color: '#e8b4f8', fontFamily: 'var(--font-arcade)', fontSize: '11px', cursor: creating ? 'wait' : 'pointer', opacity: !recipientName || !selectedTrack || !message ? 0.4 : 1 }}>
              {creating ? 'CREATING...' : '💌 SEND YOUR MESSAGE'}
            </button>
          </div>
        </div>

        {/* Preview Modal */}
        {showPreview && selectedTrack && (
          <div onClick={() => setShowPreview(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', backdropFilter: 'blur(8px)' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#141428', border: '1px solid rgba(123,47,247,0.3)', borderRadius: '20px', overflow: 'hidden', maxWidth: '420px', width: '100%' }}>
              {selectedTrack.artwork && (
                <div style={{ position: 'relative', width: '100%', paddingBottom: '100%' }}>
                  <img src={selectedTrack.artwork} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ padding: '24px 28px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#fff', marginBottom: '4px' }}>{selectedTrack.title}</p>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>{selectedTrack.artist}</p>
                {selectedTrack.previewUrl && (
                  <button onClick={() => togglePreview(selectedTrack)} style={{ padding: '8px 20px', borderRadius: '10px', border: '1px solid rgba(30,215,96,0.4)', background: playingPreview ? 'rgba(30,215,96,0.2)' : 'rgba(30,215,96,0.1)', color: '#1ed760', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>
                    {playingPreview ? '⏸ Pause Preview' : '▶ Play Preview'}
                  </button>
                )}
                {messageTitle && <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#e8b4f8', marginTop: '16px' }}>&ldquo;{messageTitle}&rdquo;</p>}
                {message && <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '12px', fontStyle: 'italic', lineHeight: 1.6 }}>{message}</p>}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', marginTop: '16px' }}>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>— {isAnonymous ? 'Anonymous' : senderName || 'Someone who cares'}</p>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>For {recipientName}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
    </main>
  );
}
