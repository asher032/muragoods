import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

async function getManageableGuilds(accessToken: string): Promise<Map<string, { id: string }>> {
  const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!resp.ok) return new Map();
  const guilds = (await resp.json()) as Array<{ id: string; permissions: string | number; owner: boolean }>;
  return new Map(guilds
    .filter((g) => g.owner || (BigInt(g.permissions) & MANAGE_GUILD) !== BigInt(0) || (BigInt(g.permissions) & ADMINISTRATOR) !== BigInt(0))
    .map((g) => [g.id, { id: g.id }]));
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
    guildId: /^\d{5,25}$/.test(String(body.guildId || '')) ? String(body.guildId) : '',
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
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (guildId && !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Invalid guildId' }, { status: 400 });
  }

  const manageable = await getManageableGuilds(token);
  if (guildId && !manageable.has(guildId)) {
    return NextResponse.json({ success: false, error: 'No permission for this server' }, { status: 403 });
  }
  if (!guildId && manageable.size === 0) {
    return NextResponse.json({ success: false, error: 'No manageable servers' }, { status: 403 });
  }

  try {
    const col = await errorsCollection();
    const query: Record<string, unknown> = guildId ? { guildId } : { guildId: { $in: ['', ...manageable.keys()] } };
    const docs = await col.find(query).sort({ createdAt: -1 }).limit(100).toArray();
    return NextResponse.json({
      success: true,
      errors: docs.map((d) => ({
        id: String(d._id),
        source: d.source,
        message: d.message,
        command: d.command || '',
        guildId: d.guildId || '',
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
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { id?: string; resolved?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const id = String(body.id || '');
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return NextResponse.json({ success: false, error: 'Valid error id required' }, { status: 400 });
  }

  const manageable = await getManageableGuilds(token);
  if (manageable.size === 0) {
    return NextResponse.json({ success: false, error: 'No manageable servers' }, { status: 403 });
  }

  try {
    const col = await errorsCollection();
    const doc = await col.findOne({ _id: new ObjectId(id) });
    if (!doc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    const guildId = String(doc.guildId || '');
    if (guildId && !manageable.has(guildId)) {
      return NextResponse.json({ success: false, error: 'No permission for this server' }, { status: 403 });
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
