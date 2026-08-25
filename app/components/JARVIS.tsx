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
  task?: { title: string; steps: string[] };
  timestamp: Date;
}

interface Memory {
  _id: string; key: string; value: string; category: string; updatedAt: string;
}

interface Task {
  _id: string; title: string; status: string; type: string;
  logs: Array<{ step: string; status: string; message: string; timestamp: string }>;
  result: string; createdAt: string; completedAt?: string;
}

type Panel = 'chat' | 'memory' | 'tasks' | 'privacy' | 'operator' | 'history';

interface JarvisProps {
  open: boolean;
  onClose: () => void;
  mode?: 'panel' | 'floating';
}

const intentIcons: Record<string, string> = {
  NAVIGATION: '🗺️', SEARCH: '🔍', INFORMATION: 'ℹ️', CREATION: '✉️',
  ACTION: '⚡', SYSTEM: '⏰', SCREEN_CONTEXT: '📄', AGENT: '🤖',
  MEMORY: '🧠', OPERATOR: '🔧', UNKNOWN: '❓',
};

// ─── Main Component ──────────────────────────────────────────
export function JARVIS({ open, onClose, mode = 'panel' }: JarvisProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [panel, setPanel] = useState<Panel>('chat');
  const [pulseIntensity, setPulseIntensity] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);

  // Settings
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [screenContextEnabled, setScreenContextEnabled] = useState(false);
  const [proactiveEnabled, setProactiveEnabled] = useState(true);

  // Data
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [commandHistory, setCommandHistory] = useState<Array<{ command: string; result: string; timestamp: string }>>([]);
  const [systemStatus, setSystemStatus] = useState<Record<string, unknown> | null>(null);
  const [currentTask, setCurrentTask] = useState<{ title: string; currentStep: number; steps: string[] } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  const userId = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    try { const u = localStorage.getItem('user'); return u ? JSON.parse(u).userId : undefined; } catch { return undefined; }
  }, []);

  // ─── Mobile detection ────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ─── Mouse tracking ─────────────────────────────────────
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      if (!coreRef.current) return;
      const rect = coreRef.current.getBoundingClientRect();
      setMousePos({
        x: (e.clientX - (rect.left + rect.width / 2)) / rect.width,
        y: (e.clientY - (rect.top + rect.height / 2)) / rect.height,
      });
    };
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  // ─── Keyboard shortcut: Ctrl+/ or Cmd+/ ─────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        if (open) onClose(); else {
          // Will be handled by parent
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // ─── Welcome message ────────────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0) {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      setMessages([{
        id: 'welcome',
        role: 'jarvis',
        text: `${greeting}. I'm **JARVIS v2.0** — your intelligent operating assistant.\n\nI can navigate, search, create, remember, analyze pages, and manage tasks.\n\nHow can I assist you?`,
        intent: 'INFORMATION',
        timestamp: new Date(),
      }]);
    }
  }, [open, messages.length]);

  // ─── Auto-scroll ────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Focus input ────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // ─── Speech Recognition ─────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
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

  // ─── Load data ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [memRes, taskRes] = await Promise.all([
        fetch(`/api/jarvis/memory?userId=${userId}`),
        fetch(`/api/jarvis/tasks?userId=${userId}`),
      ]);
      const memData = await memRes.json();
      const taskData = await taskRes.json();
      if (memData.success) setMemories(memData.data);
      if (taskData.success) setTasks(taskData.data);
    } catch { /* empty */ }
  }, [userId]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  // ─── Voice output ───────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !synthRef.current) return;
    synthRef.current.cancel();
    const clean = text.replace(/[*#\n]/g, ' ').replace(/\s+/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1;
    utterance.pitch = 0.9;
    utterance.volume = 0.8;
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Samantha'));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    synthRef.current.speak(utterance);
  }, [voiceEnabled]);

  // ─── Get screen context ─────────────────────────────────
  const getScreenContext = useCallback(() => {
    if (!screenContextEnabled) return undefined;
    try {
      const title = document.title;
      const url = window.location.pathname;
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map(h => h.textContent?.trim()).filter(Boolean).slice(0, 5);
      const cards = Array.from(document.querySelectorAll('[class*="card"],[style*="border-radius"]')).length;
      const text = document.body?.innerText?.substring(0, 1500) || '';
      return `Page: ${title} (${url})\nHeadings: ${headings.join(', ')}\nCards/Elements: ${cards}\nContent preview: ${text.substring(0, 800)}`;
    } catch { return undefined; }
  }, [screenContextEnabled]);

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

    // Save to command history
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
        const jarvisMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'jarvis',
          text: result.data.response,
          intent: result.data.intent,
          action: result.data.action,
          actionParams: result.data.actionParams,
          cards: result.data.cards,
          buttons: result.data.buttons,
          task: result.data.task,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, jarvisMsg]);
        speak(result.data.response);

        // Update command history with result
        setCommandHistory(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[0] = { ...updated[0], result: result.data.response.substring(0, 200) };
          }
          return updated;
        });

        // Execute actions
        if (result.data.action === 'navigate' && result.data.actionParams?.path && result.data.actionParams.path !== '#') {
          setTimeout(() => { router.push(result.data.actionParams.path); onClose(); }, 1200);
        } else if (result.data.action === 'logout') {
          setTimeout(() => { localStorage.removeItem('user'); router.push('/login'); onClose(); }, 1200);
        } else if (result.data.action === 'search' && result.data.actionParams?.query) {
          setTimeout(() => { router.push(`/untold-words?q=${encodeURIComponent(result.data.actionParams.query)}`); onClose(); }, 1200);
        } else if (result.data.action === 'health-check') {
          // Fetch system status
          try {
            const statusRes = await fetch('/api/jarvis/status');
            const statusData = await statusRes.json();
            if (statusData.success) setSystemStatus(statusData.data);
          } catch { /* empty */ }
        } else if (result.data.action === 'show-memory') {
          setPanel('memory');
        } else if (result.data.action === 'save-memory' && result.data.actionParams?.content && userId) {
          try {
            await fetch('/api/jarvis/memory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, key: result.data.actionParams.content.substring(0, 100), value: result.data.actionParams.content, category: 'context' }),
            });
            loadData();
          } catch { /* empty */ }
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'jarvis',
        text: 'AI connection unavailable. Please try again shortly.',
        timestamp: new Date(),
      }]);
    }

    setProcessing(false);
    setPulseIntensity(0);
  }, [userId, getScreenContext, router, onClose, speak, loadData]);

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
    if (listening) { recognitionRef.current.stop(); setListening(false); }
    else { synthRef.current?.cancel(); setSpeaking(false); recognitionRef.current.start(); setListening(true); }
  }, [listening]);

  // ─── Action handler ─────────────────────────────────────
  const handleAction = useCallback((action: string, params?: Record<string, string>) => {
    if (action === 'navigate' && params?.path) { router.push(params.path); onClose(); }
    else if (action === 'search' && params?.query) { router.push(`/untold-words?q=${encodeURIComponent(params.query)}`); onClose(); }
    else if (action === 'health-check') { processMessage('Run a full health check'); }
  }, [router, onClose, processMessage]);

  // ─── Delete memory ──────────────────────────────────────
  const deleteMemory = useCallback(async (id: string) => {
    if (!userId) return;
    await fetch(`/api/jarvis/memory?userId=${userId}&id=${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m._id !== id));
  }, [userId]);

  const clearAllMemories = useCallback(async () => {
    if (!userId) return;
    await fetch(`/api/jarvis/memory?userId=${userId}&clearAll=true`, { method: 'DELETE' });
    setMemories([]);
  }, [userId]);

  // ─── Clear tasks ────────────────────────────────────────
  const clearAllTasks = useCallback(async () => {
    if (!userId) return;
    await fetch(`/api/jarvis/tasks?userId=${userId}`, { method: 'DELETE' });
    setTasks([]);
  }, [userId]);

  // ─── Render markdown-lite ───────────────────────────────
  const renderText = (text: string) => {
    return text.split('\n').map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const rendered: React.ReactNode[] = [];
      parts.forEach((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          rendered.push(<strong key={j} style={{ color: '#ffd60a' }}>{part.slice(2, -2)}</strong>);
        } else if (part) {
          rendered.push(<span key={j}>{part}</span>);
        }
      });
      return <p key={i} style={{ margin: '3px 0', lineHeight: 1.6 }}>{rendered}</p>;
    });
  };

  if (!open) return null;

  const orbClass = listening ? 'listening' : speaking ? 'speaking' : processing ? 'processing' : '';
  const statusText = processing ? 'PROCESSING' : listening ? 'LISTENING' : speaking ? 'SPEAKING' : 'READY';
  const statusColor = processing ? '#ffd60a' : listening ? '#ff4d6a' : speaking ? '#2eeba8' : '#00b4ff';

  return (
    <>
      <style jsx>{`
        .jarvis-overlay {
          position: fixed; inset: 0; z-index: 9998;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
        }
        .jarvis-panel {
          position: fixed; top: 0; right: 0; bottom: 0;
          width: min(520px, 100vw); z-index: 9999;
          background: linear-gradient(180deg, #080c18 0%, #0b1020 50%, #080c18 100%);
          border-left: 1px solid rgba(0,180,255,0.12);
          box-shadow: -8px 0 60px rgba(0,100,255,0.08);
          display: flex; flex-direction: column;
        }
        .jarvis-mobile {
          position: fixed; left: 0; right: 0; bottom: 0;
          width: 100vw; height: 85vh; z-index: 9999;
          background: linear-gradient(180deg, #080c18 0%, #0b1020 50%, #080c18 100%);
          border-top: 1px solid rgba(0,180,255,0.12);
          border-radius: 20px 20px 0 0;
          display: flex; flex-direction: column;
        }
        .mobile-handle {
          width: 40px; height: 4px; border-radius: 2px;
          background: rgba(255,255,255,0.2); margin: 10px auto 6px; flex-shrink: 0;
        }
        .jarvis-header {
          padding: 12px 16px; flex-shrink: 0;
          border-bottom: 1px solid rgba(0,180,255,0.1);
          background: rgba(5,10,25,0.8);
        }
        .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .header-title { display: flex; align-items: center; gap: 8px; }
        .header-title h2 { font-family: var(--font-arcade); font-size: 11px; color: #00b4ff; letter-spacing: 0.2em; margin: 0; }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 8px ${statusColor}; animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.3)} }
        .hdr-btn { width: 30px; height: 30px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .hdr-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .hdr-btn.active { background: rgba(0,180,255,0.12); color: #00b4ff; border-color: rgba(0,180,255,0.3); }
        .panel-tabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
        .panel-tabs::-webkit-scrollbar { display: none; }
        .tab-btn { padding: 5px 10px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: rgba(255,255,255,0.35); font-size: 10px; cursor: pointer; white-space: nowrap; transition: all 0.15s; font-family: var(--font-arcade); }
        .tab-btn:hover { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.04); }
        .tab-btn.active { color: #00b4ff; background: rgba(0,180,255,0.08); border-color: rgba(0,180,255,0.2); }
        .jarvis-hud { padding: 8px 16px; display: flex; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid rgba(0,180,255,0.06); background: rgba(5,10,25,0.5); flex-shrink: 0; }
        .hud-item { display: flex; align-items: center; gap: 5px; font-size: 9px; color: rgba(0,180,255,0.5); font-family: var(--font-arcade); }
        .hud-dot { width: 4px; height: 4px; border-radius: 50%; }
        .orb-area { display: flex; justify-content: center; align-items: center; padding: 16px 0 8px; flex-shrink: 0; }
        .orb-wrap { width: 72px; height: 72px; border-radius: 50%; position: relative; cursor: pointer; transition: transform 0.3s; }
        .orb-wrap:hover { transform: scale(1.05); }
        .orb-core { position: absolute; inset: 10px; border-radius: 50%; background: radial-gradient(circle at ${50 + mousePos.x * 20}% ${50 + mousePos.y * 20}%, #00e5ff, #0066ff, #003399); box-shadow: 0 0 ${18 + pulseIntensity * 25}px rgba(0,180,255,${0.25 + pulseIntensity * 0.35}); animation: orb-idle 3s ease-in-out infinite; transition: box-shadow 0.5s, background 0.5s; }
        .orb-core.listening { background: radial-gradient(circle, #ff4d6a, #cc0033, #990033); box-shadow: 0 0 25px rgba(255,77,106,0.5); animation: orb-listen 0.8s ease-in-out infinite; }
        .orb-core.speaking { background: radial-gradient(circle, #2eeba8, #00cc88, #009966); box-shadow: 0 0 25px rgba(46,235,168,0.5); animation: orb-speak 0.5s ease-in-out infinite; }
        .orb-core.processing { background: radial-gradient(circle, #ffd60a, #ff9900, #cc6600); box-shadow: 0 0 25px rgba(255,214,10,0.5); animation: orb-process 1s linear infinite; }
        @keyframes orb-idle { 0%,100%{transform:scale(1)} 50%{transform:scale(1.02)} }
        @keyframes orb-listen { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes orb-speak { 0%,100%{transform:scale(1)} 25%{transform:scale(1.04)} 75%{transform:scale(0.97)} }
        @keyframes orb-process { 0%{transform:rotate(0deg) scale(1)} 50%{transform:rotate(180deg) scale(1.04)} 100%{transform:rotate(360deg) scale(1)} }
        .orb-ring { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid rgba(0,180,255,0.15); animation: ring-spin 20s linear infinite; }
        .orb-ring2 { position: absolute; inset: -5px; border-radius: 50%; border: 1px dashed rgba(0,180,255,0.08); animation: ring-spin 30s linear infinite reverse; }
        @keyframes ring-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        .particles { position: absolute; inset: -16px; pointer-events: none; }
        .particle { position: absolute; width: 2px; height: 2px; border-radius: 50%; background: rgba(0,180,255,0.35); animation: p-float 4s ease-in-out infinite; }
        .particle:nth-child(1){top:10%;left:20%;animation-delay:0s} .particle:nth-child(2){top:30%;right:15%;animation-delay:.8s} .particle:nth-child(3){bottom:20%;left:10%;animation-delay:1.6s} .particle:nth-child(4){bottom:30%;right:20%;animation-delay:2.4s}
        @keyframes p-float { 0%,100%{opacity:.3;transform:translateY(0)} 50%{opacity:.7;transform:translateY(-8px)} }
        .messages { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; scrollbar-color: rgba(0,180,255,0.15) transparent; min-height: 0; }
        .msg { max-width: 88%; padding: 10px 14px; border-radius: 14px; font-size: 13px; line-height: 1.55; animation: msg-in 0.25s ease-out; }
        @keyframes msg-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .msg-user { align-self: flex-end; background: rgba(0,180,255,0.1); border: 1px solid rgba(0,180,255,0.18); color: #d0d8e0; }
        .msg-jarvis { align-self: flex-start; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); color: #b0b8c0; }
        .intent-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 8px; color: rgba(0,180,255,0.5); font-family: var(--font-arcade); margin-bottom: 5px; padding: 2px 7px; background: rgba(0,180,255,0.05); border-radius: 5px; border: 1px solid rgba(0,180,255,0.08); }
        .action-btn { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; padding: 7px 14px; border-radius: 9px; border: 1px solid rgba(0,180,255,0.25); background: rgba(0,180,255,0.06); color: #00b4ff; font-family: var(--font-arcade); font-size: 9px; cursor: pointer; transition: all 0.2s; }
        .action-btn:hover { background: rgba(0,180,255,0.12); transform: translateY(-1px); }
        .cards-row { display: flex; gap: 8px; overflow-x: auto; padding: 6px 0; scrollbar-width: none; }
        .cards-row::-webkit-scrollbar { display: none; }
        .mini-card { flex-shrink: 0; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(0,180,255,0.12); background: rgba(0,180,255,0.04); min-width: 140px; cursor: pointer; transition: all 0.2s; }
        .mini-card:hover { background: rgba(0,180,255,0.08); transform: translateY(-1px); }
        .mini-card-title { font-family: var(--font-arcade); font-size: 9px; color: #00b4ff; margin-bottom: 4px; }
        .mini-card-desc { font-size: 11px; color: rgba(255,255,255,0.4); line-height: 1.4; }
        .task-timeline { margin-top: 10px; padding: 10px; border-radius: 10px; background: rgba(0,180,255,0.04); border: 1px solid rgba(0,180,255,0.1); }
        .task-step { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 11px; }
        .task-step-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .quick-actions { display: flex; gap: 5px; flex-wrap: wrap; padding: 6px 16px 0; flex-shrink: 0; }
        .quick-btn { padding: 4px 9px; border-radius: 7px; border: 1px solid rgba(0,180,255,0.12); background: rgba(0,180,255,0.03); color: rgba(0,180,255,0.5); font-size: 10px; cursor: pointer; transition: all 0.15s; font-family: var(--font-body); }
        .quick-btn:hover { background: rgba(0,180,255,0.08); color: #00b4ff; }
        .processing-bar { display: flex; align-items: center; gap: 8px; padding: 6px 16px; color: rgba(255,214,10,0.6); font-size: 10px; font-family: var(--font-arcade); flex-shrink: 0; }
        .dots span { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: #ffd60a; margin: 0 2px; animation: dot-bounce 1.4s ease-in-out infinite; }
        .dots span:nth-child(2){animation-delay:.2s} .dots span:nth-child(3){animation-delay:.4s}
        @keyframes dot-bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        .input-area { padding: 10px 16px 14px; border-top: 1px solid rgba(0,180,255,0.08); background: rgba(5,10,25,0.6); flex-shrink: 0; }
        .input-row { display: flex; gap: 7px; align-items: center; }
        .mic-btn { width: 40px; height: 40px; border-radius: 11px; border: 1.5px solid ${listening ? 'rgba(255,77,106,0.4)' : 'rgba(0,180,255,0.15)'}; background: ${listening ? 'rgba(255,77,106,0.08)' : 'rgba(0,180,255,0.04)'}; color: ${listening ? '#ff4d6a' : '#00b4ff'}; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
        .mic-btn.listening { animation: mic-pulse 1s ease-in-out infinite; }
        @keyframes mic-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,77,106,0.3)} 50%{box-shadow:0 0 0 7px rgba(255,77,106,0)} }
        .chat-input { flex: 1; height: 40px; padding: 0 12px; border-radius: 11px; border: 1.5px solid rgba(0,180,255,0.12); background: rgba(5,10,25,0.5); color: #d0d8e0; font-size: 13px; outline: none; font-family: var(--font-body); transition: border-color 0.2s; }
        .chat-input:focus { border-color: rgba(0,180,255,0.35); }
        .chat-input::placeholder { color: rgba(255,255,255,0.18); }
        .send-btn { width: 40px; height: 40px; border-radius: 11px; border: 1.5px solid rgba(0,180,255,0.25); background: rgba(0,180,255,0.08); color: #00b4ff; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
        .send-btn:hover { background: rgba(0,180,255,0.15); }
        .send-btn:disabled { opacity: 0.25; cursor: not-allowed; }
        .screen-toggle { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; border: 1px solid ${screenContextEnabled ? 'rgba(46,235,168,0.3)' : 'rgba(255,255,255,0.08)'}; background: ${screenContextEnabled ? 'rgba(46,235,168,0.08)' : 'transparent'}; color: ${screenContextEnabled ? '#2eeba8' : 'rgba(255,255,255,0.3)'}; font-size: 10px; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
        .screen-toggle:hover { background: rgba(46,235,168,0.06); }
        .mem-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); margin-bottom: 6px; }
        .mem-key { font-family: var(--font-arcade); font-size: 9px; color: #00b4ff; margin-bottom: 2px; }
        .mem-val { font-size: 12px; color: rgba(255,255,255,0.5); }
        .mem-del { background: none; border: none; color: rgba(255,77,106,0.5); cursor: pointer; font-size: 14px; padding: 4px; }
        .mem-del:hover { color: #ff4d6a; }
        .task-item { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); margin-bottom: 6px; }
        .task-title { font-family: var(--font-arcade); font-size: 9px; margin-bottom: 4px; }
        .task-status { font-size: 10px; padding: 2px 8px; border-radius: 6px; display: inline-block; }
        .hist-item { padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04); background: rgba(255,255,255,0.015); margin-bottom: 4px; }
        .hist-cmd { font-size: 12px; color: rgba(255,255,255,0.6); }
        .hist-time { font-size: 9px; color: rgba(255,255,255,0.2); margin-top: 2px; }
        .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .section-title { font-family: var(--font-arcade); font-size: 10px; color: #00b4ff; letter-spacing: 0.1em; }
        .section-action { font-size: 10px; color: rgba(255,77,106,0.5); cursor: pointer; background: none; border: none; }
        .section-action:hover { color: #ff4d6a; }
        .privacy-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .privacy-label { font-size: 13px; color: rgba(255,255,255,0.6); }
        .privacy-desc { font-size: 10px; color: rgba(255,255,255,0.25); margin-top: 2px; }
        .toggle-sm { width: 40px; height: 22px; border-radius: 11px; cursor: pointer; position: relative; transition: all 0.3s; border: 1px solid; }
        .toggle-knob { position: absolute; top: 2px; width: 16px; height: 16px; border-radius: 50%; transition: all 0.3s; }
        .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
        .status-card { padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
        .status-card-label { font-family: var(--font-arcade); font-size: 8px; color: rgba(255,255,255,0.3); margin-bottom: 4px; }
        .status-card-value { font-size: 12px; font-weight: 600; }
        .empty-state { text-align: center; padding: 32px 16px; color: rgba(255,255,255,0.25); font-size: 12px; }
        .scroll-content { flex: 1; overflow-y: auto; padding: 16px; scrollbar-width: thin; scrollbar-color: rgba(0,180,255,0.15) transparent; min-height: 0; }
        @media (max-width: 768px) {
          .jarvis-panel { width: 100vw; }
          .orb-wrap { width: 60px; height: 60px; }
          .msg { max-width: 92%; }
        }
      `}</style>

      <div className="jarvis-overlay" onClick={onClose} />

      <div className={isMobile ? 'jarvis-mobile' : 'jarvis-panel'}>
        {isMobile && <div className="mobile-handle" />}

        {/* Header */}
        <div className="jarvis-header">
          <div className="header-top">
            <div className="header-title">
              <div className="status-dot" />
              <h2>JARVIS</h2>
              <span style={{ fontSize: '8px', color: 'rgba(0,180,255,0.35)', fontFamily: 'var(--font-arcade)' }}>v2.0</span>
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button className="hdr-btn" onClick={() => setPanel(panel === 'operator' ? 'chat' : 'operator')} title="Operator" style={panel === 'operator' ? { background: 'rgba(0,180,255,0.12)', color: '#00b4ff', borderColor: 'rgba(0,180,255,0.3)' } : {}}>🔧</button>
              <button className="hdr-btn" onClick={onClose}>✕</button>
            </div>
          </div>
          <div className="panel-tabs">
            {(['chat', 'memory', 'tasks', 'history', 'privacy'] as Panel[]).map(p => (
              <button key={p} className={`tab-btn ${panel === p ? 'active' : ''}`} onClick={() => setPanel(p)}>
                {p === 'chat' ? '💬 Chat' : p === 'memory' ? '🧠 Memory' : p === 'tasks' ? '📋 Tasks' : p === 'history' ? '📜 History' : '🔒 Privacy'}
              </button>
            ))}
          </div>
        </div>

        {/* HUD */}
        <div className="jarvis-hud">
          <div className="hud-item"><div className="hud-dot" style={{ background: statusColor }} /> {statusText}</div>
          <div className="hud-item"><div className="hud-dot" style={{ background: screenContextEnabled ? '#2eeba8' : 'rgba(255,255,255,0.15)' }} /> CTX:{screenContextEnabled ? 'ON' : 'OFF'}</div>
          <div className="hud-item"><div className="hud-dot" style={{ background: memoryEnabled ? '#00b4ff' : 'rgba(255,255,255,0.15)' }} /> MEM:{memoryEnabled ? 'ON' : 'OFF'}</div>
        </div>

        {/* ─── CHAT PANEL ────────────────────────────────── */}
        {panel === 'chat' && (
          <>
            {/* Orb */}
            <div className="orb-area">
              <div className="orb-wrap" ref={coreRef} onClick={toggleVoice}>
                <div className="orb-ring" />
                <div className="orb-ring2" />
                <div className={`orb-core ${orbClass}`} />
                <div className="particles">
                  <div className="particle" /><div className="particle" /><div className="particle" /><div className="particle" />
                </div>
              </div>
            </div>

            {/* Quick actions */}
            {!processing && (
              <div className="quick-actions">
                <button className="quick-btn" onClick={() => handleSend('Open the menu')}>🍽️ Menu</button>
                <button className="quick-btn" onClick={() => handleSend('Show my rewards')}>🪙 Rewards</button>
                <button className="quick-btn" onClick={() => handleSend('Open untold words')}>💌 Letters</button>
                <button className="quick-btn" onClick={() => handleSend('What time is it?')}>⏰ Time</button>
                <button className="quick-btn" onClick={() => handleSend('Run health check')}>🔧 Status</button>
                <button className="quick-btn" onClick={() => handleSend('Help me')}>❓ Help</button>
              </div>
            )}

            {processing && (
              <div className="processing-bar">
                <div className="dots"><span /><span /><span /></div>
                {currentTask ? currentTask.steps[currentTask.currentStep] : 'Analyzing...'}
              </div>
            )}

            {/* Messages */}
            <div className="messages">
              {messages.map(msg => (
                <div key={msg.id} className={`msg ${msg.role === 'user' ? 'msg-user' : 'msg-jarvis'}`}>
                  {msg.role === 'jarvis' && msg.intent && (
                    <div className="intent-badge">{intentIcons[msg.intent] || '🤖'} {msg.intent}</div>
                  )}
                  <div>{renderText(msg.text)}</div>

                  {/* Cards */}
                  {msg.cards && msg.cards.length > 0 && (
                    <div className="cards-row">
                      {msg.cards.map((card, i) => (
                        <div key={i} className="mini-card" onClick={() => card.action && handleAction(card.action, card.actionParams)}>
                          <div className="mini-card-title">{card.title}</div>
                          <div className="mini-card-desc">{card.description}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  {msg.buttons && msg.buttons.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {msg.buttons.map((btn, i) => (
                        <button key={i} className="action-btn" onClick={() => handleAction(btn.action, btn.actionParams)}>
                          → {btn.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Agent task timeline */}
                  {msg.task && (
                    <div className="task-timeline">
                      <div style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', marginBottom: '6px' }}>
                        📋 {msg.task.title}
                      </div>
                      {msg.task.steps.map((step, i) => (
                        <div key={i} className="task-step">
                          <div className="task-step-dot" style={{ background: i <= 1 ? '#2eeba8' : 'rgba(255,255,255,0.15)' }} />
                          <span style={{ color: i <= 1 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)', fontSize: '11px' }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="input-area">
              <div className="input-row">
                <button className={`mic-btn ${listening ? 'listening' : ''}`} onClick={toggleVoice} title="Voice input">
                  {listening ? '🔴' : '🎤'}
                </button>
                <button className="screen-toggle" onClick={() => setScreenContextEnabled(!screenContextEnabled)} title="Screen context">
                  📄 {screenContextEnabled ? 'ON' : 'OFF'}
                </button>
                <input ref={inputRef} className="chat-input" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder={listening ? 'Listening...' : 'Ask JARVIS anything...'} disabled={processing} />
                <button className="send-btn" onClick={() => handleSend()} disabled={!input.trim() || processing}>
                  {processing ? '⏳' : '→'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── MEMORY PANEL ──────────────────────────────── */}
        {panel === 'memory' && (
          <div className="scroll-content">
            <div className="section-header">
              <div className="section-title">🧠 MEMORY CENTER</div>
              <button className="section-action" onClick={clearAllMemories}>Clear All</button>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>
              JARVIS remembers your preferences and context across sessions.
            </p>
            {memories.length === 0 ? (
              <div className="empty-state">No memories yet. Tell me something to remember!</div>
            ) : (
              memories.map(mem => (
                <div key={mem._id} className="mem-item">
                  <div>
                    <div className="mem-key">{mem.category?.toUpperCase() || 'CONTEXT'}</div>
                    <div className="mem-val">{mem.value}</div>
                  </div>
                  <button className="mem-del" onClick={() => deleteMemory(mem._id)}>✕</button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── TASKS PANEL ───────────────────────────────── */}
        {panel === 'tasks' && (
          <div className="scroll-content">
            <div className="section-header">
              <div className="section-title">📋 TASK CENTER</div>
              <button className="section-action" onClick={clearAllTasks}>Clear All</button>
            </div>
            {tasks.length === 0 ? (
              <div className="empty-state">No tasks yet. Ask JARVIS to plan something!</div>
            ) : (
              tasks.map(task => (
                <div key={task._id} className="task-item">
                  <div className="task-title" style={{
                    color: task.status === 'completed' ? '#2eeba8' : task.status === 'failed' ? '#ff4d6a' : task.status === 'running' ? '#ffd60a' : 'rgba(255,255,255,0.5)',
                  }}>{task.title}</div>
                  <div className="task-status" style={{
                    background: task.status === 'completed' ? 'rgba(46,235,168,0.1)' : task.status === 'failed' ? 'rgba(255,77,106,0.1)' : 'rgba(255,214,10,0.1)',
                    color: task.status === 'completed' ? '#2eeba8' : task.status === 'failed' ? '#ff4d6a' : '#ffd60a',
                    border: `1px solid ${task.status === 'completed' ? 'rgba(46,235,168,0.2)' : task.status === 'failed' ? 'rgba(255,77,106,0.2)' : 'rgba(255,214,10,0.2)'}`,
                  }}>{task.status.toUpperCase()}</div>
                  {task.logs.length > 0 && (
                    <div style={{ marginTop: '6px' }}>
                      {task.logs.map((log, i) => (
                        <div key={i} style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', padding: '2px 0' }}>
                          {log.status === 'completed' ? '✓' : log.status === 'failed' ? '✗' : '○'} {log.step}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── HISTORY PANEL ─────────────────────────────── */}
        {panel === 'history' && (
          <div className="scroll-content">
            <div className="section-header">
              <div className="section-title">📜 COMMAND HISTORY</div>
              <button className="section-action" onClick={() => setCommandHistory([])}>Clear</button>
            </div>
            {commandHistory.length === 0 ? (
              <div className="empty-state">No commands yet.</div>
            ) : (
              commandHistory.map((cmd, i) => (
                <div key={i} className="hist-item">
                  <div className="hist-cmd">→ {cmd.command}</div>
                  {cmd.result && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '3px' }}>{cmd.result.substring(0, 120)}...</div>}
                  <div className="hist-time">{new Date(cmd.timestamp).toLocaleTimeString()}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── PRIVACY PANEL ─────────────────────────────── */}
        {panel === 'privacy' && (
          <div className="scroll-content">
            <div className="section-title" style={{ marginBottom: '16px' }}>🔒 PRIVACY CENTER</div>

            <div className="privacy-item">
              <div>
                <div className="privacy-label">🎤 Microphone</div>
                <div className="privacy-desc">Voice input via Web Speech API</div>
              </div>
              <div className="toggle-sm" style={{ background: voiceEnabled ? 'rgba(0,180,255,0.3)' : 'rgba(255,255,255,0.08)', borderColor: voiceEnabled ? 'rgba(0,180,255,0.4)' : 'rgba(255,255,255,0.12)' }} onClick={() => setVoiceEnabled(!voiceEnabled)}>
                <div className="toggle-knob" style={{ left: voiceEnabled ? '20px' : '2px', background: voiceEnabled ? '#00b4ff' : 'rgba(255,255,255,0.35)' }} />
              </div>
            </div>

            <div className="privacy-item">
              <div>
                <div className="privacy-label">📄 Screen Context</div>
                <div className="privacy-desc">Read current page content for analysis</div>
              </div>
              <div className="toggle-sm" style={{ background: screenContextEnabled ? 'rgba(46,235,168,0.3)' : 'rgba(255,255,255,0.08)', borderColor: screenContextEnabled ? 'rgba(46,235,168,0.4)' : 'rgba(255,255,255,0.12)' }} onClick={() => setScreenContextEnabled(!screenContextEnabled)}>
                <div className="toggle-knob" style={{ left: screenContextEnabled ? '20px' : '2px', background: screenContextEnabled ? '#2eeba8' : 'rgba(255,255,255,0.35)' }} />
              </div>
            </div>

            <div className="privacy-item">
              <div>
                <div className="privacy-label">🧠 Memory</div>
                <div className="privacy-desc">Remember preferences across sessions</div>
              </div>
              <div className="toggle-sm" style={{ background: memoryEnabled ? 'rgba(0,180,255,0.3)' : 'rgba(255,255,255,0.08)', borderColor: memoryEnabled ? 'rgba(0,180,255,0.4)' : 'rgba(255,255,255,0.12)' }} onClick={() => setMemoryEnabled(!memoryEnabled)}>
                <div className="toggle-knob" style={{ left: memoryEnabled ? '20px' : '2px', background: memoryEnabled ? '#00b4ff' : 'rgba(255,255,255,0.35)' }} />
              </div>
            </div>

            <div className="privacy-item">
              <div>
                <div className="privacy-label">🔊 Voice Output</div>
                <div className="privacy-desc">Speak responses via text-to-speech</div>
              </div>
              <div className="toggle-sm" style={{ background: voiceEnabled ? 'rgba(0,180,255,0.3)' : 'rgba(255,255,255,0.08)', borderColor: voiceEnabled ? 'rgba(0,180,255,0.4)' : 'rgba(255,255,255,0.12)' }} onClick={() => setVoiceEnabled(!voiceEnabled)}>
                <div className="toggle-knob" style={{ left: voiceEnabled ? '20px' : '2px', background: voiceEnabled ? '#00b4ff' : 'rgba(255,255,255,0.35)' }} />
              </div>
            </div>

            <div className="privacy-item">
              <div>
                <div className="privacy-label">💡 Proactive Suggestions</div>
                <div className="privacy-desc">Get helpful hints and reminders</div>
              </div>
              <div className="toggle-sm" style={{ background: proactiveEnabled ? 'rgba(255,214,10,0.3)' : 'rgba(255,255,255,0.08)', borderColor: proactiveEnabled ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.12)' }} onClick={() => setProactiveEnabled(!proactiveEnabled)}>
                <div className="toggle-knob" style={{ left: proactiveEnabled ? '20px' : '2px', background: proactiveEnabled ? '#ffd60a' : 'rgba(255,255,255,0.35)' }} />
              </div>
            </div>

            <div style={{ marginTop: '20px', padding: '14px', borderRadius: '12px', border: '1px solid rgba(0,180,255,0.08)', background: 'rgba(0,180,255,0.02)' }}>
              <div style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(0,180,255,0.4)', marginBottom: '8px' }}>DATA & SECURITY</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.8 }}>
                🔒 All API keys stored server-side<br />
                🧠 Memory stored in MongoDB<br />
                🎤 Voice processed in-browser (Web Speech API)<br />
                📄 Screen context read only from this website<br />
                ❌ No third-party tracking<br />
                ❌ No screen capture of other apps
              </div>
            </div>
          </div>
        )}

        {/* ─── OPERATOR PANEL ────────────────────────────── */}
        {panel === 'operator' && (
          <div className="scroll-content">
            <div className="section-title" style={{ marginBottom: '12px' }}>🔧 OPERATOR MODE</div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {['Run health check', 'Check logs', 'Check git status', 'Check deployment', 'Explain this code'].map(cmd => (
                <button key={cmd} className="quick-btn" onClick={() => { processMessage(cmd); setPanel('chat'); }} style={{ fontSize: '9px' }}>{cmd}</button>
              ))}
            </div>

            {systemStatus ? (
              <>
                <div style={{ padding: '12px', borderRadius: '12px', border: `1px solid ${systemStatus.status === 'healthy' ? 'rgba(46,235,168,0.2)' : 'rgba(255,214,10,0.2)'}`, background: systemStatus.status === 'healthy' ? 'rgba(46,235,168,0.04)' : 'rgba(255,214,10,0.04)', marginBottom: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: systemStatus.status === 'healthy' ? '#2eeba8' : '#ffd60a', marginBottom: '4px' }}>
                    {systemStatus.status === 'healthy' ? '✅' : '⚠️'} SYSTEM: {String(systemStatus.healthScore)}% — {String(systemStatus.status).toUpperCase()}
                  </div>
                </div>

                <div className="status-grid">
                  {Object.entries((systemStatus as Record<string, Record<string, unknown>>).systems || {}).map(([key, val]) => {
                    const sys = val as Record<string, string>;
                    const st = String(sys.status || sys.provider || 'OK');
                    const isOk = st === 'online' || st === 'healthy';
                    return (
                      <div key={key} className="status-card">
                        <div className="status-card-label">{key.toUpperCase()}</div>
                        <div className="status-card-value" style={{ color: isOk ? '#2eeba8' : '#ffd60a' }}>
                          {isOk ? '✅' : '⚠️'} {st}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p style={{ marginBottom: '12px' }}>Click "Run health check" to inspect all systems.</p>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>
                  JARVIS Operator Mode provides real-time system diagnostics, log monitoring, deployment status, and development assistance.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
