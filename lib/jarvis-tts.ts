// ─── ElevenLabs Text-to-Speech for JARVIS ────────────────────
// Uses ElevenLabs API for natural, human-like voice output

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

export interface TTSOptions {
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}

// ─── Default voice settings ──────────────────────────────────
const DEFAULT_VOICE = 'CwhRBWXzGAHq8TQ4Fs17'; // Roger - Laid-back, Casual, Resonant
const DEFAULT_MODEL = 'eleven_turbo_v2_5'; // Fastest model

// ─── Generate TTS audio ──────────────────────────────────────
export async function generateSpeech(
  text: string,
  options: TTSOptions = {},
): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ElevenLabs API key not configured.' };
  }

  const voiceId = options.voiceId || DEFAULT_VOICE;
  const modelId = options.modelId || DEFAULT_MODEL;
  const stability = options.stability ?? 0.5;
  const similarityBoost = options.similarityBoost ?? 0.75;
  const speed = options.speed ?? 1.0;

  // Clean text for TTS
  const cleanText = text
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markdown
    .replace(/[*#`]/g, '') // Remove other markdown
    .replace(/\n+/g, '. ') // Newlines to pauses
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    return { success: false, error: 'Empty text.' };
  }

  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          speed,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[JARVIS TTS] Error:', response.status, err);
      return { success: false, error: `TTS error: ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return { success: true, audioBase64: base64 };
  } catch (error) {
    console.error('[JARVIS TTS] Request failed:', error);
    return { success: false, error: 'TTS request failed.' };
  }
}

// ─── Get available voices ────────────────────────────────────
export async function getVoices(): Promise<Array<{ voiceId: string; name: string; description?: string }>> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      voices: Array<{
        voice_id: string;
        name: string;
        description?: string;
        labels?: { accent?: string; gender?: string; age?: string };
      }>;
    };

    return data.voices.map(v => ({
      voiceId: v.voice_id,
      name: v.name,
      description: v.labels ? `${v.labels.gender || ''} ${v.labels.accent || ''} ${v.labels.age || ''}`.trim() : v.description,
    }));
  } catch {
    return [];
  }
}
