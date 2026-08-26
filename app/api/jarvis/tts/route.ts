import { NextResponse } from 'next/server';
import { generateSpeech, getVoices } from '@/lib/jarvis-tts';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string; voiceId?: string; speed?: number };

    if (!body.text || typeof body.text !== 'string') {
      return NextResponse.json({ success: false, error: 'Text is required' }, { status: 400 });
    }

    const result = await generateSpeech(body.text, {
      voiceId: body.voiceId,
      speed: body.speed,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      audio: result.audioBase64,
      format: 'mp3',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'TTS error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  const voices = await getVoices();
  return NextResponse.json({ success: true, voices });
}
