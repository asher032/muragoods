import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import GameProgress from '@/app/lib/models/GameProgress';
import { playerKey } from '@/app/lib/gameserver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/games/leaderboards?board=xp|plays|achievements|streak&gameId=spin&limit=20
// Only users with a PUBLIC game profile appear, identified by HMAC player
// key — emails never leave the server.
export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const board = searchParams.get('board') || 'xp';
    const gameId = searchParams.get('gameId') || '';
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit')) || 20));

    const pubUsers = await User.find({ 'privacy.gameProfile': 'public' })
      .select('email name avatar').lean() as Array<{ email: string; name?: string; avatar?: string }>;
    const pub = new Map(pubUsers.map((u) => [u.email.toLowerCase(), u]));
    if (!pub.size) return NextResponse.json({ success: true, board, entries: [] });

    const match: Record<string, unknown> = { userEmail: { $in: [...pub.keys()] } };
    if (gameId) match.gameId = gameId;

    let entries: Array<{ key: string; name: string; avatar: string; value: number; extra?: string }> = [];
    if (board === 'achievements') {
      const rows = await GameProgress.aggregate([
        { $match: match },
        { $group: { _id: '$userEmail', n: { $sum: { $size: { $ifNull: ['$achievements', []] } } }, xp: { $sum: '$xp' } } },
        { $sort: { n: -1, xp: -1 } },
        { $limit: limit },
      ]);
      entries = rows.map((r) => {
        const u = pub.get(r._id);
        return { key: playerKey(r._id), name: u?.name || 'Player', avatar: u?.avatar || '', value: r.n };
      });
    } else {
      const field = board === 'plays' ? 'plays' : board === 'streak' ? 'streak' : 'xp';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipeline: any[] = [{ $match: match }];
      if (gameId) {
        pipeline.push({ $sort: { [field]: -1 } }, { $limit: limit }, { $project: { userEmail: 1, value: `$${field}` } });
      } else {
        pipeline.push(
          { $group: { _id: '$userEmail', value: { $sum: `$${field}` } } },
          { $sort: { value: -1 } },
          { $limit: limit },
        );
      }
      const rows = await GameProgress.aggregate(pipeline);
      entries = rows.map((r) => {
        const email = (r.userEmail || r._id) as string;
        const u = pub.get(email);
        return { key: playerKey(email), name: u?.name || 'Player', avatar: u?.avatar || '', value: r.value || 0 };
      });
    }
    return NextResponse.json({ success: true, board, gameId: gameId || null, entries });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load leaderboard' }, { status: 500 });
  }
}
