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
interface Task { _id: string; title: string; status: string; type: string; logs: Array<{ step: string; status: string; message: string }>; createdAt: string; }

type Panel = 'chat' | 'memory' | 'tasks' | 'history' | 'privacy' | 'operator' | 'camera';

const intentIcons: Record<string, string> = {
  NAVIGATION: '🗺️', SEARCH: '🔍', INFORMATION: 'ℹ️', CREATION: '✉️',
  ACTION: '⚡', SYSTEM: '⏰', SCREEN_CONTEXT: '📄', AGENT: '🤖',
  MEMORY: '🧠', OPERATOR: '🔧', UNKNOWN: '❓',
};

// ─── Component ───────────────────────────────────────────────
export function JARVIS({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [panel, setPanel] = useState<Panel>('chat');
  const [pulseIntensity, setPulseIntensity] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [currentTime, setCurrentTime] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [screenContextEnabled, setScreenContextEnabled] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [commandHistory, setCommandHistory] = useState<Array<{ command: string; result: string; timestamp: string }>>([]);
  const [systemStatus, setSystemStatus] = useState<Record<string, unknown> | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    try { const u = localStorage.getItem('user'); return u ? JSON.parse(u).userId : undefined; } catch { return undefined; }
  }, []);

  // ─── Clock ───────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
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

  // ─── Welcome ─────────────────────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0) {
      const h = new Date().getHours();
      const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      setMessages([{
        id: 'w', role: 'jarvis',
        text: `${g}, Commander. All systems online. Tap the orb or press the mic to speak, or type a command.`,
        intent: 'INFORMATION', timestamp: new Date(),
      }]);
    }
  }, [open, messages.length]);

  // ─── Auto-scroll ────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 400); }, [open]);

  // ─── Speech Recognition (with proper permission handling) ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.warn('[JARVIS] SpeechRecognition not supported in this browser'); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const transcript = ev.results[0][0].transcript;
      console.log('[JARVIS] Voice recognized:', transcript);
      setListening(false);
      handleSend(transcript);
    };
    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      console.error('[JARVIS] Speech error:', ev.error, ev.message);
      setListening(false);
      if (ev.error === 'not-allowed') {
        alert('Microphone access was denied. Please allow microphone access in your browser settings to use voice commands.');
      } else if (ev.error === 'no-speech') {
        // No speech detected, just stop silently
      } else if (ev.error === 'network') {
        alert('Network error during speech recognition. Please check your connection.');
      }
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    synthRef.current = window.speechSynthesis;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load data ──────────────────────────────────────────
  useEffect(() => {
    if (!open || !userId) return;
    Promise.all([
      fetch(`/api/jarvis/memory?userId=${userId}`).then(r => r.json()),
      fetch(`/api/jarvis/tasks?userId=${userId}`).then(r => r.json()),
    ]).then(([mem, task]) => {
      if (mem.success) setMemories(mem.data);
      if (task.success) setTasks(task.data);
    }).catch(() => {});
  }, [open, userId]);

  // ─── Voice output ───────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !synthRef.current) return;
    synthRef.current.cancel();
    const clean = text.replace(/[*#\n]/g, ' ').replace(/\s+/g, ' ').trim();
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1; u.pitch = 0.85; u.volume = 0.9;
    const voices = synthRef.current.getVoices();
    const v = voices.find(v => v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'));
    if (v) u.voice = v;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    synthRef.current.speak(u);
  }, [voiceEnabled]);

  // ─── Screen context ─────────────────────────────────────
  const getScreenContext = useCallback(() => {
    if (!screenContextEnabled) return undefined;
    try {
      const title = document.title;
      const url = window.location.pathname;
      const text = document.body?.innerText?.substring(0, 1200) || '';
      return `Page: ${title} (${url})\nContent: ${text.substring(0, 800)}`;
    } catch { return undefined; }
  }, [screenContextEnabled]);

  // ─── Process message ────────────────────────────────────
  const processMessage = useCallback(async (text: string) => {
    setProcessing(true);
    setPulseIntensity(1);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text, timestamp: new Date() }]);
    setCommandHistory(prev => [{ command: text, result: '', timestamp: new Date().toISOString() }, ...prev].slice(0, 50));

    try {
      const screenContext = getScreenContext();
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, userId, screenContext }),
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
        speak(result.data.response);

        setCommandHistory(prev => {
          const u = [...prev];
          if (u.length > 0) u[0] = { ...u[0], result: result.data.response.substring(0, 200) };
          return u;
        });

        // Execute actions
        const a = result.data.action;
        const p = result.data.actionParams;
        if (a === 'navigate' && p?.path && p.path !== '#') {
          setTimeout(() => { router.push(p.path); onClose(); }, 1200);
        } else if (a === 'logout') {
          setTimeout(() => { localStorage.removeItem('user'); router.push('/login'); onClose(); }, 1200);
        } else if (a === 'search' && p?.query) {
          setTimeout(() => { router.push(`/untold-words?q=${encodeURIComponent(p.query)}`); onClose(); }, 1200);
        } else if (a === 'health-check') {
          try {
            const sr = await fetch('/api/jarvis/status');
            const sd = await sr.json();
            if (sd.success) setSystemStatus(sd.data);
          } catch { /* empty */ }
        } else if (a === 'camera') {
          setPanel('camera');
        }
      }
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'jarvis', text: 'Connection lost. Retrying...', timestamp: new Date() }]);
    }
    setProcessing(false);
    setPulseIntensity(0);
  }, [userId, getScreenContext, router, onClose, speak]);

  const handleSend = useCallback((text?: string) => {
    const msg = (text || input).trim();
    if (!msg || processing) return;
    setInput('');
    processMessage(msg);
  }, [input, processing, processMessage]);

  // ─── Voice toggle (with permission request) ──────────────
  const toggleVoice = useCallback(async () => {
    if (!recognitionRef.current) {
      alert('Voice commands are not supported in this browser. Please use Chrome or Edge for voice features.');
      return;
    }
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    // Request microphone permission first
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Microphone access is required for voice commands.\n\nPlease allow microphone access in your browser settings and try again.');
      return;
    }
    // Stop any ongoing speech
    synthRef.current?.cancel();
    setSpeaking(false);
    // Start listening
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (err) {
      console.error('[JARVIS] Failed to start recognition:', err);
      setListening(false);
    }
  }, [listening]);

  // ─── Camera ─────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { alert('Camera access denied.'); }
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
    if (ctx) { ctx.drawImage(video, 0, 0); const dataUrl = canvas.toDataURL('image/jpeg'); setUploadedImage(dataUrl); stopCamera(); processMessage('Analyze this image'); }
  }, [stopCamera, processMessage]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setUploadedImage(dataUrl);
      processMessage('Analyze this image');
    };
    reader.readAsDataURL(file);
  }, [processMessage]);

  // ─── Action handler ─────────────────────────────────────
  const handleAction = useCallback((action: string, params?: Record<string, string>) => {
    if (action === 'navigate' && params?.path) { router.push(params.path); onClose(); }
    else if (action === 'camera') { setPanel('camera'); }
    else if (action === 'upload-image') { fileInputRef.current?.click(); }
    else if (action === 'health-check') { processMessage('Run health check'); }
  }, [router, onClose, processMessage]);

  // ─── Memory ops ─────────────────────────────────────────
  const deleteMemory = useCallback(async (id: string) => {
    if (!userId) return;
    await fetch(`/api/jarvis/memory?userId=${userId}&id=${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m._id !== id));
  }, [userId]);

  // ─── Render text ────────────────────────────────────────
  const renderText = (text: string) => text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return <p key={i} style={{ margin: '3px 0', lineHeight: 1.6 }}>{parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j} style={{ color: '#00e5ff' }}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>)}</p>;
  });

  if (!open) return null;

  const orbClass = listening ? 'listening' : speaking ? 'speaking' : processing ? 'processing' : '';
  const statusColor = processing ? '#ffd60a' : listening ? '#ff4d6a' : speaking ? '#00ff88' : '#00e5ff';

  return (
    <>
      <style jsx>{`
        .jarvis-fullscreen {
          position: fixed; inset: 0; z-index: 99999;
          background: #030810;
          display: flex; flex-direction: column;
          animation: jarvis-boot 0.6s ease-out;
        }
        @keyframes jarvis-boot {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        /* ─── TOP HUD BAR ──────────────────────────── */
        .hud-top {
          height: 48px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 24px; border-bottom: 1px solid rgba(0,229,255,0.12);
          background: linear-gradient(180deg, rgba(0,20,40,0.9) 0%, rgba(0,10,20,0.6) 100%);
          flex-shrink: 0;
        }
        .hud-left { display: flex; align-items: center; gap: 16px; }
        .hud-logo { font-family: var(--font-arcade); font-size: 13px; color: #00e5ff; letter-spacing: 0.25em; text-shadow: 0 0 20px rgba(0,229,255,0.4); }
        .hud-version { font-size: 9px; color: rgba(0,229,255,0.35); font-family: var(--font-arcade); }
        .hud-center { display: flex; align-items: center; gap: 20px; }
        .hud-stat { display: flex; align-items: center; gap: 6px; font-size: 10px; color: rgba(0,229,255,0.5); font-family: var(--font-arcade); }
        .hud-dot { width: 6px; height: 6px; border-radius: 50%; animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }
        .hud-right { display: flex; align-items: center; gap: 12px; }
        .hud-time { font-family: var(--font-arcade); font-size: 11px; color: #00e5ff; letter-spacing: 0.1em; }
        .hud-close { width: 32px; height: 32px; border-radius: 8px; background: rgba(255,50,50,0.1); border: 1px solid rgba(255,50,50,0.3); color: #ff4444; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .hud-close:hover { background: rgba(255,50,50,0.2); }
        /* ─── MAIN LAYOUT ──────────────────────────── */
        .hud-body { flex: 1; display: flex; min-height: 0; }
        .hud-sidebar {
          width: 200px; border-right: 1px solid rgba(0,229,255,0.08);
          background: rgba(0,8,20,0.5); display: flex; flex-direction: column;
          padding: 16px 0; flex-shrink: 0;
        }
        .sidebar-label { font-family: var(--font-arcade); font-size: 8px; color: rgba(0,229,255,0.3); letter-spacing: 0.15em; padding: 8px 20px 6px; }
        .sidebar-btn {
          display: flex; align-items: center; gap: 10px; padding: 10px 20px;
          background: transparent; border: none; color: rgba(255,255,255,0.4);
          font-size: 12px; cursor: pointer; transition: all 0.15s; text-align: left; width: 100%;
        }
        .sidebar-btn:hover { background: rgba(0,229,255,0.05); color: rgba(255,255,255,0.7); }
        .sidebar-btn.active { background: rgba(0,229,255,0.08); color: #00e5ff; border-right: 2px solid #00e5ff; }
        .sidebar-btn span:first-child { font-size: 16px; width: 22px; text-align: center; }
        /* ─── CENTER: ORB + CHAT ───────────────────── */
        .hud-center-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .orb-section {
          display: flex; justify-content: center; align-items: center;
          padding: 24px 0 12px; flex-shrink: 0; position: relative;
        }
        .orb-container { position: relative; width: 120px; height: 120px; cursor: pointer; }
        .orb-container:hover { transform: scale(1.03); }
        .orb-core {
          position: absolute; inset: 16px; border-radius: 50%;
          background: radial-gradient(circle at ${50 + mousePos.x * 20}% ${50 + mousePos.y * 20}%, #00e5ff, #0066ff, #001a66);
          box-shadow: 0 0 ${24 + pulseIntensity * 40}px rgba(0,229,255,${0.3 + pulseIntensity * 0.4}), 0 0 ${60 + pulseIntensity * 80}px rgba(0,100,255,${0.1 + pulseIntensity * 0.2}), inset 0 0 30px rgba(255,255,255,0.08);
          animation: orb-idle 3s ease-in-out infinite;
          transition: box-shadow 0.5s, background 0.5s;
        }
        .orb-core.listening { background: radial-gradient(circle, #ff4466, #cc0033, #660022); box-shadow: 0 0 40px rgba(255,68,102,0.6), 0 0 80px rgba(255,0,50,0.3); animation: orb-listen 0.6s ease-in-out infinite; }
        .orb-core.speaking { background: radial-gradient(circle, #00ff88, #00cc66, #006633); box-shadow: 0 0 40px rgba(0,255,136,0.5), 0 0 80px rgba(0,200,100,0.25); animation: orb-speak 0.4s ease-in-out infinite; }
        .orb-core.processing { background: radial-gradient(circle, #ffd60a, #ff8800, #994400); box-shadow: 0 0 40px rgba(255,214,10,0.5), 0 0 80px rgba(255,136,0,0.25); animation: orb-process 0.8s linear infinite; }
        @keyframes orb-idle { 0%,100%{transform:scale(1)} 50%{transform:scale(1.02)} }
        @keyframes orb-listen { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        @keyframes orb-speak { 0%,100%{transform:scale(1)} 25%{transform:scale(1.05)} 75%{transform:scale(0.96)} }
        @keyframes orb-process { 0%{transform:rotate(0) scale(1)} 50%{transform:rotate(180deg) scale(1.06)} 100%{transform:rotate(360deg) scale(1)} }
        .orb-ring { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid rgba(0,229,255,0.15); animation: ring-spin 25s linear infinite; }
        .orb-ring2 { position: absolute; inset: -8px; border-radius: 50%; border: 1px dashed rgba(0,229,255,0.08); animation: ring-spin 40s linear infinite reverse; }
        .orb-ring3 { position: absolute; inset: -16px; border-radius: 50%; border: 1px solid rgba(0,229,255,0.04); animation: ring-spin 60s linear infinite; }
        @keyframes ring-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        .orb-particles { position: absolute; inset: -30px; pointer-events: none; }
        .particle { position: absolute; width: 2px; height: 2px; border-radius: 50%; background: rgba(0,229,255,0.4); animation: p-float 5s ease-in-out infinite; }
        .particle:nth-child(1){top:5%;left:25%;animation-delay:0s} .particle:nth-child(2){top:20%;right:10%;animation-delay:1s}
        .particle:nth-child(3){bottom:15%;left:8%;animation-delay:2s} .particle:nth-child(4){bottom:25%;right:15%;animation-delay:3s}
        .particle:nth-child(5){top:50%;left:2%;animation-delay:4s} .particle:nth-child(6){top:40%;right:5%;animation-delay:0.5s}
        @keyframes p-float { 0%,100%{opacity:.2;transform:translateY(0)} 50%{opacity:.7;transform:translateY(-12px)} }
        .orb-label { text-align: center; margin-top: 8px; font-family: var(--font-arcade); font-size: 10px; color: ${statusColor}; letter-spacing: 0.15em; text-shadow: 0 0 10px ${statusColor}40; }
        /* ─── MESSAGES ─────────────────────────────── */
        .messages-area { flex: 1; overflow-y: auto; padding: 8px 32px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; scrollbar-color: rgba(0,229,255,0.15) transparent; min-height: 0; }
        .msg { max-width: 75%; padding: 12px 16px; border-radius: 14px; font-size: 13px; line-height: 1.55; animation: msg-in 0.25s ease-out; }
        @keyframes msg-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .msg-user { align-self: flex-end; background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.15); color: #c0d0e0; }
        .msg-jarvis { align-self: flex-start; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.05); color: #a0b0c0; }
        .intent-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 8px; color: rgba(0,229,255,0.45); font-family: var(--font-arcade); margin-bottom: 4px; padding: 2px 7px; background: rgba(0,229,255,0.04); border-radius: 5px; border: 1px solid rgba(0,229,255,0.08); }
        .action-btn { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; padding: 7px 14px; border-radius: 9px; border: 1px solid rgba(0,229,255,0.2); background: rgba(0,229,255,0.05); color: #00e5ff; font-family: var(--font-arcade); font-size: 9px; cursor: pointer; transition: all 0.2s; }
        .action-btn:hover { background: rgba(0,229,255,0.12); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,229,255,0.15); }
        .cards-row { display: flex; gap: 8px; overflow-x: auto; padding: 6px 0; scrollbar-width: none; }
        .cards-row::-webkit-scrollbar { display: none; }
        .mini-card { flex-shrink: 0; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(0,229,255,0.1); background: rgba(0,229,255,0.03); min-width: 150px; cursor: pointer; transition: all 0.2s; }
        .mini-card:hover { background: rgba(0,229,255,0.07); transform: translateY(-1px); border-color: rgba(0,229,255,0.2); }
        .mini-card-title { font-family: var(--font-arcade); font-size: 9px; color: #00e5ff; margin-bottom: 3px; }
        .mini-card-desc { font-size: 11px; color: rgba(255,255,255,0.35); line-height: 1.4; }
        /* ─── INPUT BAR ────────────────────────────── */
        .input-bar {
          padding: 12px 32px 16px; border-top: 1px solid rgba(0,229,255,0.08);
          background: linear-gradient(0deg, rgba(0,10,20,0.8) 0%, rgba(0,5,15,0.4) 100%);
          flex-shrink: 0;
        }
        .input-row { display: flex; gap: 10px; align-items: center; max-width: 800px; margin: 0 auto; }
        .input-actions { display: flex; gap: 6px; }
        .action-icon { width: 42px; height: 42px; border-radius: 11px; border: 1.5px solid rgba(0,229,255,0.12); background: rgba(0,229,255,0.03); color: #00e5ff; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .action-icon:hover { background: rgba(0,229,255,0.08); border-color: rgba(0,229,255,0.25); }
        .action-icon.active { background: rgba(255,68,102,0.1); border-color: rgba(255,68,102,0.3); color: #ff4466; animation: mic-glow 1s ease-in-out infinite; }
        @keyframes mic-glow { 0%,100%{box-shadow:0 0 0 0 rgba(255,68,102,0.3)} 50%{box-shadow:0 0 0 8px rgba(255,68,102,0)} }
        .chat-input {
          flex: 1; height: 44px; padding: 0 16px; border-radius: 12px;
          border: 1.5px solid rgba(0,229,255,0.12); background: rgba(0,10,25,0.6);
          color: #d0e0f0; font-size: 14px; outline: none; font-family: var(--font-body);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .chat-input:focus { border-color: rgba(0,229,255,0.35); box-shadow: 0 0 20px rgba(0,229,255,0.08); }
        .chat-input::placeholder { color: rgba(255,255,255,0.15); }
        .send-btn { width: 44px; height: 44px; border-radius: 12px; border: 1.5px solid rgba(0,229,255,0.25); background: rgba(0,229,255,0.08); color: #00e5ff; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .send-btn:hover { background: rgba(0,229,255,0.15); box-shadow: 0 0 20px rgba(0,229,255,0.15); }
        .send-btn:disabled { opacity: 0.2; cursor: not-allowed; }
        .quick-row { display: flex; gap: 6px; justify-content: center; padding: 8px 0 0; flex-wrap: wrap; }
        .quick-chip { padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(0,229,255,0.1); background: rgba(0,229,255,0.03); color: rgba(0,229,255,0.45); font-size: 11px; cursor: pointer; transition: all 0.15s; }
        .quick-chip:hover { background: rgba(0,229,255,0.08); color: #00e5ff; border-color: rgba(0,229,255,0.2); }
        /* ─── PROCESSING ───────────────────────────── */
        .processing-bar { display: flex; align-items: center; gap: 10px; padding: 8px 32px; color: rgba(255,214,10,0.6); font-size: 11px; font-family: var(--font-arcade); }
        .dots span { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #ffd60a; margin: 0 2px; animation: dot-bounce 1.4s ease-in-out infinite; }
        .dots span:nth-child(2){animation-delay:.2s} .dots span:nth-child(3){animation-delay:.4s}
        @keyframes dot-bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        /* ─── RIGHT PANEL ──────────────────────────── */
        .right-panel {
          width: 280px; border-left: 1px solid rgba(0,229,255,0.08);
          background: rgba(0,8,20,0.5); overflow-y: auto;
          scrollbar-width: thin; scrollbar-color: rgba(0,229,255,0.15) transparent;
        }
        .panel-header { padding: 16px; border-bottom: 1px solid rgba(0,229,255,0.06); }
        .panel-title { font-family: var(--font-arcade); font-size: 10px; color: #00e5ff; letter-spacing: 0.1em; }
        .panel-content { padding: 12px 16px; }
        .mem-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04); background: rgba(255,255,255,0.015); margin-bottom: 5px; }
        .mem-key { font-family: var(--font-arcade); font-size: 8px; color: #00e5ff; }
        .mem-val { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px; }
        .mem-del { background: none; border: none; color: rgba(255,68,102,0.4); cursor: pointer; font-size: 12px; }
        .mem-del:hover { color: #ff4466; }
        .task-item { padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04); background: rgba(255,255,255,0.015); margin-bottom: 5px; }
        .task-title { font-family: var(--font-arcade); font-size: 8px; margin-bottom: 3px; }
        .task-status { font-size: 9px; padding: 2px 6px; border-radius: 5px; display: inline-block; }
        .hist-item { padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03); margin-bottom: 3px; }
        .hist-cmd { font-size: 11px; color: rgba(255,255,255,0.5); }
        .hist-time { font-size: 8px; color: rgba(255,255,255,0.15); margin-top: 2px; }
        .privacy-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .privacy-label { font-size: 12px; color: rgba(255,255,255,0.5); }
        .toggle { width: 40px; height: 22px; border-radius: 11px; cursor: pointer; position: relative; transition: all 0.3s; border: 1px solid; }
        .toggle-knob { position: absolute; top: 2px; width: 16px; height: 16px; border-radius: 50%; transition: all 0.3s; }
        .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .status-card { padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04); background: rgba(255,255,255,0.015); }
        .status-card-label { font-family: var(--font-arcade); font-size: 7px; color: rgba(255,255,255,0.25); margin-bottom: 3px; }
        .status-card-value { font-size: 11px; font-weight: 600; }
        .empty { text-align: center; padding: 24px; color: rgba(255,255,255,0.2); font-size: 11px; }
        .camera-area { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px; }
        .camera-video { width: 100%; max-width: 400px; border-radius: 12px; border: 2px solid rgba(0,229,255,0.2); background: #000; }
        .camera-btns { display: flex; gap: 10px; }
        .cam-btn { padding: 10px 20px; border-radius: 10px; border: 1px solid rgba(0,229,255,0.3); background: rgba(0,229,255,0.08); color: #00e5ff; font-family: var(--font-arcade); font-size: 10px; cursor: pointer; transition: all 0.2s; }
        .cam-btn:hover { background: rgba(0,229,255,0.15); }
        .cam-btn.danger { border-color: rgba(255,68,102,0.3); color: #ff4466; background: rgba(255,68,102,0.08); }
        @media (max-width: 900px) {
          .hud-sidebar { display: none; }
          .right-panel { display: none; }
          .messages-area { padding: 8px 16px; }
          .input-bar { padding: 10px 16px 14px; }
          .msg { max-width: 90%; }
        }
      `}</style>

      <div className="jarvis-fullscreen">
        {/* ─── TOP HUD ──────────────────────────────── */}
        <div className="hud-top">
          <div className="hud-left">
            <div className="hud-logo">J.A.R.V.I.S</div>
            <div className="hud-version">v2.0 TACTICAL</div>
          </div>
          <div className="hud-center">
            <div className="hud-stat"><div className="hud-dot" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} /> {processing ? 'PROCESSING' : listening ? 'LISTENING' : speaking ? 'SPEAKING' : 'STANDBY'}</div>
            <div className="hud-stat"><div className="hud-dot" style={{ background: screenContextEnabled ? '#00ff88' : 'rgba(255,255,255,0.15)' }} /> CTX:{screenContextEnabled ? 'ON' : 'OFF'}</div>
            <div className="hud-stat"><div className="hud-dot" style={{ background: '#00e5ff' }} /> SYS:ONLINE</div>
          </div>
          <div className="hud-right">
            <div className="hud-time">{currentTime}</div>
            <button className="hud-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ─── BODY ─────────────────────────────────── */}
        <div className="hud-body">
          {/* Left sidebar */}
          <div className="hud-sidebar">
            <div className="sidebar-label">SYSTEMS</div>
            {([
              ['chat', '💬', 'Console'],
              ['camera', '📸', 'Vision'],
              ['operator', '🔧', 'Operator'],
            ] as [Panel, string, string][]).map(([p, icon, label]) => (
              <button key={p} className={`sidebar-btn ${panel === p ? 'active' : ''}`} onClick={() => setPanel(p)}>
                <span>{icon}</span><span>{label}</span>
              </button>
            ))}
            <div className="sidebar-label" style={{ marginTop: '12px' }}>DATA</div>
            {([
              ['memory', '🧠', 'Memory'],
              ['tasks', '📋', 'Tasks'],
              ['history', '📜', 'History'],
              ['privacy', '🔒', 'Privacy'],
            ] as [Panel, string, string][]).map(([p, icon, label]) => (
              <button key={p} className={`sidebar-btn ${panel === p ? 'active' : ''}`} onClick={() => setPanel(p)}>
                <span>{icon}</span><span>{label}</span>
              </button>
            ))}
          </div>

          {/* Center */}
          <div className="hud-center-area">
            {panel === 'chat' && (
              <>
                <div className="orb-section">
                  <div className="orb-container" ref={coreRef} onClick={toggleVoice}>
                    <div className="orb-ring" /><div className="orb-ring2" /><div className="orb-ring3" />
                    <div className={`orb-core ${orbClass}`} />
                    <div className="orb-particles">
                      <div className="particle" /><div className="particle" /><div className="particle" />
                      <div className="particle" /><div className="particle" /><div className="particle" />
                    </div>
                  </div>
                </div>
                <div className="orb-label">{listening ? '🎤 Listening...' : speaking ? '🔊 Speaking' : processing ? '⏳ Processing' : 'Tap orb or press 🎤'}</div>

                {processing && <div className="processing-bar"><div className="dots"><span /><span /><span /></div>Analyzing your request...</div>}

                <div className="messages-area">
                  {messages.map(msg => (
                    <div key={msg.id} className={`msg ${msg.role === 'user' ? 'msg-user' : 'msg-jarvis'}`}>
                      {msg.role === 'jarvis' && msg.intent && <div className="intent-badge">{intentIcons[msg.intent] || '🤖'} {msg.intent}</div>}
                      <div>{renderText(msg.text)}</div>
                      {msg.cards && msg.cards.length > 0 && (
                        <div className="cards-row">
                          {msg.cards.map((c, i) => <div key={i} className="mini-card" onClick={() => c.action && handleAction(c.action, c.actionParams)}><div className="mini-card-title">{c.title}</div><div className="mini-card-desc">{c.description}</div></div>)}
                        </div>
                      )}
                      {msg.buttons && msg.buttons.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                          {msg.buttons.map((b, i) => <button key={i} className="action-btn" onClick={() => handleAction(b.action, b.actionParams)}>→ {b.label}</button>)}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="input-bar">
                  <div className="input-row">
                    <div className="input-actions">
                      <button className={`action-icon ${listening ? 'active' : ''}`} onClick={toggleVoice} title="Voice">{listening ? '🔴' : '🎤'}</button>
                      <button className="action-icon" onClick={() => setScreenContextEnabled(!screenContextEnabled)} title="Screen Context" style={screenContextEnabled ? { borderColor: 'rgba(0,255,136,0.3)', color: '#00ff88' } : {}}>📄</button>
                      <button className="action-icon" onClick={() => { setPanel('camera'); }} title="Camera">📸</button>
                    </div>
                    <input ref={inputRef} className="chat-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Type a command..." disabled={processing} />
                    <button className="send-btn" onClick={() => handleSend()} disabled={!input.trim() || processing}>{processing ? '⏳' : '▶'}</button>
                  </div>
                  <div className="quick-row">
                    {['🍽️ Order food', '🪙 My balance', '🎁 Mystery Box', '💌 Letters', '🔧 Health Check', '⏰ Time'].map(q => (
                      <button key={q} className="quick-chip" onClick={() => handleSend(q.replace(/^[^\s]+\s/, ''))}>{q}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Camera panel */}
            {panel === 'camera' && (
              <div className="camera-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#00e5ff', marginBottom: '8px' }}>📸 VISION MODULE</h2>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '16px' }}>Scan QR codes, analyze images, or read text</p>
                {cameraStream ? (
                  <>
                    <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                    <div className="camera-btns">
                      <button className="cam-btn" onClick={capturePhoto}>📸 Capture</button>
                      <button className="cam-btn danger" onClick={stopCamera}>✕ Close</button>
                    </div>
                  </>
                ) : uploadedImage ? (
                  <img src={uploadedImage} alt="Uploaded" style={{ maxWidth: '400px', borderRadius: '12px', border: '2px solid rgba(0,229,255,0.2)' }} />
                ) : (
                  <>
                    <div style={{ width: '200px', height: '200px', borderRadius: '16px', border: '2px dashed rgba(0,229,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                      <span style={{ fontSize: '48px', opacity: 0.3 }}>📷</span>
                    </div>
                    <div className="camera-btns">
                      <button className="cam-btn" onClick={startCamera}>📹 Open Camera</button>
                      <button className="cam-btn" onClick={() => fileInputRef.current?.click()}>📁 Upload Image</button>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                  </>
                )}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>
            )}

            {/* Operator panel */}
            {panel === 'operator' && (
              <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
                <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#00e5ff', marginBottom: '16px' }}>🔧 OPERATOR MODE</h2>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {['Run health check', 'Check logs', 'Check git status', 'Check deployment', 'Optimize website'].map(cmd => (
                    <button key={cmd} className="quick-chip" onClick={() => { processMessage(cmd); setPanel('chat'); }}>{cmd}</button>
                  ))}
                </div>
                {systemStatus ? (
                  <>
                    <div style={{ padding: '12px', borderRadius: '12px', border: `1px solid ${systemStatus.status === 'healthy' ? 'rgba(0,255,136,0.2)' : 'rgba(255,214,10,0.2)'}`, background: systemStatus.status === 'healthy' ? 'rgba(0,255,136,0.04)' : 'rgba(255,214,10,0.04)', marginBottom: '12px' }}>
                      <div style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: systemStatus.status === 'healthy' ? '#00ff88' : '#ffd60a' }}>
                        {systemStatus.status === 'healthy' ? '✅' : '⚠️'} SYSTEM: {String(systemStatus.healthScore)}% — {String(systemStatus.status).toUpperCase()}
                      </div>
                    </div>
                    <div className="status-grid">
                      {Object.entries((systemStatus as Record<string, Record<string, unknown>>).systems || {}).map(([key, val]) => {
                        const sys = val as Record<string, string>;
                        const st = String(sys.status || sys.provider || 'OK');
                        const ok = st === 'online' || st === 'healthy';
                        return <div key={key} className="status-card"><div className="status-card-label">{key.toUpperCase()}</div><div className="status-card-value" style={{ color: ok ? '#00ff88' : '#ffd60a' }}>{ok ? '✅' : '⚠️'} {st}</div></div>;
                      })}
                    </div>
                  </>
                ) : <div className="empty">Click "Run health check" to inspect all systems.</div>}
              </div>
            )}
          </div>

          {/* Right panel */}
          {panel !== 'chat' && panel !== 'camera' && panel !== 'operator' && (
            <div className="right-panel">
              {panel === 'memory' && (
                <>
                  <div className="panel-header"><div className="panel-title">🧠 MEMORY CENTER</div></div>
                  <div className="panel-content">
                    {memories.length === 0 ? <div className="empty">No memories yet.</div> : memories.map(m => (
                      <div key={m._id} className="mem-item">
                        <div><div className="mem-key">{(m.category || 'context').toUpperCase()}</div><div className="mem-val">{m.value}</div></div>
                        <button className="mem-del" onClick={() => deleteMemory(m._id)}>✕</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {panel === 'tasks' && (
                <>
                  <div className="panel-header"><div className="panel-title">📋 TASK CENTER</div></div>
                  <div className="panel-content">
                    {tasks.length === 0 ? <div className="empty">No tasks yet.</div> : tasks.map(t => (
                      <div key={t._id} className="task-item">
                        <div className="task-title" style={{ color: t.status === 'completed' ? '#00ff88' : t.status === 'failed' ? '#ff4466' : '#ffd60a' }}>{t.title}</div>
                        <div className="task-status" style={{ background: t.status === 'completed' ? 'rgba(0,255,136,0.1)' : 'rgba(255,214,10,0.1)', color: t.status === 'completed' ? '#00ff88' : '#ffd60a', border: `1px solid ${t.status === 'completed' ? 'rgba(0,255,136,0.2)' : 'rgba(255,214,10,0.2)'}` }}>{t.status.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {panel === 'history' && (
                <>
                  <div className="panel-header"><div className="panel-title">📜 COMMAND HISTORY</div></div>
                  <div className="panel-content">
                    {commandHistory.length === 0 ? <div className="empty">No commands yet.</div> : commandHistory.map((c, i) => (
                      <div key={i} className="hist-item"><div className="hist-cmd">→ {c.command}</div>{c.result && <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>{c.result.substring(0, 100)}...</div>}<div className="hist-time">{new Date(c.timestamp).toLocaleTimeString()}</div></div>
                    ))}
                  </div>
                </>
              )}
              {panel === 'privacy' && (
                <>
                  <div className="panel-header"><div className="panel-title">🔒 PRIVACY</div></div>
                  <div className="panel-content">
                    {([
                      ['🎤 Microphone', voiceEnabled, () => setVoiceEnabled(!voiceEnabled)] as const,
                      ['📄 Screen Context', screenContextEnabled, () => setScreenContextEnabled(!screenContextEnabled)] as const,
                      ['🧠 Memory', memoryEnabled, () => setMemoryEnabled(!memoryEnabled)] as const,
                      ['🔊 Voice Output', voiceEnabled, () => setVoiceEnabled(!voiceEnabled)] as const,
                    ]).map(([label, val, toggleFn]) => (
                      <div key={label} className="privacy-row">
                        <div className="privacy-label">{label}</div>
                        <div className="toggle" style={{ background: val ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.08)', borderColor: val ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.1)' }} onClick={toggleFn}>
                          <div className="toggle-knob" style={{ left: val ? '20px' : '2px', background: val ? '#00e5ff' : 'rgba(255,255,255,0.3)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
