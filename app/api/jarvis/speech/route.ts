import { NextResponse } from 'next/server';

// Groq Whisper speech-to-text endpoint
// Much more reliable than browser SpeechRecognition

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    
    if (!audioFile) {
      return NextResponse.json({ success: false, error: 'No audio file provided' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Speech recognition not configured' }, { status: 500 });
    }

    // Send audio to Groq Whisper
    const whisperFormData = new FormData();
    whisperFormData.append('file', audioFile, 'audio.webm');
    whisperFormData.append('model', 'whisper-large-v3-turbo');
    whisperFormData.append('language', 'en');
    whisperFormData.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: whisperFormData,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[JARVIS Speech] Groq error:', response.status, err);
      return NextResponse.json({ success: false, error: 'Speech recognition failed' }, { status: 500 });
    }

    const data = await response.json() as { text?: string };
    const text = data.text?.trim() || '';

    if (!text) {
      return NextResponse.json({ success: false, error: 'Could not understand the audio' }, { status: 400 });
    }

    return NextResponse.json({ success: true, text });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Speech recognition error';
    console.error('[JARVIS Speech] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
