import { sessionToken } from '@/app/lib/require-session';
import { fetchUserGuildsCached, hasManageBits } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

type ManageResult = { ok: true; ids: Set<string> } | { ok: false; status: number; code: string; error: string };

async function getManageableGuilds(accessToken: string): Promise<ManageResult> {
  // Shared 30s-cached guild list. A Discord failure is reported distinctly —
  // the old code collapsed it into an empty set, which read as "no
  // permission" / "no manageable servers" on a healthy account.
  const res = await fetchUserGuildsCached(accessToken);
  if (!res.ok && res.authFailed) {
    return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Discord rejected the session — sign in again' };
  }
  if (!res.ok) {
    return { ok: false, status: 502, code: 'DISCORD_API_ERROR', error: 'Discord did not answer — retry in a moment' };
  }
  return {
    ok: true,
    ids: new Set(res.guilds.filter((g) => hasManageBits(g.owner, g.permissions)).map((g) => g.id)),
  };
}

// ── Shared cluster access (bot writes here; dashboard reads) ────────────
// One cached client per server instance: the previous per-request
// `new MongoClient(uri).connect()` never called .close(), leaking a
// connection on every Error Center poll.
let cachedClient: Promise<MongoClient> | null = null;
function client(): Promise<MongoClient> {
  // Same resolver as discord-config.ts so both sides see one database.
  if (!cachedClient) {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGO_URI or MONGODB_URI required');
    cachedClient = new MongoClient(uri).connect();
    cachedClient.catch(() => { cachedClient = null; });
  }
  return cachedClient;
}

async function errorsCollection() {
  const c = await client();
  const dbName = process.env.MONGO_DB || process.env.DISCORD_BOT_MONGO_DB || 'murastream_bot';
  return c.db(dbName).collection('bot_errors');
}

// ── POST — ingest from the bot (Bearer DISCORD_BRIDGE_SECRET) ───────────
export async function POST(req: NextRequest) {
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  const auth = req.headers.get('authorization') || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const message = String(body.message || '').slice(0, 500);
  if (!message) {
    return NextResponse.json({ success: false, error: 'message required' }, { status: 400 });
  }

  const doc = {
    source: String(body.source || 'bot').slice(0, 40),
    message,
    command: String(body.command || '').slice(0, 60),
    subcommand: String(body.subcommand || '').slice(0, 60),
    // The MS-XXXXXX the user was shown in Discord. Stored so the Error Center
    // can be searched by the exact id a user reports.
    errorId: /^MS-[0-9A-F]{1,12}$/i.test(String(body.errorId || ''))
      ? String(body.errorId).slice(0, 20).toUpperCase() : '',
    guildId: /^\d{5,25}$/.test(String(body.guildId || '')) ? String(body.guildId) : '',
    userId: /^\d{5,25}$/.test(String(body.userId || '')) ? String(body.userId) : '',
    exceptionType: String(body.exceptionType || '').slice(0, 80),
    exceptionMessage: String(body.exceptionMessage || '').slice(0, 500),
    file: String(body.file || '').slice(0, 200),
    line: Number.isInteger(body.line) ? Number(body.line) : null,
    traceback: String(body.traceback || '').slice(0, 4000),
    severity: ['info', 'warning', 'error', 'critical'].includes(String(body.severity))
      ? String(body.severity) : 'error',
    detail: String(body.detail || '').slice(0, 2000),
    resolved: false,
    createdAt: new Date(),
  };

  try {
    const col = await errorsCollection();
    const res = await col.insertOne(doc);
    return NextResponse.json({ success: true, id: String(res.insertedId) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Database unavailable: ${String(err).slice(0, 120)}` },
      { status: 503 },
    );
  }
}

// ── GET — list errors for the Error Center (dashboard OAuth) ────────────
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (guildId && !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Invalid guildId' }, { status: 400 });
  }

  const manageable = await getManageableGuilds(token);
  if (!manageable.ok) {
    return NextResponse.json({ success: false, code: manageable.code, error: manageable.error }, { status: manageable.status });
  }
  if (guildId && !manageable.ids.has(guildId)) {
    return NextResponse.json({ success: false, code: 'INSUFFICIENT_GUILD_PERMISSION', error: 'No permission for this server' }, { status: 403 });
  }
  if (!guildId && manageable.ids.size === 0) {
    return NextResponse.json({ success: false, error: 'No manageable servers' }, { status: 403 });
  }

  try {
    const col = await errorsCollection();
    const base: Record<string, unknown> = guildId ? { guildId } : { guildId: { $in: ['', ...manageable.ids.keys()] } };
    // `?errorId=MS-A98DE3` looks up the exact record a user reported. It is
    // still intersected with the manageable-guild scope, so searching by id
    // cannot read another server's errors.
    const errorIdParam = (req.nextUrl.searchParams.get('errorId') || '').trim().toUpperCase();
    if (errorIdParam && !/^MS-[0-9A-F]{1,12}$/.test(errorIdParam)) {
      return NextResponse.json({ success: false, error: 'Invalid errorId' }, { status: 400 });
    }
    const query: Record<string, unknown> = errorIdParam ? { ...base, errorId: errorIdParam } : base;
    const docs = await col.find(query).sort({ createdAt: -1 }).limit(100).toArray();
    return NextResponse.json({
      success: true,
      errors: docs.map((d) => ({
        id: String(d._id),
        source: d.source,
        message: d.message,
        command: d.command || '',
        subcommand: d.subcommand || '',
        errorId: d.errorId || '',
        guildId: d.guildId || '',
        userId: d.userId || '',
        exceptionType: d.exceptionType || '',
        exceptionMessage: d.exceptionMessage || '',
        file: d.file || '',
        line: typeof d.line === 'number' ? d.line : null,
        traceback: d.traceback || '',
        severity: d.severity || 'error',
        detail: d.detail || '',
        resolved: Boolean(d.resolved),
        createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Database unavailable: ${String(err).slice(0, 120)}` },
      { status: 503 },
    );
  }
}

// ── PATCH — mark resolved / retry ────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });

  let body: { id?: string; resolved?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const id = String(body.id || '');
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return NextResponse.json({ success: false, error: 'Valid error id required' }, { status: 400 });
  }

  const manageable = await getManageableGuilds(token);
  if (!manageable.ok) {
    return NextResponse.json({ success: false, code: manageable.code, error: manageable.error }, { status: manageable.status });
  }
  if (manageable.ids.size === 0) {
    return NextResponse.json({ success: false, error: 'No manageable servers' }, { status: 403 });
  }

  try {
    const col = await errorsCollection();
    const doc = await col.findOne({ _id: new ObjectId(id) });
    if (!doc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    const guildId = String(doc.guildId || '');
    if (guildId && !manageable.ids.has(guildId)) {
      return NextResponse.json({ success: false, code: 'INSUFFICIENT_GUILD_PERMISSION', error: 'No permission for this server' }, { status: 403 });
    }
    await col.updateOne({ _id: new ObjectId(id) }, { $set: { resolved: Boolean(body.resolved) } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Database unavailable: ${String(err).slice(0, 120)}` },
      { status: 503 },
    );
  }
}
