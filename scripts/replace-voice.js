const fs = require('fs');
let c = fs.readFileSync('app/components/JARVIS.tsx', 'utf8');

// Normalize line endings
c = c.replace(/\r\n/g, '\n');

// Find the old voice section: from "const continuousModeRef" to old "stopSpeaking = stopSpeakingRef"
const startMarker = '  const continuousModeRef = useRef(false);';
const startIdx = c.indexOf(startMarker);
if (startIdx === -1) { console.log('Start marker not found'); process.exit(1); }

// Find the old stopSpeaking alias: '  const stopSpeaking = stopSpeakingRef;'
const endMarker = '  const stopSpeaking = stopSpeakingRef;';
const endIdx = c.indexOf(endMarker, startIdx);
if (endIdx === -1) { console.log('End marker not found'); process.exit(1); }
const endFull = endIdx + endMarker.length + 1; // +1 for newline

console.log('Found old voice section:', startIdx, 'to', endFull, '(' + (endFull - startIdx) + ' chars)');

const newCode = `  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
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

c = c.substring(0, startIdx) + newCode + c.substring(endFull);

// Clean up any leftover continuousModeRef references
c = c.replace(/continuousModeRef\.current = false;\n/g, '');

// Remove old speech.d.ts reference if it exists
// Remove old toggleVoice that references recognitionRef
const oldToggleMarker = '  const micCooldownRef = useRef(false);\n  const toggleVoice = useCallback(async () => {';
const firstToggle = c.indexOf(oldToggleMarker);
const secondToggle = c.indexOf(oldToggleMarker, firstToggle + 1);
if (firstToggle !== -1 && secondToggle !== -1) {
  // There are two toggleVoice - remove the second one
  const secondEnd = c.indexOf('  }, [listening, stopSpeaking]);', secondToggle);
  if (secondEnd !== -1) {
    c = c.substring(0, secondToggle) + c.substring(secondEnd + '  }, [listening, stopSpeaking]);'.length + 1);
    console.log('Removed duplicate toggleVoice');
  }
}

fs.writeFileSync('app/components/JARVIS.tsx', c);
console.log('Done! New size:', c.length);
