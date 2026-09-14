'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// Watch Party hook — single owner of all party state for the watch page.
// Live updates (playback state, chat, typing, presence) arrive over the
// party-events SSE stream (~1s latency instead of the old 4s polling).
// The host pushes playback state (debounced); guests follow the host's
// title/episode via navigation and same-title provider changes via the
// returned followSource flag (the page applies its own source list).

export type PartyPlaybackState = {
  type: 'movie' | 'tv';
  id: number;
  season: number;
  episode: number;
  source: string;
  // Host-side wall-clock (ms) at which the host (re)started this title.
  // Guests use it to compute a shared playback offset so everyone lines up
  // on the same timeline instead of merely watching the same title.
  startAt?: number;
};

export type PartyMember = { name: string; email: string; lastSeen?: string };
export type PartyChatMessage = { email: string; name: string; text: string; at: string };

type Party = { code: string; isHost: boolean; hostEmail?: string };

const PRESENCE_WINDOW_MS = 60_000; // members idle longer than this drop off the roster
const TYPING_WINDOW_MS = 5000; // typing flags older than this are stale
const HEARTBEAT_MS = 25_000; // presence is also decayed server-side on reads
const READ_KEY_PREFIX = 'ms-party-read-';

type StreamFrame = {
  ended?: boolean;
  state?: PartyPlaybackState | null;
  hostEmail?: string;
  members?: PartyMember[];
  messages?: PartyChatMessage[];
  typing?: Array<{ name: string }>;
};

export function useWatchParty(opts: {
  type: 'movie' | 'tv';
  id: number;
  season: number;
  episode: number;
  activeSourceId: string;
  urlPartyCode: string | null; // ?party=CODE invite links
}) {
  const router = useRouter();
  const { type, id, season, episode, activeSourceId, urlPartyCode } = opts;

  const [party, setParty] = useState<Party | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [messages, setMessages] = useState<PartyChatMessage[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  const [panelOpen, setPanelOpenState] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [followSource, setFollowSource] = useState<string | null>(null); // guest: provider switch commanded
  // Guest: host's last startAt we're materially behind on (banner + re-sync).
  const [syncAt, setSyncAt] = useState<number | null>(null);
  // Last host startAt already surfaced (auto-followed or manually synced) —
  // lives in a ref so the SSE handler and markSynced agree across re-renders.
  const handledStartAtRef = useRef(0);
  const partyRef = useRef<Party | null>(null);
  partyRef.current = party;

  // Viewer identity (for party membership)
  const meRef = useRef<{ email: string; name: string }>({ email: '', name: 'Guest' });
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        meRef.current = { email: u.email || '', name: u.name || u.email?.split('@')[0] || 'Guest' };
      }
    } catch { /* empty */ }
  }, []);

  // ?party=CODE invite: claim the code immediately (so the sync loop starts
  // and can navigate us to the host's title even with no ?id= in the URL)
  // and register membership so chat/typing work.
  useEffect(() => {
    if (!urlPartyCode) return;
    const code = urlPartyCode.toUpperCase();
    setParty({ code, isHost: false });
    void fetch(`/api/murastream/party?code=${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', email: meRef.current.email, name: meRef.current.name }),
    }).then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'Party not found — check the code');
        setParty(null);
      }
    }).catch(() => { /* transient: the heartbeat retry covers it */ });
  }, [urlPartyCode]);

  // Restore an in-progress party (refresh survival) when there's no invite code.
  useEffect(() => {
    if (urlPartyCode) return;
    try {
      const saved = localStorage.getItem('ms-party');
      if (saved) setParty(JSON.parse(saved));
    } catch { /* empty */ }
  }, [urlPartyCode]);

  useEffect(() => {
    try {
      if (party) localStorage.setItem('ms-party', JSON.stringify(party));
      else localStorage.removeItem('ms-party');
    } catch { /* empty */ }
  }, [party]);

  // HOST: push playback state whenever it changes (debounced 800ms). The
  // state carries startAt = now, stamped once per title/episode so guests can
  // align to the same timeline position (playing state is always true — the
  // host opens the player to watch).
  useEffect(() => {
    if (!party?.isHost || !id) return;
    const t = setTimeout(() => {
      fetch(`/api/murastream/party?code=${party.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: { type, id, season, episode, source: activeSourceId, startAt: Date.now() },
          email: meRef.current.email,
        }),
      }).catch(() => { /* best effort */ });
    }, 800);
    return () => clearTimeout(t);
  }, [party?.isHost, party?.code, id, type, season, episode, activeSourceId]);

  const create = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/murastream/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: meRef.current.email, name: meRef.current.name,
          state: id ? { type, id, season, episode, source: activeSourceId } : null,
        }),
      });
      const data = await res.json();
      if (data.success) setParty({ code: data.data.code, isHost: true, hostEmail: meRef.current.email });
      else setError(data.error || 'Could not start the party');
    } catch {
      setError('Could not start the party');
    } finally { setBusy(false); }
  }, [id, type, season, episode, activeSourceId]);

  const join = useCallback(async (raw: string) => {
    // Accept either a bare 6-char code or a pasted invite link (?party=CODE).
    const fromLink = raw.match(/party=([A-Za-z0-9]{4,8})/);
    const c = (fromLink ? fromLink[1] : raw).trim().toUpperCase();
    if (c.length < 4) { setError('Enter the 6-character party code (or paste the invite link)'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/murastream/party?code=${c}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', email: meRef.current.email, name: meRef.current.name }),
      });
      const data = await res.json();
      if (data.success) setParty({ code: c, isHost: false });
      else setError(data.error || 'Party not found');
    } catch {
      setError('Could not join the party');
    } finally { setBusy(false); }
  }, []);

  // Live sync: one SSE connection per party delivers snapshots within ~1s of
  // any change (state push, chat, typing, join/leave). Heartbeats keep the
  // member's roster entry fresh. Re-runs on navigation so the guest applies
  // the host's new title/episode with current values, not stale closures.
  useEffect(() => {
    if (!party?.code) return;
    const code = party.code;
    let stopped = false;
    let lastApplied = '';
    // Set once a real snapshot arrives, so a dead party reads differently
    // from a code that never existed.
    const sawSnapshot = { current: false };
    // Don't auto-navigate more than once per second (title-signature dedupe).
    let lastNavSig = '';
    // The last host startAt we've already surfaced (via auto-follow or the
    // manual Sync up banner) — a repeated frame for the SAME start must not
    // re-raise the banner; only a genuinely newer restart may.
    const offerSync = (startAt: number) => {
      if (startAt && startAt !== handledStartAtRef.current) {
        handledStartAtRef.current = startAt;
        setSyncAt(startAt);
      }
    };

    const applyFrame = (d: StreamFrame) => {
      if (stopped) return;
      if (d.ended) {
        setParty(null); setMembers([]); setMessages([]); setTyping([]); setUnreadCount(0);
        // Distinguish a dead party from a code that never existed.
        setError(sawSnapshot.current ? 'The party has ended.' : 'Party not found — check the code');
        return;
      }
      sawSnapshot.current = true;
      setMembers(d.members || []);
      if (Array.isArray(d.messages)) {
        const incoming = d.messages;
        setMessages(incoming);
        // Unread counting: messages from others newer than our last-read mark.
        try {
          const readAt = Number(localStorage.getItem(READ_KEY_PREFIX + code) || 0);
          setUnreadCount(incoming.filter(m =>
            m.email !== meRef.current.email && new Date(m.at).getTime() > readAt).length);
        } catch { /* storage unavailable */ }
      }
      // Typing indicators: members whose typing flag is fresh (server filters).
      setTyping((d.typing || []).map(t => t.name));
      if (d.hostEmail && partyRef.current && !partyRef.current.hostEmail) {
        setParty(p => (p ? { ...p, hostEmail: d.hostEmail } : p));
      }
      // Guest: follow the host's title/episode (navigation) or provider, and
      // keep a wall-clock "sync point" so the page can line up playback.
      if (!partyRef.current?.isHost && d.state) {
        const s = d.state;
        const sig = `${s.type}|${s.id}|${s.season}|${s.episode}`;
        const fullSig = `${sig}|${s.source}`;
        if (fullSig !== lastApplied) {
          lastApplied = fullSig;
          if (sig !== lastNavSig) {
            lastNavSig = sig;
            const startAt = typeof s.startAt === 'number' ? s.startAt : Date.now();
            const offsetMs = Math.max(0, Date.now() - startAt);
            const fresh = offsetMs < 120_000; // < 2 min behind → follow automatically
            if (fresh) {
              handledStartAtRef.current = startAt; // auto-follow counts as handled
              setSyncAt(null);
            }
            const tParam = fresh ? `&t=${Math.round(offsetMs / 1000)}` : '';
            if (s.type !== type || Number(s.id) !== id || Number(s.season) !== season || Number(s.episode) !== episode) {
              router.push(`/murastream/watch?type=${s.type}&id=${s.id}&season=${s.season || 1}&episode=${s.episode || 1}&party=${code}${tParam}`);
            }
            if (!fresh) offerSync(startAt); // stale join → offer a manual re-sync
          } else if (s.source && s.source !== activeSourceId) {
            setFollowSource(s.source); // page resolves this against its source list
          } else {
            // Same title: only a moved startAt (host restart) re-raises the banner.
            const startAt = typeof s.startAt === 'number' ? s.startAt : 0;
            if (startAt && Date.now() - startAt > 8_000) offerSync(startAt);
          }
        } else {
          // Repeated frames: re-arm only if the host restarted since we last synced.
          const startAt = typeof s.startAt === 'number' ? s.startAt : 0;
          if (startAt && startAt !== handledStartAtRef.current && Date.now() - startAt > 8_000) offerSync(startAt);
        }
      }
    };

    const es = new EventSource(`/api/murastream/party-events?code=${code}`);
    es.onmessage = (e) => {
      try { applyFrame(JSON.parse(e.data) as StreamFrame); } catch { /* malformed frame */ }
    };
    es.onerror = () => { /* browser auto-reconnects */ };

    const heartbeat = () => {
      void fetch(`/api/murastream/party?code=${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat', email: meRef.current.email, name: meRef.current.name }),
      }).catch(() => { /* empty */ });
    };
    heartbeat();
    const hb = setInterval(heartbeat, HEARTBEAT_MS);

    return () => { stopped = true; es.close(); clearInterval(hb); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?.code, party?.isHost, id, type, season, episode, activeSourceId]);

  // Chat: optimistic send; the SSE stream reconciles the canonical list.
  const sendMessage = useCallback(async (text: string) => {
    const p = partyRef.current;
    const trimmed = text.trim().slice(0, 300);
    if (!p || !trimmed) return;
    const optimistic: PartyChatMessage = {
      email: meRef.current.email, name: meRef.current.name, text: trimmed, at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    markRead(p.code);
    try {
      const res = await fetch(`/api/murastream/party?code=${p.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', email: meRef.current.email, name: meRef.current.name, text: trimmed }),
      });
      if (!res.ok) {
        // Drop the optimistic bubble if the server rejected it (left party, etc.)
        setMessages(prev => prev.filter(m => m !== optimistic));
      }
    } catch {
      setMessages(prev => prev.filter(m => m !== optimistic));
    }
  }, []);

  // Typing signal — fire-and-forget, throttled to ~2s bursts.
  const lastTypingSent = useRef(0);
  const notifyTyping = useCallback(() => {
    const p = partyRef.current;
    if (!p) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    void fetch(`/api/murastream/party?code=${p.code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'typing', email: meRef.current.email, name: meRef.current.name }),
    }).catch(() => { /* best effort */ });
  }, []);

  // Panel open/close with unread reset. Opening the panel marks everything read.
  const setPanelOpen = useCallback((open: boolean) => {
    setPanelOpenState(open);
    const p = partyRef.current;
    if (open && p) {
      markRead(p.code);
      setUnreadCount(0);
    }
  }, []);

  function markRead(code: string) {
    try { localStorage.setItem(READ_KEY_PREFIX + code, String(Date.now())); } catch { /* empty */ }
  }

  // Leave: also clear chat state
  const leave = useCallback(async () => {
    const p = partyRef.current;
    if (!p) return;
    setParty(null); setMembers([]); setMessages([]); setTyping([]); setUnreadCount(0); setPanelOpenState(false); setError('');
    try {
      if (p.isHost) {
        await fetch(`/api/murastream/party?code=${p.code}&email=${encodeURIComponent(meRef.current.email)}`, { method: 'DELETE' });
      }
    } catch { /* empty */ }
  }, []);

  const inviteLink = party
    ? `${typeof location !== 'undefined' ? location.origin : ''}/murastream/watch?type=${type}&id=${id}&season=${season}&episode=${episode}&party=${party.code}`
    : '';

  // Guest clicked "Sync up now": mark this host start as handled so the
  // banner stays down until the host restarts again.
  const markSynced = useCallback((startAt: number) => {
    handledStartAtRef.current = startAt;
    setSyncAt(null);
  }, []);

  return {
    party, members, messages, typing, error, busy, inviteLink, followSource, syncAt, markSynced,
    panelOpen, setPanelOpen, unreadCount,
    create, join, leave, sendMessage, notifyTyping, clearError: () => setError(''),
  };
}
