const fs = require('fs');
let content = fs.readFileSync('app/components/JARVIS.tsx', 'utf8');

// Remove old SpeechRecognition ref
content = content.replace("  const recognitionRef = useRef<SpeechRecognition | null>(null);\n", "");

// Replace the entire voice section
const oldSection = `  // ─── Continuous conversation mode ────────────────────────
  const continuousModeRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeakingRef = useCallback(() => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);`;

const newSection = `  // ─── Voice system (MediaRecorder + Groq Whisper) ────────
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isRecordingRef = useRef(false);

  const stopSpeakingRef = useCallback(() => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);`;

content = content.replace(oldSection, newSection);

// Replace startListening
const oldStartListening = `  // ─── Start listening ─────────────────────────────────────
  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch { /* already started */ }
  }, []);`;

const newStartListening = `  // ─── Transcribe audio via Groq Whisper ──────────────────
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

  const handleRecordingStop = useCallback(async () => {
    setListening(false);
    if (audioChunksRef.current.length === 0) return;
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioChunksRef.current = [];
    if (audioBlob.size < 100) return;
    setProcessing(true);
    const text = await transcribeAudio(audioBlob);
    setProcessing(false);
    if (text) handleSend(text);
  }, [transcribeAudio]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    isRecordingRef.current = false;
    mediaRecorderRef.current.stop();
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    if (recordingTimerRef.current) { clearTimeout(recordingTimerRef.current); recordingTimerRef.current = null; }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => handleRecordingStop();
      recorder.start();
      isRecordingRef.current = true;
      setListening(true);
      recordingTimerRef.current = setTimeout(() => { if (isRecordingRef.current) stopRecording(); }, 15000);
    } catch (err: unknown) {
      const errStr = String(err);
      if (errStr.includes('NotAllowedError') || errStr.includes('Permission')) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: 'Microphone access denied. Please allow microphone in your browser settings and refresh the page.', timestamp: new Date() }]);
      } else {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'jarvis', text: 'Could not access microphone. Please check your device and try again.', timestamp: new Date() }]);
      }
    }
  }, [stopRecording, handleRecordingStop]);`;

content = content.replace(oldStartListening, newStartListening);

// Replace the entire Speech Recognition useEffect block + mic state + requestMic + old ElevenLabs TTS + old stopSpeaking
// Find from "// ─── Speech Recognition" to end of old stopSpeaking
const srStart = content.indexOf("  // ─── Speech Recognition (continuous conversation) ────────");
const oldStopSpeakingEnd = content.indexOf("  }, [currentAudio]);", srStart);
if (srStart !== -1 && oldStopSpeakingEnd !== -1) {
  const newBlock = `  // ─── Mic button handler ─────────────────────────────────
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

  // ─── ElevenLabs TTS ─────────────────────────────────────
  const onSpeechEnd = useCallback(() => {
    setSpeaking(false);
    setCurrentAudio(null);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled) return;
    try {
      const clean = text.replace(/[*#\\n]/g, ' ').replace(/\\s+/g, ' ').trim();
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
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        u.rate = 1.05; u.pitch = 0.9;
        u.onstart = () => setSpeaking(true);
        u.onend = onSpeechEnd;
        window.speechSynthesis.speak(u);
      }
    } catch { setSpeaking(false); }
  }, [voiceEnabled, onSpeechEnd]);

  const stopSpeaking = useCallback(() => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);`;

  content = content.substring(0, srStart) + newBlock + content.substring(oldStopSpeakingEnd + "  }, [currentAudio]);".length);
}

// Remove old SpeechRecognition type imports and refs
content = content.replace("  const micGrantedRef = useRef(false);\n\n", "");
content = content.replace(/\/\/ ─── Mic state tracking[\s\S]*?return false;\n  }, \[\]\);\n\n/, "");

fs.writeFileSync('app/components/JARVIS.tsx', content);
console.log('Done! File size:', content.length);
