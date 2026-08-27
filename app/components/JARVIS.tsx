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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micStreamRefForStop = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
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
      const roleText = isAdmin ? 'Hey! I\'m online. Tap the 🎤 mic button to start talking, or type a command below.' : 'Hey! I\'m here. Tap the 🎤 mic button to start talking, or type a command below.';
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

  // ─── Voice system (MediaRecorder + Groq Whisper) ────────
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isRecordingRef = useRef(false);

  const stopSpeakingRef = useCallback(() => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  // ─── Transcribe audio via Groq Whisper ──────────────────
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      const res = await fetch('/api/jarvis/speech', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.text) return data.text;
      return null;
    } catch { return null; }
  }, []);

  // ElevenLabs TTS
  const onSpeechEnd = useCallback(() => {
    setSpeaking(false);
    setCurrentAudio(null);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled) return;
    try {
      const clean = text.replace(/[*#\n]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean) return;
      const res = await fetch('/api/jarvis/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: clean }) });
      const data = await res.json();
      if (data.success && data.audio) {
        setSpeaking(true);
        const audio = new Audio('data:audio/mpeg;base64,' + data.audio);
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
        u.rate = 1.05; u.pitch = 0.9;
        u.onstart = () => setSpeaking(true);
        u.onend = onSpeechEnd;
        window.speechSynthesis.speak(u);
      }
    } catch {
      // Fallback to browser TTS
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(text.replace(/[*#\n]/g, ' ').replace(/\s+/g, ' ').trim());
        u.rate = 1.05; u.pitch = 0.9;
        u.onstart = () => setSpeaking(true);
        u.onend = onSpeechEnd;
        window.speechSynthesis.speak(u);
      }
    }
  }, [voiceEnabled, onSpeechEnd]);

  // ─── Screen context ─────────────────────────────────────
  const getScreenContext = useCallback((): string => {
    if (typeof document === 'undefined') return '';
    const el = document.querySelector('main');
    if (!el) return '';
    return el.innerText.substring(0, 2000);
  }, []);

  // ─── Process message ────────────────────────────────────
  const processMessage = useCallback(async (text: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setProcessing(true);

    try {
      const screenContext = getScreenContext();
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, userId, email: userEmail, screenContext, conversationHistory: messages.slice(-10) }),
      });
      const data = await res.json();

      const jarvisMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'jarvis',
        text: data.data?.response || data.response || 'I had trouble processing that. Can you try again?',
        intent: data.data?.intent || data.intent,
        action: data.data?.action || data.action,
        actionParams: data.data?.actionParams || data.actionParams,
        cards: data.data?.cards || data.cards,
        buttons: data.data?.buttons || data.buttons,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, jarvisMsg]);

      // Navigate if needed
      const action = data.data?.action || data.action;
      const actionParams = data.data?.actionParams || data.actionParams;
      if (action === 'navigate' && actionParams?.path) {
        setTimeout(() => router.push(actionParams.path), 500);
      }

      // Save to command history
      setCommandHistory(prev => [{ command: text, result: jarvisMsg.text.substring(0, 100), timestamp: new Date().toISOString() }, ...prev].slice(0, 50));

      // Speak response
      speak(jarvisMsg.text);
    } catch {
      const errMsg: Message = { id: (Date.now() + 1).toString(), role: 'jarvis', text: 'Connection issue. Please try again.', timestamp: new Date() };
      setMessages(prev => [...prev, errMsg]);
    }
    setProcessing(false);
  }, [userId, userEmail, getScreenContext, router, messages, speak]);

  const handleSend = useCallback((text?: string) => {
    const msg = (text || input).trim();
    if (!msg || processing) return;
    setInput('');
    processMessage(msg);
  }, [input, processing, processMessage]);

  // Ref for handleSend to use in voice callbacks
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    isRecordingRef.current = false;
    mediaRecorderRef.current.stop();
    micStreamRefForStop.current?.getTracks().forEach(t => t.stop());
    micStreamRefForStop.current = null;
    if (recordingTimerRef.current) { clearTimeout(recordingTimerRef.current); recordingTimerRef.current = null; }
  }, []);

  const handleRecordingStop = useCallback(async () => {
    setListening(false);
    if (audioChunksRef.current.length === 0) return;
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioChunksRef.current = [];
    if (audioBlob.size < 100) return;
    setProcessing(true);
    const text = await transcribeAudio(audioBlob);
    setProcessing(false);
    if (text) handleSendRef.current(text);
  }, [transcribeAudio]);

  const startRecording = useCallback(async () => {
    try {
      // Check actual permission state first (browser may have changed it since page load)
      let micState: PermissionState = 'prompt';
      try {
        const permStatus = await navigator.permissions.query({ name: 'microphone' } as PermissionDescriptor);
        micState = permStatus.state;
      } catch { /* Permissions API not supported, just try getUserMedia */ }

      // If browser says 'granted' but getUserMedi failed before, try fresh request
      if (micState === 'granted') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = stream;
          micStreamRefForStop.current = stream;
          audioChunksRef.current = [];
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
          const recorder = new MediaRecorder(stream, { mimeType });
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
          recorder.onstop = () => handleRecordingStop();
          recorder.start();
          isRecordingRef.current = true;
          setListening(true);
          recordingTimerRef.current = setTimeout(() => { if (isRecordingRef.current) stopRecording(); }, 15000);
          return;
        } catch {
          // getUserMedia failed even though permissions say granted
          // Fall through to request new permission
        }
      }

      // If 'prompt', request permission (this shows the browser dialog)
      if (micState === 'prompt') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        micStreamRefForStop.current = stream;
        audioChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = () => handleRecordingStop();
        recorder.start();
        isRecordingRef.current = true;
        setListening(true);
        recordingTimerRef.current = setTimeout(() => { if (isRecordingRef.current) stopRecording(); }, 15000);
        return;
      }

      // If 'denied' — try getUserMedia anyway (browser might have been toggled ON since last check)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        micStreamRefForStop.current = stream;
        audioChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = () => handleRecordingStop();
        recorder.start();
        isRecordingRef.current = true;
        setListening(true);
        recordingTimerRef.current = setTimeout(() => { if (isRecordingRef.current) stopRecording(); }, 15000);
        return;
      } catch {
        // Truly denied — show the error
      }

      // All attempts failed — show error with retry option
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'jarvis',
        text: "🎤 Microphone access is blocked. Try this:\n\n1. Click the 🔒 lock icon in your address bar\n2. Set Microphone to ✅ Allow\n3. Refresh the page\n4. Click the 🎤 button again\n\nOr just type your command below!",
        timestamp: new Date(),
      }]);
    } catch (err: unknown) {
      const errStr = String(err);
      if (errStr.includes('NotFoundError')) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: 'No microphone found. Please connect a microphone and try again.', timestamp: new Date() }]);
      } else {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: 'Could not start recording. Try typing your command instead!', timestamp: new Date() }]);
      }
    }
  }, [stopRecording, handleRecordingStop]);

  // ─── Mic button handler ─────────────────────────────────
  const micCooldownRef = useRef(false);
  const toggleVoice = useCallback(async () => {
    if (micCooldownRef.current) return;
    micCooldownRef.current = true;
    setTimeout(() => { micCooldownRef.current = false; }, 1500);
    if (isRecordingRef.current) {
      await stopRecording();
    } else {
      stopSpeakingRef();
      await startRecording();
    }
  }, [stopRecording, startRecording, stopSpeakingRef]);

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
        body: JSON.stringify({ action: 'edit', email: userEmail, path: selectedFile, instruction: editInstruction }),
      });
      const data = await res.json();
      if (data.success) {
        setFileContent(data.data.content);
        setEditInstruction('');
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: `Updated ${selectedFile} successfully.`, timestamp: new Date() }]);
      } else {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: `Edit failed: ${data.error}`, timestamp: new Date() }]);
      }
    } catch { /* empty */ }
    setEditLoading(false);
  }, [selectedFile, editInstruction, userEmail]);

  // ─── Management ─────────────────────────────────────────
  const loadSiteStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/jarvis/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'site-stats', email: userEmail }),
      });
      const data = await res.json();
      if (data.success) setSiteStats(data.data);
    } catch { /* empty */ }
  }, [userEmail]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(`/api/jarvis/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-users', email: userEmail }),
      });
      const data = await res.json();
      if (data.success) setUserList(data.data.users);
    } catch { /* empty */ }
  }, [userEmail]);

  const loadMemories = useCallback(async () => {
    try {
      const res = await fetch(`/api/jarvis/memory?userId=${userId || 'anonymous'}`);
      const data = await res.json();
      if (data.success) setMemories(data.memories || []);
    } catch { /* empty */ }
  }, [userId]);

  // ─── Reset chat ─────────────────────────────────────────
  const resetChat = useCallback(() => {
    setMessages([]);
    setCommandHistory([]);
    const h = new Date().getHours();
    const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    setMessages([{
      id: 'w2', role: 'jarvis',
      text: `${g}, Commander. What can I help you with?`,
      intent: 'INFORMATION', timestamp: new Date(),
    }]);
  }, []);

  // ─── Panel effects ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (open && panel === 'chat' && messages.length <= 1) { /* already handled */ }
    if (open && panel === 'memory') loadMemories();
    if (open && panel === 'code' && isAdmin) loadCodeFiles();
    if (open && panel === 'manage' && isAdmin) { loadSiteStats(); loadUsers(); }
  }, [open, panel, isAdmin]);

  // ─── Keyboard shortcut ──────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        if (open) onClose(); else onClose(); // toggle handled by provider
      }
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const orbState = listening ? 'listening' : speaking ? 'speaking' : processing ? 'processing' : '';
  const orbColor = listening ? '#ff4444' : speaking ? '#00ff88' : processing ? '#ffaa00' : '#00e5ff';

  return (
    <div className="jarvis-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="jarvis-panel" style={{ position: 'fixed', bottom: 0, right: 0, width: '100%', height: '100%', maxWidth: '480px', maxHeight: '100vh', zIndex: 9999, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #0a0e1a 0%, #0d1220 50%, #111827 100%)', borderLeft: '1px solid rgba(0,229,255,0.15)', boxShadow: '-10px 0 40px rgba(0,0,0,0.5)', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#e0e0e0', overflow: 'hidden' }}>
        {/* ─── Top Bar ────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(0,229,255,0.1)', background: 'rgba(0,0,0,0.3)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: orbColor, boxShadow: `0 0 8px ${orbColor}` }} />
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: orbColor, letterSpacing: '0.1em' }}>J.A.R.V.I.S</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={resetChat} style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.2)', color: '#ffc800', fontSize: '11px', cursor: 'pointer' }} title="Reset Chat">↺</button>
            <button onClick={() => setPanel('chat')} style={{ padding: '4px 8px', borderRadius: '6px', background: panel === 'chat' ? 'rgba(0,229,255,0.15)' : 'transparent', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff', fontSize: '11px', cursor: 'pointer' }}>💬</button>
            <button onClick={() => setPanel('memory')} style={{ padding: '4px 8px', borderRadius: '6px', background: panel === 'memory' ? 'rgba(0,229,255,0.15)' : 'transparent', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff', fontSize: '11px', cursor: 'pointer' }}>🧠</button>
            {isAdmin && <button onClick={() => setPanel('code')} style={{ padding: '4px 8px', borderRadius: '6px', background: panel === 'code' ? 'rgba(0,255,136,0.15)' : 'transparent', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88', fontSize: '11px', cursor: 'pointer' }}>💻</button>}
            {isAdmin && <button onClick={() => setPanel('manage')} style={{ padding: '4px 8px', borderRadius: '6px', background: panel === 'manage' ? 'rgba(255,170,0,0.15)' : 'transparent', border: '1px solid rgba(255,170,0,0.2)', color: '#ffaa00', fontSize: '11px', cursor: 'pointer' }}>⚙️</button>}
            <button onClick={onClose} style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)', color: '#ff4444', fontSize: '11px', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* ─── Status Bar ─────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'monospace', fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>{currentTime}</span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '9px', color: orbColor }}>{orbState ? orbState.toUpperCase() : 'STANDBY'}</span>
            <span style={{ fontFamily: 'monospace', fontSize: '9px', color: isAdmin ? '#00ff88' : '#ffaa00' }}>{isAdmin ? 'ADMIN ACCESS' : 'USER MODE'}</span>
          </div>
        </div>

        {/* ─── Core Animation ──────────────────────────── */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '16px', flexShrink: 0 }}>
          <div ref={coreRef} onClick={toggleVoice} style={{ width: '80px', height: '80px', borderRadius: '50%', background: `radial-gradient(circle at ${50 + mousePos.x * 20}% ${50 + mousePos.y * 20}%, ${orbColor}, ${orbColor}44, transparent)`, boxShadow: `0 0 40px ${orbColor}44, 0 0 80px ${orbColor}22`, cursor: 'pointer', transition: 'all 0.3s', animation: listening ? 'jarvis-pulse 1s ease-in-out infinite' : speaking ? 'jarvis-pulse 0.5s ease-in-out infinite' : processing ? 'jarvis-pulse 1.5s ease-in-out infinite' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '24px' }}>{listening ? '🎤' : speaking ? '🔊' : processing ? '⏳' : '🤖'}</span>
          </div>
          <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '9px', color: orbColor }}>
              {listening ? '🔴 LISTENING' : speaking ? '🟢 SPEAKING' : processing ? '🟡 THINKING' : '🔵 STANDBY'}
            </span>
          </div>
        </div>

        {/* ─── Quick Actions ──────────────────────────── */}
        <div style={{ display: 'flex', gap: '6px', padding: '0 16px 10px', justifyContent: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          <button onClick={toggleVoice} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${listening ? '#ff4444' : 'rgba(0,229,255,0.2)'}`, background: listening ? 'rgba(255,68,68,0.2)' : 'rgba(0,229,255,0.1)', color: listening ? '#ff4444' : '#00e5ff', fontSize: '10px', cursor: 'pointer', fontFamily: 'monospace', animation: listening ? 'jarvis-pulse 1s ease-in-out infinite' : 'none' }}>
            🎤 {listening ? 'Stop' : 'Speak'}
          </button>
          <button onClick={() => { stopSpeakingRef(); }} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#aaa', fontSize: '10px', cursor: 'pointer' }}>
            🔇 Mute
          </button>
          {isAdmin && <button onClick={startCamera} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(0,255,136,0.2)', background: 'rgba(0,255,136,0.1)', color: '#00ff88', fontSize: '10px', cursor: 'pointer' }}>📷 Camera</button>}
          <button onClick={() => setVoiceEnabled(!voiceEnabled)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,200,0,0.2)', background: voiceEnabled ? 'rgba(255,200,0,0.1)' : 'rgba(255,255,255,0.05)', color: voiceEnabled ? '#ffc800' : '#666', fontSize: '10px', cursor: 'pointer' }}>
            {voiceEnabled ? '🔊 Voice On' : '🔇 Voice Off'}
          </button>
        </div>

        {/* ─── Camera View ──────────────────────────────── */}
        {cameraStream && (
          <div style={{ position: 'relative', margin: '0 16px 10px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(0,255,136,0.3)' }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '12px' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px' }}>
              <button onClick={capturePhoto} style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(0,255,136,0.2)', border: '1px solid #00ff88', color: '#00ff88', cursor: 'pointer' }}>📸 Capture</button>
              <button onClick={stopCamera} style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(255,68,68,0.2)', border: '1px solid #ff4444', color: '#ff4444', cursor: 'pointer' }}>✕ Close</button>
            </div>
          </div>
        )}

        {/* ─── Messages ────────────────────────────────── */}
        {panel === 'chat' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: msg.role === 'user' ? 'rgba(255,200,0,0.15)' : `rgba(0,229,255,0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '12px' }}>
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: msg.role === 'user' ? 'rgba(255,200,0,0.08)' : 'rgba(0,229,255,0.06)', border: `1px solid ${msg.role === 'user' ? 'rgba(255,200,0,0.15)' : 'rgba(0,229,255,0.1)'}` }}>
                  <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#e0e0e0', margin: 0, whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                  {msg.buttons && msg.buttons.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      {msg.buttons.map((btn, i) => (
                        <button key={i} onClick={() => { if (btn.action === 'navigate' && btn.actionParams?.path) router.push(btn.actionParams.path); else handleSend(btn.label); }} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.1)', color: '#00e5ff', fontSize: '10px', cursor: 'pointer' }}>
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {processing && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0,229,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>🤖</div>
                <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 2px', background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.1)' }}>
                  <span style={{ fontSize: '12px', color: '#00e5ff', fontFamily: 'monospace' }}>Thinking{processing ? '...' : ''}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* ─── Memory Panel ────────────────────────────── */}
        {panel === 'memory' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <h3 style={{ fontFamily: 'monospace', fontSize: '12px', color: '#00e5ff', marginBottom: '12px' }}>🧠 MEMORY</h3>
            {memories.length === 0 ? (
              <p style={{ fontSize: '11px', color: '#666' }}>No memories saved yet. I&apos;ll remember things you tell me!</p>
            ) : memories.map(m => (
              <div key={m._id} style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.1)', marginBottom: '8px' }}>
                <p style={{ fontSize: '11px', color: '#00e5ff', fontFamily: 'monospace' }}>{m.key}</p>
                <p style={{ fontSize: '12px', color: '#ccc', marginTop: '4px' }}>{m.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ─── Code Panel ──────────────────────────────── */}
        {panel === 'code' && isAdmin && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <h3 style={{ fontFamily: 'monospace', fontSize: '12px', color: '#00ff88', marginBottom: '12px' }}>💻 CODE EDITOR</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
              {codeFiles.map(f => (
                <button key={f.path} onClick={() => loadFileContent(f.path)} style={{ padding: '4px 8px', borderRadius: '4px', background: selectedFile === f.path ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${selectedFile === f.path ? '#00ff88' : 'rgba(255,255,255,0.1)'}`, color: selectedFile === f.path ? '#00ff88' : '#aaa', fontSize: '9px', cursor: 'pointer', fontFamily: 'monospace' }}>
                  {f.name}
                </button>
              ))}
            </div>
            {selectedFile && (
              <div>
                <pre style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px', fontSize: '10px', overflowX: 'auto', maxHeight: '200px', overflowY: 'auto', color: '#ccc', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{fileContent.substring(0, 3000)}</pre>
                <textarea value={editInstruction} onChange={e => setEditInstruction(e.target.value)} placeholder="Tell me what to change in this file..." style={{ width: '100%', marginTop: '8px', padding: '8px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.2)', color: '#ccc', fontSize: '11px', resize: 'vertical', minHeight: '60px' }} />
                <button onClick={applyCodeEdit} disabled={editLoading || !editInstruction} style={{ marginTop: '8px', padding: '6px 16px', borderRadius: '6px', background: editLoading ? 'rgba(0,255,136,0.05)' : 'rgba(0,255,136,0.15)', border: '1px solid #00ff88', color: '#00ff88', fontSize: '10px', cursor: editLoading ? 'not-allowed' : 'pointer' }}>
                  {editLoading ? '⏳ Applying...' : '✨ Apply Edit'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Manage Panel ────────────────────────────── */}
        {panel === 'manage' && isAdmin && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <h3 style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ffaa00', marginBottom: '12px' }}>⚙️ MANAGEMENT</h3>
            {siteStats && (
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.1)', marginBottom: '12px' }}>
                <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#ffaa00' }}>SITE STATS</p>
                <pre style={{ fontSize: '10px', color: '#ccc', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{JSON.stringify(siteStats, null, 2)}</pre>
              </div>
            )}
            <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#ffaa00', marginBottom: '8px' }}>USERS ({userList.length})</p>
            {userList.map(u => (
              <div key={u.userId} style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.1)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '11px', color: '#ccc' }}>{u.name || u.email}</p>
                  <p style={{ fontSize: '9px', color: '#666' }}>{u.email}</p>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#ffc800' }}>🪙 {u.coins}</span>
              </div>
            ))}
          </div>
        )}

        {/* ─── Input ────────────────────────────────────── */}
        {panel === 'chat' && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={listening ? 'Listening...' : 'Type a command or question...'} style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: `1px solid ${listening ? '#ff4444' : 'rgba(0,229,255,0.2)'}`, background: 'rgba(0,0,0,0.4)', color: '#e0e0e0', fontSize: '13px', outline: 'none' }} />
              <button onClick={() => handleSend()} disabled={!input.trim() || processing} style={{ padding: '10px 14px', borderRadius: '10px', background: input.trim() ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,229,255,0.2)', color: input.trim() ? '#00e5ff' : '#555', cursor: input.trim() ? 'pointer' : 'not-allowed', fontSize: '13px' }}>
                ➤
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'center' }}>
              {['Open menu', 'My orders', 'Play games', 'Check points'].map(cmd => (
                <button key={cmd} onClick={() => handleSend(cmd)} style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#888', fontSize: '9px', cursor: 'pointer' }}>
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
