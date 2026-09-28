import { NextResponse } from 'next/server';
import { ensureCatalog, GAME_CATALOG } from '@/app/lib/gameserver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import GameDefinition from '@/app/lib/models/GameDefinition';
import dbConnect from '@/app/lib/mongodb';

// GET /api/games/definitions — public catalog of enabled games for the hub.
export async function GET() {
  try {
    await ensureCatalog();
    await dbConnect();
    const defs = await GameDefinition.find({ enabled: true }).sort({ sortOrder: 1 }).lean();
    const byId = new Map(defs.map((d) => [d.gameId, d]));
    // Catalog order wins; DB rows supply admin tuning.
    const games = GAME_CATALOG.filter((g) => byId.has(g.gameId)).map((g) => {
      const d = byId.get(g.gameId) as Record<string, unknown>;
      return {
        gameId: g.gameId, title: String(d.title ?? g.title),
        description: String(d.description ?? g.description),
        category: String(d.category ?? g.category), route: g.route,
        featured: Boolean(d.featured), isNew: Boolean(d.isNew),
        maxPlaysPerDay: Number(d.maxPlaysPerDay ?? g.maxPlaysPerDay),
      };
    });
    return NextResponse.json({ success: true, games });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load games' }, { status: 500 });
  }
}
