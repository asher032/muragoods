'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ───────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  action?: string;
  actionParams?: Record<string, string>;
  timestamp: Date;
}

interface JarvisProps {
  open: boolean;
  onClose: () => void;
}

// ─── Intent icon map ─────────────────────────────────────────
const intentIcons: Record<string, string> = {
  NAVIGATION: '🗺️',
  SEARCH: '🔍',
  INFORMATION: 'ℹ️',
  CREATION: '✉️',
  ACTION: '⚡',
  SYSTEM: '⏰',
  UNKNOWN: '❓',
};

// ─── Main Component ──────────────────────────────────────────
export function JARVIS({ open, onClose }: JarvisProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  const [pulseIntensity, setPulseIntensity] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  // ─── Clock ───────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Mouse tracking for orb ─────────────────────────────
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      if (!coreRef.current) return;
      const rect = coreRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setMousePos({
        x: (e.clientX - cx) / rect.width,
        y: (e.clientY - cy) / rect.height,
      });
    };
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  // ─── Welcome message ────────────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0) {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      setMessages([{
        id: 'welcome',
        role: 'jarvis',
        text: `${greeting}. I'm JARVIS, your intelligent assistant.\n\nI can navigate, search, create, and help you with anything on Muragoods.\n\nHow can I assist you?`,
        timestamp: new Date(),
      }]);
    }
  }, [open, messages.length]);

  // ─── Auto-scroll ────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Focus input when opened ────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // ─── Speech Recognition ─────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
      handleSend(transcript);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    synthRef.current = window.speechSynthesis;
  }, []);

  // ─── Voice output ───────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !synthRef.current) return;
    synthRef.current.cancel();
    const clean = text.replace(/[*#\n]/g, ' ').replace(/\s+/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1;
    utterance.pitch = 0.9;
    utterance.volume = 0.8;
    // Try to pick a nice voice
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    synthRef.current.speak(utterance);
  }, [voiceEnabled]);

  // ─── Process message ────────────────────────────────────
  const processMessage = useCallback(async (text: string) => {
    setProcessing(true);
    setPulseIntensity(1);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      const userId = stored ? JSON.parse(stored).userId : undefined;

      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, userId }),
      });
      const result = await res.json();

      if (result.success) {
        const jarvisMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'jarvis',
          text: result.data.response,
          action: result.data.action,
          actionParams: result.data.actionParams,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, jarvisMsg]);
        speak(result.data.response);

        // Execute actions
        if (result.data.action === 'navigate' && result.data.actionParams?.path) {
          setTimeout(() => {
            router.push(result.data.actionParams.path);
            onClose();
          }, 1500);
        } else if (result.data.action === 'logout') {
          setTimeout(() => {
            localStorage.removeItem('user');
            router.push('/login');
            onClose();
          }, 1500);
        } else if (result.data.action === 'search' && result.data.actionParams?.query) {
          setTimeout(() => {
            router.push(`/untold-words?q=${encodeURIComponent(result.data.actionParams.query)}`);
            onClose();
          }, 1500);
        }
      }
    } catch {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'jarvis',
        text: 'AI connection unavailable. Please try again shortly.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }

    setProcessing(false);
    setPulseIntensity(0);
  }, [router, onClose, speak]);

  // ─── Send handler ───────────────────────────────────────
  const handleSend = useCallback((text?: string) => {
    const msg = (text || input).trim();
    if (!msg || processing) return;
    setInput('');
    processMessage(msg);
  }, [input, processing, processMessage]);

  // ─── Voice toggle ───────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      synthRef.current?.cancel();
      setSpeaking(false);
      recognitionRef.current.start();
      setListening(true);
    }
  }, [listening]);

  // ─── Action button click ────────────────────────────────
  const handleAction = useCallback((action: string, params?: Record<string, string>) => {
    if (action === 'navigate' && params?.path) {
      router.push(params.path);
      onClose();
    } else if (action === 'search' && params?.query) {
      router.push(`/untold-words?q=${encodeURIComponent(params.query)}`);
      onClose();
    }
  }, [router, onClose]);

  // ─── Render markdown-lite ───────────────────────────────
  const renderText = (text: string) => {
    return text.split('\n').map((line, i) => {
      // Bold
      let rendered: React.ReactNode[] = [];
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      parts.forEach((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          rendered.push(<strong key={j} style={{ color: '#ffd60a' }}>{part.slice(2, -2)}</strong>);
        } else if (part) {
          rendered.push(<span key={j}>{part}</span>);
        }
      });
      return <p key={i} style={{ margin: '4px 0', lineHeight: 1.6 }}>{rendered}</p>;
    });
  };

  // ─── Render ─────────────────────────────────────────────
  if (!open) return null;

  return (
    <>
      <style jsx>{`
        .jarvis-overlay {
          position: fixed; inset: 0; z-index: 9998;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(12px);
          opacity: 1;
          transition: opacity 0.3s ease;
        }
        .jarvis-panel {
          position: fixed; top: 0; right: 0; bottom: 0;
          width: min(480px, 100vw); z-index: 9999;
          background: linear-gradient(180deg, #0a0e1a 0%, #0d1117 50%, #0a0e1a 100%);
          border-left: 1px solid rgba(0,180,255,0.15);
          box-shadow: -8px 0 40px rgba(0,180,255,0.1);
          display: flex; flex-direction: column;
          transform: translateX(0);
          transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .jarvis-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(0,180,255,0.12);
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(0,10,30,0.6);
        }
        .jarvis-title {
          display: flex; align-items: center; gap: 10px;
        }
        .jarvis-title h2 {
          font-family: var(--font-arcade); font-size: 12px;
          color: #00b4ff; letter-spacing: 0.2em; margin: 0;
        }
        .jarvis-status {
          width: 8px; height: 8px; border-radius: 50%;
          background: ${processing ? '#ffd60a' : listening ? '#ff4d6a' : speaking ? '#2eeba8' : '#00b4ff'};
          box-shadow: 0 0 8px ${processing ? '#ffd60a' : listening ? '#ff4d6a' : speaking ? '#2eeba8' : '#00b4ff'};
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
        .jarvis-close {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.5); font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .jarvis-close:hover { background: rgba(255,77,106,0.15); color: #ff4d6a; border-color: rgba(255,77,106,0.3); }
        .jarvis-hud {
          padding: 10px 20px;
          display: flex; gap: 12px; flex-wrap: wrap;
          border-bottom: 1px solid rgba(0,180,255,0.08);
          background: rgba(0,10,30,0.3);
        }
        .hud-item {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; color: rgba(0,180,255,0.6);
          font-family: var(--font-arcade);
        }
        .hud-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #00b4ff; opacity: 0.6;
        }
        .jarvis-orb-area {
          display: flex; justify-content: center; align-items: center;
          padding: 20px 0 10px;
          position: relative;
        }
        .jarvis-orb {
          width: 80px; height: 80px; border-radius: 50%;
          position: relative; cursor: pointer;
          transition: transform 0.3s ease;
        }
        .jarvis-orb:hover { transform: scale(1.05); }
        .orb-core {
          position: absolute; inset: 12px; border-radius: 50%;
          background: radial-gradient(circle at ${50 + mousePos.x * 20}% ${50 + mousePos.y * 20}%, #00e5ff, #0066ff, #003399);
          box-shadow: 0 0 ${20 + pulseIntensity * 30}px rgba(0,180,255,${0.3 + pulseIntensity * 0.4}),
                      0 0 ${40 + pulseIntensity * 60}px rgba(0,100,255,${0.15 + pulseIntensity * 0.3}),
                      inset 0 0 20px rgba(255,255,255,0.1);
          animation: orb-pulse 3s ease-in-out infinite;
          transition: box-shadow 0.5s ease;
        }
        .orb-core.listening {
          background: radial-gradient(circle at 50% 50%, #ff4d6a, #cc0033, #990033);
          box-shadow: 0 0 30px rgba(255,77,106,0.5), 0 0 60px rgba(255,0,50,0.25);
          animation: orb-listen 0.8s ease-in-out infinite;
        }
        .orb-core.speaking {
          background: radial-gradient(circle at 50% 50%, #2eeba8, #00cc88, #009966);
          box-shadow: 0 0 30px rgba(46,235,168,0.5), 0 0 60px rgba(0,200,100,0.25);
          animation: orb-speak 0.5s ease-in-out infinite;
        }
        .orb-core.processing {
          background: radial-gradient(circle at 50% 50%, #ffd60a, #ff9900, #cc6600);
          box-shadow: 0 0 30px rgba(255,214,10,0.5), 0 0 60px rgba(255,150,0,0.25);
          animation: orb-process 1s linear infinite;
        }
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes orb-listen {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes orb-speak {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.04); }
          75% { transform: scale(0.97); }
        }
        @keyframes orb-process {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.05); }
          100% { transform: rotate(360deg) scale(1); }
        }
        .orb-ring {
          position: absolute; inset: 0; border-radius: 50%;
          border: 1.5px solid rgba(0,180,255,0.2);
          animation: ring-spin 20s linear infinite;
        }
        .orb-ring-2 {
          position: absolute; inset: -6px; border-radius: 50%;
          border: 1px dashed rgba(0,180,255,0.1);
          animation: ring-spin 30s linear infinite reverse;
        }
        @keyframes ring-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .orb-particles {
          position: absolute; inset: -20px; pointer-events: none;
        }
        .particle {
          position: absolute; width: 2px; height: 2px; border-radius: 50%;
          background: rgba(0,180,255,0.4);
          animation: particle-float 4s ease-in-out infinite;
        }
        .particle:nth-child(1) { top: 10%; left: 20%; animation-delay: 0s; }
        .particle:nth-child(2) { top: 30%; right: 15%; animation-delay: 0.8s; }
        .particle:nth-child(3) { bottom: 20%; left: 10%; animation-delay: 1.6s; }
        .particle:nth-child(4) { bottom: 30%; right: 20%; animation-delay: 2.4s; }
        .particle:nth-child(5) { top: 50%; left: 5%; animation-delay: 3.2s; }
        @keyframes particle-float {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 0.8; transform: translateY(-10px); }
        }
        .jarvis-messages {
          flex: 1; overflow-y: auto; padding: 16px 20px;
          display: flex; flex-direction: column; gap: 12px;
          scrollbar-width: thin; scrollbar-color: rgba(0,180,255,0.2) transparent;
        }
        .msg {
          max-width: 85%; padding: 12px 16px;
          border-radius: 16px; font-size: 13px; line-height: 1.6;
          animation: msg-in 0.3s ease-out;
        }
        @keyframes msg-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .msg-user {
          align-self: flex-end;
          background: rgba(0,180,255,0.12);
          border: 1px solid rgba(0,180,255,0.2);
          color: #e0e8f0;
        }
        .msg-jarvis {
          align-self: flex-start;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: #c0c8d0;
        }
        .msg-jarvis .intent-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 9px; color: rgba(0,180,255,0.6);
          font-family: var(--font-arcade);
          margin-bottom: 6px; padding: 2px 8px;
          background: rgba(0,180,255,0.06);
          border-radius: 6px; border: 1px solid rgba(0,180,255,0.1);
        }
        .action-btn {
          display: inline-flex; align-items: center; gap: 6px;
          margin-top: 10px; padding: 8px 16px;
          border-radius: 10px; border: 1px solid rgba(0,180,255,0.3);
          background: rgba(0,180,255,0.08); color: #00b4ff;
          font-family: var(--font-arcade); font-size: 9px;
          cursor: pointer; transition: all 0.2s;
        }
        .action-btn:hover { background: rgba(0,180,255,0.15); transform: translateY(-1px); }
        .jarvis-input-area {
          padding: 12px 16px 16px;
          border-top: 1px solid rgba(0,180,255,0.1);
          background: rgba(0,10,30,0.5);
        }
        .input-row {
          display: flex; gap: 8px; align-items: center;
        }
        .voice-btn {
          width: 42px; height: 42px; border-radius: 12px;
          border: 1.5px solid ${listening ? 'rgba(255,77,106,0.5)' : 'rgba(0,180,255,0.2)'};
          background: ${listening ? 'rgba(255,77,106,0.1)' : 'rgba(0,180,255,0.05)'};
          color: ${listening ? '#ff4d6a' : '#00b4ff'};
          font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s; flex-shrink: 0;
        }
        .voice-btn:hover { background: rgba(0,180,255,0.1); }
        .voice-btn.listening { animation: voice-pulse 1s ease-in-out infinite; }
        @keyframes voice-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,77,106,0.3); }
          50% { box-shadow: 0 0 0 8px rgba(255,77,106,0); }
        }
        .chat-input {
          flex: 1; height: 42px; padding: 0 14px;
          border-radius: 12px; border: 1.5px solid rgba(0,180,255,0.15);
          background: rgba(0,10,30,0.6); color: #e0e8f0;
          font-size: 13px; outline: none;
          font-family: var(--font-body);
          transition: border-color 0.2s;
        }
        .chat-input:focus { border-color: rgba(0,180,255,0.4); }
        .chat-input::placeholder { color: rgba(255,255,255,0.2); }
        .send-btn {
          width: 42px; height: 42px; border-radius: 12px;
          border: 1.5px solid rgba(0,180,255,0.3);
          background: rgba(0,180,255,0.1);
          color: #00b4ff; font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s; flex-shrink: 0;
        }
        .send-btn:hover { background: rgba(0,180,255,0.2); transform: scale(1.05); }
        .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .settings-panel {
          position: absolute; inset: 0;
          background: rgba(10,14,26,0.98);
          padding: 20px; overflow-y: auto;
          animation: slide-in 0.3s ease;
          z-index: 10;
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .setting-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .setting-label { font-size: 13px; color: rgba(255,255,255,0.7); }
        .setting-desc { font-size: 10px; color: rgba(255,255,255,0.3); margin-top: 2px; }
        .toggle {
          width: 44px; height: 24px; border-radius: 12px;
          cursor: pointer; position: relative; transition: all 0.3s;
        }
        .quick-actions {
          display: flex; gap: 6px; flex-wrap: wrap;
          padding: 8px 20px 0;
        }
        .quick-btn {
          padding: 5px 10px; border-radius: 8px;
          border: 1px solid rgba(0,180,255,0.15);
          background: rgba(0,180,255,0.04);
          color: rgba(0,180,255,0.6); font-size: 10px;
          cursor: pointer; transition: all 0.2s;
          font-family: var(--font-body);
        }
        .quick-btn:hover { background: rgba(0,180,255,0.1); color: #00b4ff; }
        .processing-indicator {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 20px; color: rgba(255,214,10,0.6);
          font-size: 11px; font-family: var(--font-arcade);
        }
        .processing-dots span {
          display: inline-block; width: 4px; height: 4px; border-radius: 50%;
          background: #ffd60a; margin: 0 2px;
          animation: dot-bounce 1.4s ease-in-out infinite;
        }
        .processing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .processing-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @media (max-width: 480px) {
          .jarvis-panel { width: 100vw; }
        }
      `}</style>

      {/* Overlay */}
      <div className="jarvis-overlay" onClick={onClose} />

      {/* Panel */}
      <div className="jarvis-panel">
        {/* Header */}
        <div className="jarvis-header">
          <div className="jarvis-title">
            <div className="jarvis-status" />
            <h2>JARVIS</h2>
            <span style={{ fontSize: '9px', color: 'rgba(0,180,255,0.4)', fontFamily: 'var(--font-arcade)' }}>v1.0</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="jarvis-close" onClick={() => setShowSettings(!showSettings)} title="Settings">⚙</button>
            <button className="jarvis-close" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* HUD */}
        <div className="jarvis-hud">
          <div className="hud-item"><div className="hud-dot" /> {currentTime}</div>
          <div className="hud-item"><div className="hud-dot" style={{ background: processing ? '#ffd60a' : '#2eeba8' }} /> {processing ? 'PROCESSING' : 'ONLINE'}</div>
          <div className="hud-item"><div className="hud-dot" style={{ background: listening ? '#ff4d6a' : speaking ? '#2eeba8' : undefined }} /> {listening ? 'LISTENING' : speaking ? 'SPEAKING' : 'READY'}</div>
        </div>

        {/* Quick Actions */}
        {!processing && (
          <div className="quick-actions">
            <button className="quick-btn" onClick={() => handleSend('Open the menu')}>🍽️ Menu</button>
            <button className="quick-btn" onClick={() => handleSend('Show my rewards')}>🪙 Rewards</button>
            <button className="quick-btn" onClick={() => handleSend('Open untold words')}>💌 Letters</button>
            <button className="quick-btn" onClick={() => handleSend('Open my profile')}>👤 Profile</button>
            <button className="quick-btn" onClick={() => handleSend('What time is it?')}>⏰ Time</button>
            <button className="quick-btn" onClick={() => handleSend('Help me')}>❓ Help</button>
          </div>
        )}

        {/* Orb */}
        <div className="jarvis-orb-area">
          <div className="jarvis-orb" ref={coreRef} onClick={toggleVoice}>
            <div className="orb-ring" />
            <div className="orb-ring-2" />
            <div className={`orb-core ${listening ? 'listening' : speaking ? 'speaking' : processing ? 'processing' : ''}`} />
            <div className="orb-particles">
              <div className="particle" /><div className="particle" /><div className="particle" />
              <div className="particle" /><div className="particle" />
            </div>
          </div>
        </div>

        {/* Processing indicator */}
        {processing && (
          <div className="processing-indicator">
            <div className="processing-dots"><span /><span /><span /></div>
            Analyzing your request...
          </div>
        )}

        {/* Settings panel (overlay) */}
        {showSettings && (
          <div className="settings-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#00b4ff', margin: 0 }}>SETTINGS</h3>
              <button className="jarvis-close" onClick={() => setShowSettings(false)}>✕</button>
            </div>

            <div className="setting-item">
              <div>
                <div className="setting-label">Voice Output</div>
                <div className="setting-desc">JARVIS speaks responses aloud</div>
              </div>
              <button className="toggle" style={{ background: voiceEnabled ? 'rgba(0,180,255,0.3)' : 'rgba(255,255,255,0.1)', borderColor: voiceEnabled ? 'rgba(0,180,255,0.5)' : 'rgba(255,255,255,0.15)' }} onClick={() => setVoiceEnabled(!voiceEnabled)}>
                <div style={{ position: 'absolute', top: '2px', left: voiceEnabled ? '22px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: voiceEnabled ? '#00b4ff' : 'rgba(255,255,255,0.4)', transition: 'all 0.3s' }} />
              </button>
            </div>

            <div className="setting-item">
              <div>
                <div className="setting-label">Memory</div>
                <div className="setting-desc">Remember conversation context</div>
              </div>
              <button className="toggle" style={{ background: memoryEnabled ? 'rgba(0,180,255,0.3)' : 'rgba(255,255,255,0.1)', borderColor: memoryEnabled ? 'rgba(0,180,255,0.5)' : 'rgba(255,255,255,0.15)' }} onClick={() => setMemoryEnabled(!memoryEnabled)}>
                <div style={{ position: 'absolute', top: '2px', left: memoryEnabled ? '22px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: memoryEnabled ? '#00b4ff' : 'rgba(255,255,255,0.4)', transition: 'all 0.3s' }} />
              </button>
            </div>

            <div className="setting-item">
              <div>
                <div className="setting-label">Clear History</div>
                <div className="setting-desc">Remove all conversation messages</div>
              </div>
              <button className="jarvis-close" onClick={() => { setMessages([]); }} style={{ fontSize: '10px', padding: '6px 12px', color: '#ff4d6a', borderColor: 'rgba(255,77,106,0.3)' }}>Clear</button>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', borderRadius: '12px', border: '1px solid rgba(0,180,255,0.1)', background: 'rgba(0,180,255,0.03)' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(0,180,255,0.5)', marginBottom: '8px' }}>CAPABILITIES</p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.8 }}>
                🗺️ Navigate pages<br />
                🔍 Search content<br />
                ℹ️ Answer questions<br />
                ✉️ Create letters & confessions<br />
                ⚡ Execute actions<br />
                ⏰ Tell time<br />
                🎤 Voice input<br />
                🔊 Voice output
              </p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="jarvis-messages">
          {messages.map(msg => (
            <div key={msg.id} className={`msg ${msg.role === 'user' ? 'msg-user' : 'msg-jarvis'}`}>
              {msg.role === 'jarvis' && msg.action && (
                <div className="intent-badge">
                  {intentIcons[msg.action === 'navigate' ? 'NAVIGATION' : msg.action === 'search' ? 'SEARCH' : 'SYSTEM'] || '🤖'}
                  {msg.action}
                </div>
              )}
              <div>{renderText(msg.text)}</div>
              {msg.role === 'jarvis' && msg.action === 'navigate' && msg.actionParams?.path && (
                <button className="action-btn" onClick={() => handleAction(msg.action!, msg.actionParams)}>
                  → Go there now
                </button>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="jarvis-input-area">
          <div className="input-row">
            <button className={`voice-btn ${listening ? 'listening' : ''}`} onClick={toggleVoice} title={listening ? 'Stop listening' : 'Voice input'}>
              {listening ? '🔴' : '🎤'}
            </button>
            <input
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={listening ? 'Listening...' : 'Ask JARVIS anything...'}
              disabled={processing}
            />
            <button className="send-btn" onClick={() => handleSend()} disabled={!input.trim() || processing}>
              {processing ? '⏳' : '→'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
