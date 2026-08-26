'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ───────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  intent?: string;
  action?: string;
  actionParams?: Record<string, string>;
  cards?: Array<{ title: string; description: string; action?: string; actionParams?: Record<string, string> }>;
  buttons?: Array<{ label: string; action: string; actionParams?: Record<string, string> }>;
  timestamp: Date;
}

interface Memory { _id: string; key: string; value: string; category: string; updatedAt: string; }

type Panel = 'chat' | 'memory' | 'history' | 'privacy' | 'operator' | 'code' | 'manage';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

// ─── Component ───────────────────────────────────────────────
export function JARVIS({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [panel, setPanel] = useState<Panel>('chat');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [currentTime, setCurrentTime] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [commandHistory, setCommandHistory] = useState<Array<{ command: string; result: string; timestamp: string }>>([]);
  const [systemStatus, setSystemStatus] = useState<Record<string, unknown> | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Code editing state
  const [codeFiles, setCodeFiles] = useState<Array<{ name: string; path: string; isDirectory: boolean; size: number }>>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Management state
  const [siteStats, setSiteStats] = useState<Record<string, unknown> | null>(null);
  const [userList, setUserList] = useState<Array<{ name: string; email: string; coins: number; userId: string }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    try { const u = localStorage.getItem('user'); return u ? JSON.parse(u).userId : undefined; } catch { return undefined; }
  }, []);

  const userEmail = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    try { const u = localStorage.getItem('user'); return u ? JSON.parse(u).email : undefined; } catch { return undefined; }
  }, []);

  // ─── Admin check ────────────────────────────────────────
  useEffect(() => {
    if (userEmail) setIsAdmin(ADMIN_EMAILS.includes(userEmail));
  }, [userEmail]);

  // ─── Clock ──────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  // ─── Mouse tracking ─────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!coreRef.current) return;
      const r = coreRef.current.getBoundingClientRect();
      setMousePos({ x: (e.clientX - (r.left + r.width / 2)) / r.width, y: (e.clientY - (r.top + r.height / 2)) / r.height });
    };
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, []);

  // ─── Welcome message ────────────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0) {
      const h = new Date().getHours();
      const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      const roleText = isAdmin ? 'Hey! I\'m online. What do you need?' : 'Hey! I\'m here. What can I help with?';
      setMessages([{
        id: 'w', role: 'jarvis',
        text: `${g}, ${roleText}`,
        intent: 'INFORMATION', timestamp: new Date(),
      }]);
    }
  }, [open, messages.length, isAdmin]);

  // ─── Auto-scroll ────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 400); }, [open]);

  // ─── Continuous conversation mode ────────────────────────
  const continuousModeRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeakingRef = useCallback(() => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  // ─── Start listening ─────────────────────────────────────
  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch { /* already started */ }
  }, []);

  // ─── Speech Recognition (continuous conversation) ────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const transcript = ev.results[0][0].transcript;
      setListening(false);
      // If JARVIS is speaking, interrupt it
      if (speaking) stopSpeakingRef();
      handleSend(transcript);
    };
    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      setListening(false);
      if (continuousModeRef.current && ev.error !== 'not-allowed' && ev.error !== 'aborted') {
        setTimeout(() => {
          if (continuousModeRef.current) startListening();
        }, 500);
      }
    };
    rec.onend = () => {
      setListening(false);
      if (continuousModeRef.current) {
        setTimeout(() => {
          if (continuousModeRef.current && !processing) startListening();
        }, 300);
      }
    };
    recognitionRef.current = rec;
  }, [speaking, processing, stopSpeakingRef, startListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── ElevenLabs TTS ─────────────────────────────────────
  const onSpeechEnd = useCallback(() => {
    setSpeaking(false);
    setCurrentAudio(null);
    // In continuous mode, restart listening after JARVIS finishes speaking
    if (continuousModeRef.current) {
      setTimeout(() => {
        if (continuousModeRef.current) startListening();
      }, 400);
    }
  }, [startListening]);

  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled) return;
    try {
      const clean = text.replace(/[*#\n]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean) return;

      // Try ElevenLabs first
      const res = await fetch('/api/jarvis/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
      });
      const data = await res.json();

      if (data.success && data.audio) {
        setSpeaking(true);
        const audio = new Audio(`data:audio/mpeg;base64,${data.audio}`);
        setCurrentAudio(audio);
        currentAudioRef.current = audio;
        audio.onended = onSpeechEnd;
        audio.onerror = onSpeechEnd;
        await audio.play().catch(onSpeechEnd);
        return;
      }

      // Fallback to browser TTS
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        u.rate = 1.05;
        u.pitch = 0.9;
        u.onstart = () => setSpeaking(true);
        u.onend = onSpeechEnd;
        window.speechSynthesis.speak(u);
      }
    } catch {
      setSpeaking(false);
    }
  }, [voiceEnabled, onSpeechEnd]);

  const stopSpeaking = stopSpeakingRef;

  // ─── Screen context ─────────────────────────────────────
  const getScreenContext = useCallback(() => {
    try {
      return `Page: ${document.title} (${window.location.pathname})\nContent: ${document.body?.innerText?.substring(0, 800) || ''}`;
    } catch { return undefined; }
  }, []);

  // ─── Process message ────────────────────────────────────
  const processMessage = useCallback(async (text: string) => {
    setProcessing(true);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text, timestamp: new Date() }]);
    setCommandHistory(prev => [{ command: text, result: '', timestamp: new Date().toISOString() }, ...prev].slice(0, 50));

    try {
      const screenContext = getScreenContext();
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, userId, email: userEmail, screenContext }),
      });
      const result = await res.json();

      if (result.success) {
        const msg: Message = {
          id: (Date.now() + 1).toString(), role: 'jarvis',
          text: result.data.response, intent: result.data.intent,
          action: result.data.action, actionParams: result.data.actionParams,
          cards: result.data.cards, buttons: result.data.buttons,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, msg]);

        // Use ElevenLabs TTS from response or generate
        if (result.data.tts) {
          setSpeaking(true);
          const audio = new Audio(`data:audio/mpeg;base64,${result.data.tts}`);
          setCurrentAudio(audio);
          currentAudioRef.current = audio;
          audio.onended = onSpeechEnd;
          audio.onerror = onSpeechEnd;
          audio.play().catch(onSpeechEnd);
        } else {
          speak(result.data.response);
        }

        setCommandHistory(prev => {
          const u = [...prev];
          if (u.length > 0) u[0] = { ...u[0], result: result.data.response.substring(0, 200) };
          return u;
        });

        // Execute actions — instant, no delay
        const a = result.data.action;
        const p = result.data.actionParams;
        if (a === 'navigate' && p?.path && p.path !== '#') {
          continuousModeRef.current = false;
          setTimeout(() => { router.push(p.path); onClose(); }, 800);
        } else if (a === 'logout') {
          continuousModeRef.current = false;
          setTimeout(() => { localStorage.removeItem('user'); router.push('/login'); onClose(); }, 800);
        } else if (a === 'search' && p?.query) {
          continuousModeRef.current = false;
          setTimeout(() => { router.push(`/untold-words?q=${encodeURIComponent(p.query)}`); onClose(); }, 800);
        } else if (a === 'health-check') {
          try {
            const sr = await fetch('/api/jarvis/status');
            const sd = await sr.json();
            if (sd.success) setSystemStatus(sd.data);
          } catch { /* empty */ }
        } else if (a === 'camera') {
          setPanel('operator');
        }
      }
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'jarvis', text: 'Connection lost. Please try again.', timestamp: new Date() }]);
    }
    setProcessing(false);
  }, [userId, userEmail, getScreenContext, router, onClose, speak]);

  const handleSend = useCallback((text?: string) => {
    const msg = (text || input).trim();
    if (!msg || processing) return;
    setInput('');
    processMessage(msg);
  }, [input, processing, processMessage]);

  // ─── Voice toggle (tap to start conversation, tap to stop) ──
  const toggleVoice = useCallback(async () => {
    if (!recognitionRef.current) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: 'Voice is not supported in this browser. Use Chrome or Edge.', timestamp: new Date() }]);
      return;
    }
    // If already listening, stop continuous mode
    if (listening) {
      continuousModeRef.current = false;
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    // Request mic permission
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: 'Microphone access denied. Please allow mic access in browser settings.', timestamp: new Date() }]);
      return;
    }
    // Stop any ongoing speech and start continuous conversation
    stopSpeaking();
    continuousModeRef.current = true;
    startListening();
  }, [listening, stopSpeaking, startListening]);

  // ─── Camera ─────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { /* denied */ }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); setCameraStream(null); }
  }, [cameraStream]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      setUploadedImage(canvas.toDataURL('image/jpeg'));
      stopCamera();
      processMessage('Analyze this image');
    }
  }, [stopCamera, processMessage]);

  // ─── Code editing ───────────────────────────────────────
  const loadCodeFiles = useCallback(async (path?: string) => {
    try {
      const res = await fetch(`/api/jarvis/code?action=list&email=${userEmail}${path ? `&path=${path}` : ''}`);
      const data = await res.json();
      if (data.success) setCodeFiles(data.data);
    } catch { /* empty */ }
  }, [userEmail]);

  const loadFileContent = useCallback(async (filePath: string) => {
    try {
      const res = await fetch(`/api/jarvis/code?action=read&email=${userEmail}&path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.success) { setFileContent(data.data.content); setSelectedFile(filePath); }
    } catch { /* empty */ }
  }, [userEmail]);

  const applyCodeEdit = useCallback(async () => {
    if (!selectedFile || !editInstruction) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/jarvis/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, filePath: selectedFile, instruction: editInstruction }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: `Code updated: ${data.data.explanation}. ${data.data.linesChanged} lines written.`, timestamp: new Date() }]);
        setEditInstruction('');
        loadFileContent(selectedFile);
      } else {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: `Edit failed: ${data.error}`, timestamp: new Date() }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: 'Could not connect to code editing API.', timestamp: new Date() }]);
    }
    setEditLoading(false);
  }, [selectedFile, editInstruction, userEmail, loadFileContent]);

  // ─── Management ─────────────────────────────────────────
  const loadSiteStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/jarvis/manage?action=site-stats&email=${userEmail}`);
      const data = await res.json();
      if (data.success) setSiteStats(data.data);
    } catch { /* empty */ }
  }, [userEmail]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/jarvis/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, action: 'list-users' }),
      });
      const data = await res.json();
      if (data.success) setUserList(data.data.users);
    } catch { /* empty */ }
  }, [userEmail]);

  // ─── Memory delete ──────────────────────────────────────
  const deleteMemory = useCallback(async (id: string) => {
    if (!userId) return;
    await fetch(`/api/jarvis/memory?userId=${userId}&id=${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m._id !== id));
  }, [userId]);

  // ─── Action handler ─────────────────────────────────────
  const handleAction = useCallback((action: string, params?: Record<string, string>) => {
    if (action === 'navigate' && params?.path) { router.push(params.path); onClose(); }
    else if (action === 'camera') { setPanel('operator'); }
    else if (action === 'upload-image') { fileInputRef.current?.click(); }
    else if (action === 'health-check') { processMessage('Run health check'); }
  }, [router, onClose, processMessage]);

  // ─── Render markdown-lite ───────────────────────────────
  const renderText = useCallback((text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('```')) return null;
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} style={{ margin: '4px 0', lineHeight: 1.6, fontSize: '13px' }}>
          {parts.map((p, j) => {
            if (p.startsWith('**') && p.endsWith('**')) {
              return <strong key={j} style={{ color: '#00e5ff' }}>{p.slice(2, -2)}</strong>;
            }
            return <span key={j}>{p}</span>;
          })}
        </p>
      );
    });
  }, []);

  // ─── Initialize code panel ──────────────────────────────
  useEffect(() => {
    if (open && panel === 'code' && isAdmin) loadCodeFiles();
    if (open && panel === 'manage' && isAdmin) { loadSiteStats(); loadUsers(); }
    if (open && panel === 'memory' && userId) {
      fetch(`/api/jarvis/memory?userId=${userId}`).then(r => r.json()).then(d => { if (d.success) setMemories(d.data); }).catch(() => {});
    }
  }, [open, panel, isAdmin, userId, loadCodeFiles, loadSiteStats, loadUsers]);

  if (!open) return null;

  const orbState = listening ? 'listening' : speaking ? 'speaking' : processing ? 'processing' : '';
  const orbColor = listening ? '#ff4444' : speaking ? '#00ff88' : processing ? '#ffaa00' : '#00e5ff';

  return (
    <>
      <style jsx global>{`
        @keyframes jarvis-scan { from { transform: translateY(-100%); } to { transform: translateY(100%); } }
        @keyframes jarvis-pulse { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.08); opacity: 1; } }
        @keyframes jarvis-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes jarvis-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes jarvis-glow { 0%, 100% { box-shadow: 0 0 20px rgba(0,229,255,0.2); } 50% { box-shadow: 0 0 40px rgba(0,229,255,0.4); } }
        @keyframes jarvis-wave { 0%, 100% { height: 4px; } 50% { height: 20px; } }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'radial-gradient(ellipse at center, rgba(0,10,30,0.97) 0%, rgba(0,0,0,0.99) 100%)',
        display: 'flex', flexDirection: 'column',
        animation: 'jarvis-fade-in 0.4s ease-out',
        fontFamily: "'Courier New', monospace",
      }}>
        {/* ─── Top Bar ─────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid rgba(0,229,255,0.15)',
          background: 'rgba(0,10,20,0.8)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
            <span style={{ color: '#00e5ff', fontSize: 14, letterSpacing: '0.2em', fontWeight: 600 }}>
              J.A.R.V.I.S
            </span>
            <span style={{ color: 'rgba(0,229,255,0.4)', fontSize: 10, letterSpacing: '0.1em' }}>v4.0</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: 'rgba(0,229,255,0.5)', fontSize: 11 }}>{currentTime}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['chat', 'memory', 'history', 'privacy', 'code', 'manage'] as Panel[]).map(p => (
                <button key={p} onClick={() => setPanel(p)} style={{
                  padding: '4px 10px', borderRadius: 4, border: `1px solid ${panel === p ? '#00e5ff' : 'rgba(0,229,255,0.15)'}`,
                  background: panel === p ? 'rgba(0,229,255,0.15)' : 'transparent',
                  color: panel === p ? '#00e5ff' : 'rgba(0,229,255,0.4)', fontSize: 10, cursor: 'pointer',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  {p === 'chat' ? '💬' : p === 'memory' ? '🧠' : p === 'history' ? '📜' : p === 'privacy' ? '🔒' : p === 'code' ? '💻' : '⚙️'}
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,68,68,0.3)',
              background: 'rgba(255,68,68,0.1)', color: '#ff4444', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}>×</button>
          </div>
        </div>

        {/* ─── Main Content ────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* ─── Left: AI Core + Voice ──────────────────── */}
          <div style={{
            width: 200, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', borderRight: '1px solid rgba(0,229,255,0.1)',
            background: 'rgba(0,5,15,0.5)', padding: 20,
          }}>
            {/* Orb */}
            <div ref={coreRef} onClick={toggleVoice} style={{
              width: 120, height: 120, borderRadius: '50%', cursor: 'pointer',
              position: 'relative', marginBottom: 20,
            }}>
              {/* Outer ring */}
              <div style={{
                position: 'absolute', inset: -8, borderRadius: '50%',
                border: `2px solid ${orbColor}33`,
                animation: 'jarvis-orbit 8s linear infinite',
              }} />
              {/* Orbit ring */}
              <div style={{
                position: 'absolute', inset: -16, borderRadius: '50%',
                border: `1px dashed ${orbColor}22`,
                animation: 'jarvis-orbit 15s linear infinite reverse',
              }} />
              {/* Core */}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: `radial-gradient(circle at ${50 + mousePos.x * 20}% ${50 + mousePos.y * 20}%, ${orbColor}, ${orbColor}88, #001a33)`,
                boxShadow: `0 0 30px ${orbColor}66, 0 0 60px ${orbColor}22, inset 0 0 20px rgba(255,255,255,0.1)`,
                animation: orbState ? 'jarvis-pulse 1s ease-in-out infinite' : 'jarvis-pulse 3s ease-in-out infinite',
                transition: 'background 0.3s, box-shadow 0.3s',
              }} />
              {/* Center dot */}
              <div style={{
                position: 'absolute', inset: '40%', borderRadius: '50%',
                background: `radial-gradient(circle, white, ${orbColor})`,
                opacity: orbState ? 1 : 0.6,
              }} />
              {/* Particles */}
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{
                  position: 'absolute',
                  top: `${15 + Math.sin(i * 1.5) * 35}%`,
                  left: `${15 + Math.cos(i * 1.5) * 35}%`,
                  width: 3, height: 3, borderRadius: '50%',
                  background: orbColor,
                  opacity: 0.4 + (i * 0.15),
                  animation: `jarvis-pulse ${2 + i * 0.5}s ease-in-out infinite ${i * 0.3}s`,
                }} />
              ))}
            </div>

            {/* Status */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ color: orbColor, fontSize: 11, letterSpacing: '0.15em', marginBottom: 4 }}>
                {listening ? '🔴 LISTENING' : speaking ? '🟢 SPEAKING' : processing ? '🟡 THINKING' : '🔵 STANDBY'}
              </div>
              <div style={{ color: 'rgba(0,229,255,0.3)', fontSize: 9, letterSpacing: '0.1em' }}>
                {isAdmin ? 'ADMIN ACCESS' : 'USER MODE'}
              </div>
            </div>

            {/* Voice button */}
            <button onClick={toggleVoice} style={{
              width: 48, height: 48, borderRadius: '50%',
              border: `2px solid ${listening ? '#ff4444' : '#00e5ff'}`,
              background: listening ? 'rgba(255,68,68,0.2)' : 'rgba(0,229,255,0.1)',
              color: listening ? '#ff4444' : '#00e5ff',
              cursor: 'pointer', fontSize: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: listening ? 'jarvis-pulse 1s ease-in-out infinite' : 'none',
            }}>
              🎤
            </button>
            <span style={{ color: 'rgba(0,229,255,0.3)', fontSize: 9, marginTop: 6 }}>
              {listening ? 'Tap to stop' : 'Tap to speak'}
            </span>

            {/* Quick actions */}
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
              {[
                { label: '🍽️ Menu', cmd: 'Open the menu' },
                { label: '🪙 Points', cmd: 'Check my balance' },
                { label: '✉️ Letters', cmd: 'Open untold words' },
                { label: '🎁 Mystery Box', cmd: 'Open mystery box' },
                { label: '📊 Status', cmd: 'Run health check' },
              ].map(q => (
                <button key={q.label} onClick={() => processMessage(q.cmd)} style={{
                  padding: '6px 10px', borderRadius: 4,
                  border: '1px solid rgba(0,229,255,0.1)', background: 'rgba(0,229,255,0.05)',
                  color: 'rgba(0,229,255,0.6)', fontSize: 10, cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#00e5ff44'; e.currentTarget.style.color = '#00e5ff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,229,255,0.1)'; e.currentTarget.style.color = 'rgba(0,229,255,0.6)'; }}
                >{q.label}</button>
              ))}
            </div>
          </div>

          {/* ─── Right: Panel Content ───────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {panel === 'chat' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  {messages.map(msg => (
                    <div key={msg.id} style={{
                      marginBottom: 12, animation: 'jarvis-fade-in 0.3s ease-out',
                      display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}>
                      <div style={{
                        maxWidth: '80%', padding: '10px 14px', borderRadius: 8,
                        background: msg.role === 'user' ? 'rgba(0,229,255,0.1)' : 'rgba(0,20,40,0.6)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(0,229,255,0.2)' : 'rgba(0,229,255,0.08)'}`,
                      }}>
                        <div style={{ color: msg.role === 'user' ? '#00e5ff' : 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.5 }}>
                          {renderText(msg.text)}
                        </div>
                        {/* Action buttons */}
                        {msg.buttons && msg.buttons.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {msg.buttons.map((b, i) => (
                              <button key={i} onClick={() => handleAction(b.action, b.actionParams)} style={{
                                padding: '4px 10px', borderRadius: 4,
                                border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.1)',
                                color: '#00e5ff', fontSize: 11, cursor: 'pointer',
                              }}>{b.label}</button>
                            ))}
                          </div>
                        )}
                        {/* Cards */}
                        {msg.cards && msg.cards.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {msg.cards.map((c, i) => (
                              <div key={i} onClick={() => c.action && handleAction(c.action, c.actionParams)} style={{
                                padding: '8px 12px', borderRadius: 6, cursor: c.action ? 'pointer' : 'default',
                                border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.05)',
                              }}>
                                <div style={{ color: '#00e5ff', fontSize: 12, fontWeight: 600 }}>{c.title}</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>{c.description}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {processing && (
                    <div style={{ display: 'flex', gap: 4, padding: '8px 14px' }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: '50%', background: '#00e5ff',
                          animation: `jarvis-wave 1s ease-in-out infinite ${i * 0.15}s`,
                        }} />
                      ))}
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div style={{
                  padding: '12px 20px', borderTop: '1px solid rgba(0,229,255,0.1)',
                  display: 'flex', gap: 10, alignItems: 'center',
                  background: 'rgba(0,10,20,0.5)',
                }}>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder={listening ? 'Listening...' : 'Type a command or question...'}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 6,
                      border: `1px solid ${listening ? '#ff4444' : 'rgba(0,229,255,0.2)'}`,
                      background: 'rgba(0,10,20,0.6)', color: 'white', fontSize: 13,
                      outline: 'none', fontFamily: "'Courier New', monospace",
                    }}
                  />
                  {speaking && (
                    <button onClick={stopSpeaking} style={{
                      width: 36, height: 36, borderRadius: '50%', border: '1px solid #ff4444',
                      background: 'rgba(255,68,68,0.1)', color: '#ff4444', cursor: 'pointer', fontSize: 14,
                    }}>⏹</button>
                  )}
                  <button onClick={() => handleSend()} disabled={!input.trim() || processing} style={{
                    width: 36, height: 36, borderRadius: '50%',
                    border: '1px solid #00e5ff', background: 'rgba(0,229,255,0.15)',
                    color: '#00e5ff', cursor: 'pointer', fontSize: 16,
                    opacity: (!input.trim() || processing) ? 0.3 : 1,
                  }}>→</button>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => { setUploadedImage(ev.target?.result as string); processMessage('Analyze this image'); };
                      reader.readAsDataURL(file);
                    }} />
                </div>
              </div>
            )}

            {/* ─── Memory Panel ──────────────────────────── */}
            {panel === 'memory' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                <h3 style={{ color: '#00e5ff', fontSize: 14, marginBottom: 16, letterSpacing: '0.1em' }}>🧠 MEMORY CENTER</h3>
                {memories.length === 0 ? (
                  <p style={{ color: 'rgba(0,229,255,0.3)', fontSize: 12 }}>No memories stored. Tell me something to remember.</p>
                ) : memories.map(m => (
                  <div key={m._id} style={{
                    padding: 10, marginBottom: 8, borderRadius: 6,
                    border: '1px solid rgba(0,229,255,0.1)', background: 'rgba(0,229,255,0.03)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ color: '#00e5ff', fontSize: 12, fontWeight: 600 }}>{m.key}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{m.value}</div>
                    </div>
                    <button onClick={() => deleteMemory(m._id)} style={{
                      padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,68,68,0.2)',
                      background: 'transparent', color: '#ff4444', cursor: 'pointer', fontSize: 10,
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* ─── History Panel ─────────────────────────── */}
            {panel === 'history' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                <h3 style={{ color: '#00e5ff', fontSize: 14, marginBottom: 16, letterSpacing: '0.1em' }}>📜 COMMAND HISTORY</h3>
                {commandHistory.length === 0 ? (
                  <p style={{ color: 'rgba(0,229,255,0.3)', fontSize: 12 }}>No commands yet.</p>
                ) : commandHistory.map((c, i) => (
                  <div key={i} style={{
                    padding: 10, marginBottom: 8, borderRadius: 6,
                    border: '1px solid rgba(0,229,255,0.08)', background: 'rgba(0,229,255,0.02)',
                  }}>
                    <div style={{ color: '#00e5ff', fontSize: 12, fontWeight: 600 }}>{c.command}</div>
                    {c.result && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4 }}>{c.result}</div>}
                    <div style={{ color: 'rgba(0,229,255,0.2)', fontSize: 9, marginTop: 4 }}>
                      {new Date(c.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ─── Privacy Panel ─────────────────────────── */}
            {panel === 'privacy' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                <h3 style={{ color: '#00e5ff', fontSize: 14, marginBottom: 16, letterSpacing: '0.1em' }}>🔒 PRIVACY CENTER</h3>
                {[
                  { label: 'Voice Output', value: voiceEnabled, toggle: () => setVoiceEnabled(!voiceEnabled) },
                  { label: 'Memory', value: true, toggle: () => {} },
                  { label: 'Screen Context', value: true, toggle: () => {} },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: 12, marginBottom: 8, borderRadius: 6,
                    border: '1px solid rgba(0,229,255,0.1)', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{s.label}</span>
                    <button onClick={s.toggle} style={{
                      padding: '4px 12px', borderRadius: 4, border: 'none',
                      background: s.value ? 'rgba(0,255,136,0.2)' : 'rgba(255,68,68,0.2)',
                      color: s.value ? '#00ff88' : '#ff4444', cursor: 'pointer', fontSize: 10,
                    }}>{s.value ? 'ON' : 'OFF'}</button>
                  </div>
                ))}
              </div>
            )}

            {/* ─── Code Panel (Admin only) ──────────────── */}
            {panel === 'code' && isAdmin && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
                  <h3 style={{ color: '#00e5ff', fontSize: 14, letterSpacing: '0.1em', margin: 0 }}>💻 CODE EDITOR</h3>
                </div>
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                  {/* File tree */}
                  <div style={{ width: 220, overflowY: 'auto', borderRight: '1px solid rgba(0,229,255,0.08)', padding: 10 }}>
                    <button onClick={() => loadCodeFiles()} style={{
                      width: '100%', padding: 6, marginBottom: 8, borderRadius: 4,
                      border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.05)',
                      color: '#00e5ff', cursor: 'pointer', fontSize: 10,
                    }}>🔄 Refresh</button>
                    {codeFiles.map(f => (
                      <div key={f.path} onClick={() => !f.isDirectory && loadFileContent(f.path)} style={{
                        padding: '4px 8px', marginBottom: 2, borderRadius: 4, cursor: f.isDirectory ? 'default' : 'pointer',
                        background: selectedFile === f.path ? 'rgba(0,229,255,0.15)' : 'transparent',
                        color: f.isDirectory ? '#ffaa00' : selectedFile === f.path ? '#00e5ff' : 'rgba(255,255,255,0.5)',
                        fontSize: 11, fontFamily: 'monospace',
                      }}>
                        {f.isDirectory ? '📁' : '📄'} {f.name}
                      </div>
                    ))}
                  </div>
                  {/* Editor */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {selectedFile && (
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(0,229,255,0.08)', color: '#00e5ff', fontSize: 11, fontFamily: 'monospace' }}>
                        📄 {selectedFile}
                      </div>
                    )}
                    <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
                      <pre style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0 }}>
                        {fileContent || 'Select a file to view its contents.'}
                      </pre>
                    </div>
                    {selectedFile && (
                      <div style={{ padding: 12, borderTop: '1px solid rgba(0,229,255,0.1)' }}>
                        <input value={editInstruction} onChange={e => setEditInstruction(e.target.value)}
                          placeholder="Describe the change you want..."
                          onKeyDown={e => e.key === 'Enter' && applyCodeEdit()}
                          style={{
                            width: '100%', padding: 8, borderRadius: 4,
                            border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,10,20,0.6)',
                            color: 'white', fontSize: 12, outline: 'none', marginBottom: 8,
                          }} />
                        <button onClick={applyCodeEdit} disabled={editLoading || !editInstruction}
                          style={{
                            padding: '6px 16px', borderRadius: 4, border: '1px solid #00e5ff',
                            background: 'rgba(0,229,255,0.15)', color: '#00e5ff', cursor: 'pointer',
                            fontSize: 11, opacity: editLoading || !editInstruction ? 0.3 : 1,
                          }}>
                          {editLoading ? '⏳ Applying...' : '⚡ Apply Change'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Management Panel (Admin only) ────────── */}
            {panel === 'manage' && isAdmin && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                <h3 style={{ color: '#00e5ff', fontSize: 14, marginBottom: 16, letterSpacing: '0.1em' }}>⚙️ WEBSITE MANAGEMENT</h3>
                {siteStats && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                    {[
                      { label: 'Total Users', value: siteStats.totalUsers, icon: '👥' },
                      { label: 'Total Coins', value: siteStats.totalCoins, icon: '🪙' },
                      { label: 'Uptime', value: `${Math.round((siteStats.uptime as number) || 0)}s`, icon: '⏱️' },
                    ].map(s => (
                      <div key={s.label} style={{
                        padding: 12, borderRadius: 6,
                        border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.05)',
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                        <div style={{ color: '#00e5ff', fontSize: 18, fontWeight: 700 }}>{String(s.value)}</div>
                        <div style={{ color: 'rgba(0,229,255,0.4)', fontSize: 9, letterSpacing: '0.1em' }}>{s.label.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                )}
                <h4 style={{ color: 'rgba(0,229,255,0.6)', fontSize: 12, marginBottom: 10 }}>USERS</h4>
                {userList.map(u => (
                  <div key={u.userId} style={{
                    padding: 10, marginBottom: 6, borderRadius: 6,
                    border: '1px solid rgba(0,229,255,0.08)', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{u.name}</div>
                      <div style={{ color: 'rgba(0,229,255,0.3)', fontSize: 10 }}>{u.email}</div>
                    </div>
                    <div style={{ color: '#ffaa00', fontSize: 12 }}>🪙 {u.coins}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ─── Operator Panel ───────────────────────── */}
            {panel === 'operator' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                <h3 style={{ color: '#00e5ff', fontSize: 14, marginBottom: 16, letterSpacing: '0.1em' }}>🔧 OPERATOR MODE</h3>
                {systemStatus ? (
                  <div style={{ padding: 12, borderRadius: 6, border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.05)' }}>
                    <pre style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(systemStatus, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div>
                    <p style={{ color: 'rgba(0,229,255,0.4)', fontSize: 12 }}>No diagnostics yet.</p>
                    <button onClick={() => processMessage('Run health check')} style={{
                      padding: '8px 16px', borderRadius: 6, border: '1px solid #00e5ff',
                      background: 'rgba(0,229,255,0.1)', color: '#00e5ff', cursor: 'pointer', fontSize: 12,
                    }}>📊 Run Health Check</button>
                  </div>
                )}
                {/* Camera section */}
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ color: 'rgba(0,229,255,0.6)', fontSize: 12, marginBottom: 10 }}>📸 CAMERA</h4>
                  {cameraStream ? (
                    <div>
                      <video ref={videoRef} style={{ width: '100%', maxHeight: 300, borderRadius: 6, background: 'black' }} />
                      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        <button onClick={capturePhoto} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #00e5ff', background: 'rgba(0,229,255,0.1)', color: '#00e5ff', cursor: 'pointer', fontSize: 11 }}>📸 Capture</button>
                        <button onClick={stopCamera} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ff4444', background: 'rgba(255,68,68,0.1)', color: '#ff4444', cursor: 'pointer', fontSize: 11 }}>✕ Close</button>
                      </div>
                      <canvas ref={canvasRef} style={{ display: 'none' }} />
                    </div>
                  ) : (
                    <button onClick={startCamera} style={{
                      padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.2)',
                      background: 'rgba(0,229,255,0.05)', color: 'rgba(0,229,255,0.6)', cursor: 'pointer', fontSize: 11,
                    }}>📷 Open Camera</button>
                  )}
                  {uploadedImage && (
                    <img src={uploadedImage} alt="Uploaded" style={{ marginTop: 10, maxWidth: '100%', borderRadius: 6, maxHeight: 200 }} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Bottom Status Bar ────────────────────────── */}
        <div style={{
          padding: '6px 20px', borderTop: '1px solid rgba(0,229,255,0.1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(0,5,15,0.8)',
        }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ color: 'rgba(0,229,255,0.3)', fontSize: 9 }}>AI: GEMINI 3.6 FLASH</span>
            <span style={{ color: 'rgba(0,229,255,0.3)', fontSize: 9 }}>TTS: ELEVENLABS</span>
            <span style={{ color: 'rgba(0,255,136,0.3)', fontSize: 9 }}>● CONNECTED</span>
          </div>
          <span style={{ color: 'rgba(0,229,255,0.2)', fontSize: 9 }}>MURAGOODS AI OS</span>
        </div>
      </div>
    </>
  );
}
