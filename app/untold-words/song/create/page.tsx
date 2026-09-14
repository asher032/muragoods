'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { ClipboardList, LoaderCircle, Music, Pause, Play } from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  previewUrl: string;
  deezerUrl: string;
  duration: number;
}

export default function CreateSongMessage() {
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [senderName, setSenderName] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [message, setMessage] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);
  useEffect(() => { return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } }; }, []);

  const searchSongs = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch('/api/deezer/search?q=' + encodeURIComponent(query));
      const data = await res.json();
      setSearchResults(data.success ? (data.tracks || []) : []);
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

  // Track which preview is playing (by track id) so tapping play on another
  // result switches immediately instead of needing two taps.
  const togglePreview = (track: Track) => {
    if (!track.previewUrl) return;
    const isThisPlaying = playingId === track.id;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (isThisPlaying) { setPlayingId(null); return; }
    const audio = new Audio(track.previewUrl);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audioRef.current = audio;
    audio.play().catch(() => setPlayingId(null));
    setPlayingId(track.id);
  };

  const link = created ? (typeof window !== 'undefined' ? window.location.origin : '') + '/untold-words/song/' + created : '';

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
          spotifyUrl: selectedTrack.deezerUrl,
          artwork: selectedTrack.artwork,
          previewUrl: selectedTrack.previewUrl,
          message,
        }),
      });
      const result = await res.json();
      if (result.success) setCreated(result.data.shortId);
    } catch { /* empty */ }
    setCreating(false);
  };

  if (created) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Song Sent" />
        <div style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px', animation: 'float 3s ease-in-out infinite' }}><Music color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#ffd60a', marginBottom: '8px' }}>Your song message is live!</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>Send it to {recipientName} using the link below.</p>
            <div style={{ background: 'rgba(123,47,247,0.06)', border: '1px solid rgba(123,47,247,0.2)', borderRadius: '16px', padding: '24px', marginBottom: '16px', textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', wordBreak: 'break-all', fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{link}</div>
              <button onClick={() => navigator.clipboard.writeText(link)} style={{ padding: '10px 24px', borderRadius: '10px', border: '1px solid rgba(123,47,247,0.4)', background: 'rgba(123,47,247,0.12)', color: '#e8b4f8', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}><ClipboardList className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Copy Link</button>
            </div>
            <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← Back to Untold Words</Link>
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
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}><Music color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#e8b4f8', marginBottom: '8px' }}>Say it through a song.</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>Search for any song, listen to the preview, and send it with your message.</p>
        </div>

        <div style={{ display: 'grid', gap: '16px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.2s' }}>
          {/* Recipient */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Input recipient *</label>
            <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Input recipient" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '15px', fontFamily: 'inherit', padding: '8px 0' }} />
          </div>

          {/* Song Search */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#1ed760', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}><Music color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Search and select your song *</label>

            {selectedTrack ? (
              <div style={{ background: 'rgba(30,215,96,0.06)', border: '1px solid rgba(30,215,96,0.25)', borderRadius: '14px', padding: '16px', display: 'flex', gap: '14px', alignItems: 'center' }}>
                {selectedTrack.artwork && <img src={selectedTrack.artwork} alt="" style={{ width: '72px', height: '72px', borderRadius: '10px', objectFit: 'cover' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#1ed760', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTrack.title}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTrack.artist}</p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {selectedTrack.previewUrl && (
                      <button onClick={() => togglePreview(selectedTrack)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(30,215,96,0.3)', background: playingId === selectedTrack.id ? 'rgba(30,215,96,0.2)' : 'rgba(30,215,96,0.08)', color: '#1ed760', fontSize: '9px', fontFamily: 'var(--font-arcade)', cursor: 'pointer' }}>
                        {playingId === selectedTrack.id ? <Pause size={11} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> : <Play size={11} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />} {playingId === selectedTrack.id ? 'Pause' : 'Preview'}
                      </button>
                    )}
                    <button onClick={() => setSelectedTrack(null)} style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: '9px', fontFamily: 'var(--font-arcade)', cursor: 'pointer' }}>Change</button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ position: 'relative' }}>
                  <input value={searchQuery} onChange={e => handleSearchChange(e.target.value)} placeholder="Search and select your song" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(30,215,96,0.2)', borderRadius: '12px', padding: '14px 16px', color: '#fff', fontSize: '14px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  {searching && <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)' }}><LoaderCircle color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>}
                </div>
                {searchResults.length > 0 && (
                  <div style={{ marginTop: '12px', maxHeight: '360px', overflowY: 'auto', display: 'grid', gap: '6px' }}>
                    {searchResults.map(track => (
                      <div key={track.id} onClick={() => selectTrack(track)} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(30,215,96,0.3)'; e.currentTarget.style.background = 'rgba(30,215,96,0.04)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}>
                        {track.artwork && <img src={track.artwork} alt="" style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '12px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</p>
                          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artist} · {track.album}</p>
                        </div>
                        {track.previewUrl && (
                          <button onClick={e => { e.stopPropagation(); togglePreview(track); }} aria-label={playingId === track.id ? 'Pause preview' : 'Play preview'} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(30,215,96,0.3)', background: playingId === track.id ? 'rgba(30,215,96,0.2)' : 'rgba(30,215,96,0.08)', color: '#1ed760', fontSize: '10px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{playingId === track.id ? <Pause size={11} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> : <Play size={11} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />}</button>
                        )}
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>Select →</span>
                      </div>
                    ))}
                  </div>
                )}
                {searchQuery && !searching && searchResults.length === 0 && (
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '8px', textAlign: 'center' }}>No results. Try a different search.</p>
                )}
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', marginTop: '10px', textAlign: 'center' }}>Powered by Deezer · Free · 30-second previews</p>
              </div>
            )}
          </div>

          {/* Message */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Message *</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Input message" rows={5} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px', color: '#fff', fontSize: '14px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.7, boxSizing: 'border-box' }} />
          </div>

          {/* Submit */}
          <button onClick={handleCreate} disabled={creating || !recipientName || !selectedTrack || !message} style={{ padding: '16px', borderRadius: '14px', border: '1px solid rgba(123,47,247,0.4)', background: creating ? 'rgba(123,47,247,0.05)' : 'rgba(123,47,247,0.15)', color: '#e8b4f8', fontFamily: 'var(--font-arcade)', fontSize: '12px', cursor: creating || !recipientName || !selectedTrack || !message ? 'not-allowed' : 'pointer', opacity: !recipientName || !selectedTrack || !message ? 0.4 : 1, transition: 'all 0.2s' }}>
            {creating ? 'CREATING...' : 'Submit'}
          </button>
        </div>
      </div>
      <style jsx>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
    </main>
  );
}
