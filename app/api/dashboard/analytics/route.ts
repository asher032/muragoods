import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';
import dbConnect from '@/app/lib/mongodb';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

const RANGE_MAP: Record<string, { days: number | null; label: string }> = {
  today: { days: 1, label: 'Today' },
  '7days': { days: 7, label: '7 Days' },
  '30days': { days: 30, label: '30 Days' },
  alltime: { days: null, label: 'All Time' },
};

function getDateRange(days: number | null) {
  const now = new Date();
  if (!days) return { start: null, end: now };
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

async function getCollection(name: string) {
  await dbConnect();
  return mongoose.connection.collection(name);
}

async function safeAgg(collectionName: string, pipeline: Record<string, unknown>[]) {
  try {
    const col = await getCollection(collectionName);
    return await col.aggregate(pipeline).toArray() as unknown as Promise<Record<string, unknown>[]>;
  } catch {
    return [] as Record<string, unknown>[];
  }
}

async function safeCount(collectionName: string, query: Record<string, unknown>) {
  try {
    const col = await getCollection(collectionName);
    return await col.countDocuments(query);
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  const range = req.nextUrl.searchParams.get('range') || '7days';

  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const rangeConfig = RANGE_MAP[range] || RANGE_MAP['7days'];
  const { start, end } = getDateRange(rangeConfig.days);

  try {
    const collection = await discordConfigCollection();
    const guildConfig = await collection.findOne({ guildId });
    if (!guildConfig) {
      return NextResponse.json({ success: false, error: 'Guild not found' }, { status: 404 });
    }

    const guildFilter: Record<string, unknown> = { guildId };

    // ─── Command Usage ───
    const commandUsageAgg = await safeAgg('bot_events', [
      { $match: { ...guildFilter, type: 'command', ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) } },
      { $group: { _id: '$command_name', count: { $sum: 1 }, success: { $sum: { $cond: [{ $eq: ['$success', true] }, 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);
    const commandUsage = (commandUsageAgg || []).map((d: Record<string, unknown>) => ({
      command: d._id || 'unknown',
      count: d.count as number || 0,
      success_rate: (d.count as number || 0) > 0 ? Math.round(((d.success as number || 0) / (d.count as number || 0)) * 100) : 0,
    }));

    // ─── Errors ───
    const errorsAgg = await safeAgg('bot_events', [
      { $match: { ...guildFilter, type: 'error', ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) } },
      { $group: { _id: '$error_type', count: { $sum: 1 }, lastOccurrence: { $max: '$createdAt' } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);
    const errors = (errorsAgg || []).map((d: Record<string, unknown>) => ({
      type: d._id || 'unknown',
      count: d.count as number || 0,
      last_occurrence: d.lastOccurrence ? new Date(d.lastOccurrence as string).toISOString() : null,
    }));

    // ─── Moderation Actions ───
    const modAgg = await safeAgg('moderation_actions', [
      { $match: { ...guildFilter, ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) } },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]);
    const modByTotal = (modAgg || []).reduce((acc: Record<string, number>, d: Record<string, unknown>) => {
      acc[d._id as string || 'other'] = (acc[d._id as string || 'other'] || 0) + (d.count as number || 0);
      return acc;
    }, {});
    const moderationActions = {
      total: Object.values(modByTotal).reduce((a: number, b: number) => a + b, 0),
      by_type: {
        warn: modByTotal['warn'] || 0,
        kick: modByTotal['kick'] || 0,
        ban: modByTotal['ban'] || 0,
        mute: modByTotal['mute'] || 0,
        timeout: modByTotal['timeout'] || 0,
        clear: modByTotal['clear'] || 0,
      },
    };

    // ─── Tickets ───
    const [ticketCreated, ticketClosed, ticketResolutionTimes] = await Promise.all([
      safeCount('tickets', { ...guildFilter, status: 'open', ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) }),
      safeCount('tickets', { ...guildFilter, status: 'closed', ...(start ? { closedAt: { $gte: start, $lte: end } } : {}) }),
      safeAgg('tickets', [
        { $match: { ...guildFilter, status: 'closed', closedAt: { $exists: true }, createdAt: { $exists: true }, ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) } },
        { $project: { resolution_ms: { $subtract: ['$closedAt', '$createdAt'] } } },
        { $group: { _id: null, avg: { $avg: '$resolution_ms' } } },
      ]),
    ]);
    const avgResolutionMs = ticketResolutionTimes.length > 0 ? Math.round((ticketResolutionTimes[0].avg as number || 0)) : 0;
    const tickets = {
      created: ticketCreated,
      closed: ticketClosed,
      avg_resolution_ms: avgResolutionMs,
    };

    // ─── Suggestions ───
    const [suggestSubmitted, suggestApproved, suggestDenied] = await Promise.all([
      safeCount('suggestions', { ...guildFilter, ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) }),
      safeCount('suggestions', { ...guildFilter, status: 'approved', ...(start ? { updatedAt: { $gte: start, $lte: end } } : {}) }),
      safeCount('suggestions', { ...guildFilter, status: 'denied', ...(start ? { updatedAt: { $gte: start, $lte: end } } : {}) }),
    ]);
    const suggestions = {
      submitted: suggestSubmitted,
      approved: suggestApproved,
      denied: suggestDenied,
    };

    // ─── Giveaways ───
    const [giveawayActive, giveawayCompleted] = await Promise.all([
      safeCount('giveaways', { ...guildFilter, status: 'active' }),
      safeCount('giveaways', { ...guildFilter, status: 'completed', ...(start ? { endedAt: { $gte: start, $lte: end } } : {}) }),
    ]);
    const giveaways = {
      active: giveawayActive,
      completed: giveawayCompleted,
    };

    // ─── XP ───
    const xpAgg = await safeAgg('xp_events', [
      { $match: { ...guildFilter, ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) } },
      { $group: { _id: { user_id: '$user_id', username: '$username' }, total_xp: { $sum: '$xp' } } },
      { $sort: { total_xp: -1 } },
      { $limit: 10 },
    ]);
    const xpTotalAgg = await safeAgg('xp_events', [
      { $match: { ...guildFilter, ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) } },
      { $group: { _id: null, total: { $sum: '$xp' } } },
    ]);
    const xpTotal = xpTotalAgg.length > 0 ? (xpTotalAgg[0].total || 0) : 0;
    const topUsers = (xpAgg || []).map((d: Record<string, unknown>) => ({
      user_id: (d._id as Record<string, unknown>)?.user_id as string || '',
      username: (d._id as Record<string, unknown>)?.username as string || 'Unknown',
      xp: d.total_xp as number || 0,
    }));
    const xp = {
      total_granted: xpTotal,
      top_users: topUsers,
    };

    // ─── Economy ───
    const [ecoTransactions, dailyClaims] = await Promise.all([
      safeCount('economy_transactions', { ...guildFilter, ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) }),
      safeCount('economy_transactions', { ...guildFilter, type: 'daily', ...(start ? { createdAt: { $gte: start, $lte: end } } : {}) }),
    ]);
    const economy = {
      transactions: ecoTransactions,
      daily_claims: dailyClaims,
    };

    // ─── Music ───
    const musicAgg = await safeAgg('music_sessions', [
      { $match: { ...guildFilter, ...(start ? { startedAt: { $gte: start, $lte: end } } : {}) } },
      { $group: { _id: null, sessions: { $sum: 1 }, tracks: { $sum: '$tracks_played' } } },
    ]);
    const musicSessions = musicAgg.length > 0 ? musicAgg[0].sessions || 0 : 0;
    const musicTracks = musicAgg.length > 0 ? musicAgg[0].tracks || 0 : 0;

    const topArtistsAgg = await safeAgg('music_sessions', [
      { $match: { ...guildFilter, ...(start ? { startedAt: { $gte: start, $lte: end } } : {}) } },
      { $unwind: '$tracks' },
      { $group: { _id: '$tracks.artist', plays: { $sum: 1 } } },
      { $sort: { plays: -1 } },
      { $limit: 10 },
    ]);
    const topArtists = (topArtistsAgg || []).map((d: Record<string, unknown>) => ({
      artist: d._id as string || 'Unknown',
      plays: d.plays as number || 0,
    }));
    const music = {
      sessions: musicSessions,
      tracks_played: musicTracks,
      top_artists: topArtists,
    };

    // ─── Uptime Data ───
    const uptimeAgg = await safeAgg('uptime_logs', [
      { $match: { ...guildFilter, ...(start ? { date: { $gte: start, $lte: end } } : {}) } },
      { $sort: { date: 1 } },
      { $limit: 30 },
    ]);
    const uptimeData = (uptimeAgg || []).map((d: Record<string, unknown>) => ({
      date: d.date ? new Date(d.date as string).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      uptime_seconds: d.uptime_seconds as number || 0,
      status: (d.status as string) || 'unknown',
    }));

    return NextResponse.json({
      success: true,
      range: rangeConfig.label,
      data: {
        command_usage: commandUsage,
        errors: errors,
        moderation_actions: moderationActions,
        tickets,
        suggestions,
        giveaways,
        xp,
        economy,
        music,
        uptime_data: uptimeData,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
