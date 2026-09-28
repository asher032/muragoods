import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Party from '@/app/lib/models/Party';
import DiscordRequest from '@/app/lib/models/DiscordRequest';
import MediaComment from '@/app/lib/models/MediaComment';

// Discord bridge routes — called only by the MuraStream bot with a shared
// secret. All inputs are validated; nothing here is reachable without the
// DISCORD_BRIDGE_SECRET header.

export const dynamic = 'force-dynamic';

function checkSecret(req: Request): boolean {
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

function badRequest(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}
// ─── GET /api/discord?action=comments&type=movie&id=123 ───────────────────
export async function GET(req: Request) {
  if (!checkSecret(req)) {
    return badRequest('Unauthorized', 401);
  }
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'comments') {
    const mediaType = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
    const tmdbId = Number(searchParams.get('id'));
    const limit = Math.min(Number(searchParams.get('limit') || 5), 20);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      return badRequest('Valid id required');
    }
    const docs = await MediaComment.find({ mediaType, tmdbId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return NextResponse.json({
      success: true,
      comments: (docs || []).map((d) => ({
        name: d.name,
        text: d.text,
        at: d.at ?? d.createdAt,
        likes: d.likes?.length || 0,
      })),
    });
  }

  if (action === 'party') {
    const code = (searchParams.get('code') || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(code)) {
      return badRequest('Valid party code required');
    }
    const party = await Party.findOne({ code }).lean();
    if (!party) {
      return badRequest('Party not found', 404);
    }
    return NextResponse.json({
      success: true,
      data: {
        code: party.code,
        hostName: party.hostName,
        playing: party.playing,
        positionMs: party.positionMs,
        state: party.state,
        members: (party.members || []).map((m: { name: string }) => m.name),
      },
    });
  }

  // ─── GET /api/discord?action=profile&discordId=123 ───────────────────
  // Linked Muragoods profile bundle for Murabot. Used when the bot host
  // cannot reach the site's database directly (separate clusters). The
  // bot enforces viewer privacy from the included privacy object.
  if (action === 'profile') {
    const discordId = searchParams.get('discordId') || '';
    if (!/^\d{5,25}$/.test(discordId)) {
      return badRequest('Valid discordId required');
    }
    const { default: User } = await import('@/app/lib/models/User');
    const { default: GameProgress } = await import('@/app/lib/models/GameProgress');
    const { default: UserPreference } = await import('@/app/lib/models/UserPreference');
    const { default: GameReward } = await import('@/app/lib/models/GameReward');
    const { default: UserLibrary } = await import('@/app/lib/models/UserLibrary');
    const user = await User.findOne({ 'discord.discordId': discordId })
      .select('name email avatar coinBalance perks privacy discord').lean() as {
        name?: string; email: string; avatar?: string; coinBalance?: number;
        perks?: Array<{ perkName?: string; perkId?: string }>;
        privacy?: Record<string, string>;
        discord?: { username?: string; avatar?: string };
      } | null;
    if (!user) return NextResponse.json({ success: true, linked: false });
    const emailLc = user.email.toLowerCase();
    const [rows, favs, recent, lib] = await Promise.all([
      GameProgress.find({ userEmail: emailLc }).sort({ lastPlayed: -1 }).limit(20).lean(),
      UserPreference.find({ userEmail: emailLc }).sort({ createdAt: -1 }).limit(15).lean(),
      GameReward.find({ userEmail: emailLc }).sort({ createdAt: -1 }).limit(5).lean(),
      UserLibrary.findOne({ email: emailLc }).select('myList').lean() as Promise<{ myList?: Array<{ title?: string }> } | null>,
    ]);
    const totalXp = rows.reduce((s, r) => s + (r.xp || 0), 0);
    const totalPlays = rows.reduce((s, r) => s + (r.plays || 0), 0);
    const achievements = [...new Set(rows.flatMap((r) => r.achievements || []))];
    return NextResponse.json({
      success: true,
      linked: true,
      email: user.email,
      privacy: {
        gameProfile: 'public', favorites: 'private', activity: 'private', watchHistory: 'private',
        ...(user.privacy || {}),
      },
      profile: {
        name: user.name || '', avatar: user.avatar || user.discord?.avatar || '',
        discordUsername: user.discord?.username || '', coins: user.coinBalance || 0,
        totalXp, totalPlays, gamesPlayed: rows.length, achievements,
        games: rows.slice(0, 5).map((r) => ({ gameId: r.gameId, bestScore: r.bestScore || 0, plays: r.plays || 0 })),
        favorites: (favs || []).map((f) => ({
          type: f.contentType, action: f.action,
          title: String(f.snapshot?.title || f.contentId),
        })),
        watchlist: ((lib?.myList) || []).slice(0, 10).map((m) => String(m.title || '?')),
        perks: ((user.perks) || []).slice(-5).map((p) => String(p.perkName || p.perkId)),
        recent: (recent || []).map((r) => ({ kind: r.kind, amount: r.amount, label: String(r.label || '').slice(0, 60) })),
      },
    });
  }

  return badRequest('Unknown action');
}

// ─── POST /api/discord  { action: 'party' | 'request', ... } ──────────────
export async function POST(req: Request) {
  if (!checkSecret(req)) {
    return badRequest('Unauthorized', 401);
  }
  await dbConnect();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body');
  }
  const action = String((body as Record<string, unknown>).action || '');

  if (action === 'party') {
    const hostName = String((body as Record<string, unknown>).hostName || 'Discord Host')
      .slice(0, 60);
    const rawState = (body as Record<string, unknown>).state;
    const state = (rawState && typeof rawState === 'object' ? rawState : {}) as Record<string, unknown>;
    // Sanitize the playback state the same way the site's party route does.
    const safeState = {
      type: state.type === 'tv' ? 'tv' : 'movie',
      id: Number(state.id) || 0,
      season: Number(state.season) || 1,
      episode: Number(state.episode) || 1,
      source: 'discord',
      updatedAt: new Date().toISOString(),
    };
    if (!safeState.id) {
      return badRequest('A valid media id is required');
    }
    const codeChars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      for (let i = 0; i < 6; i++) {
        code += codeChars[Math.floor(Math.random() * codeChars.length)];
      }
      try {
        const created = await Party.create({
          code,
          hostName,
          hostEmail: 'discord-bot@bridge.local',
          state: safeState,
          members: [],
        });
        return NextResponse.json(
          { success: true, data: { code: created.code } },
          { status: 201 },
        );
      } catch {
        code = ''; // collision — retry
      }
    }
    return badRequest('Could not allocate a party code', 500);
  }

  if (action === 'request') {
    const title = String((body as Record<string, unknown>).title || '').trim().slice(0, 120);
    const type = ['movie', 'tv', 'anime'].includes(String((body as Record<string, unknown>).type))
      ? String((body as Record<string, unknown>).type)
      : 'movie';
    const user = String((body as Record<string, unknown>).user || 'Discord user').slice(0, 60);
    const note = String((body as Record<string, unknown>).note || '').slice(0, 300);
    if (title.length < 2) {
      return badRequest('Title too short');
    }
    const doc = await DiscordRequest.create({ title, type, requestedBy: user, note });
    return NextResponse.json(
      { success: true, data: { id: String(doc._id), title: doc.title } },
      { status: 201 },
    );
  }

  return badRequest('Unknown action');
}
