import { NextRequest, NextResponse } from 'next/server';
import type { Document, UpdateFilter } from 'mongodb';
import { discordConfigCollection } from '@/app/lib/discord-config';

type WithUpdate = UpdateFilter<Document>;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BOT_HEALTH_URL = process.env.BOT_HEALTH_URL || 'https://murastream-bot-pf11.onrender.com/health';

// Vercel Cron → /api/cron/keepalive, scheduled ONCE PER DAY at 12:00 UTC
// (see vercel.json).
//
// This is deliberately a monitor, not a keep-alive, and it CANNOT be turned
// into one on this plan: Vercel's Hobby tier rejects any cron expression that
// runs more than once per day ("Hobby accounts are limited to daily cron
// jobs"), so */5 or */30 minute schedules fail at deploy time. A daily ping is
// therefore far too sparse to prevent a Render Free web service from spinning
// down after 15 minutes of inactivity. If the bot needs to stay awake, the
// traffic must come from outside this project.
//
// Server-side health monitoring only: exercises this app's own database and
// records the bot gateway's state. No synthetic user traffic, no analytics
// manipulation, and no attempt to bypass hosting inactivity limits.
export async function GET(req: NextRequest) {
  // Vercel sends this on scheduled invocations; require it when set so the
  // endpoint can't be abused as a public traffic generator.
  const expected = process.env.CRON_SECRET || '';
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    const provided = auth.replace(/^Bearer\s+/i, '');
    if (provided !== expected) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results: Record<string, unknown> = { ranAt: new Date().toISOString() };

  // 1. Database self-check.
  let dbOk = false;
  const dbStart = Date.now();
  try {
    const collection = await discordConfigCollection();
    await collection.estimatedDocumentCount();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  results.database = { ok: dbOk, responseTimeMs: Date.now() - dbStart };

  // 2. Bot gateway check (GET only, never mutates anything).
  let botOk = false;
  let botStatus = 0;
  let botLatency = 0;
  let botDetail = '';
  const botStart = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(BOT_HEALTH_URL, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    botStatus = resp.status;
    botLatency = Date.now() - botStart;
    if (resp.ok) {
      const body = (await resp.json()) as { ok?: boolean; latency?: number };
      botOk = body.ok === true;
      botDetail = `gateway latency ${body.latency ?? '?'}ms`;
    } else {
      botDetail = `HTTP ${resp.status}`;
    }
  } catch (err) {
    botStatus = 0;
    botLatency = Date.now() - botStart;
    botDetail = String(err).slice(0, 150);
  }
  results.bot = { ok: botOk, status: botStatus, responseTimeMs: botLatency, detail: botDetail };

  // 3. Persist a keep-alive record the Health page can read (rolling 200).
  try {
    const collection = await discordConfigCollection();
    const entry = {
      ok: dbOk && botOk,
      dbOk,
      botOk,
      botStatus,
      botLatencyMs: botLatency,
      detail: botDetail,
      at: new Date(),
    };
    await collection.updateOne(
      { guildId: '__keepalive__' },
      {
        $set: { lastKeepalive: entry, updatedAt: new Date() },
        $push: { keepaliveHistory: { $each: [entry], $slice: -200 } },
      } as unknown as WithUpdate,
      { upsert: true },
    );
    results.recorded = true;
  } catch (err) {
    results.recorded = false;
    results.recordError = String(err).slice(0, 150);
  }

  // Honest status: 200 only when everything checked is actually healthy.
  return NextResponse.json({ success: true, healthy: dbOk && botOk, ...results });
}
