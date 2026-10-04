import { NextResponse } from 'next/server';
import { ensureCatalog, GAME_CATALOG } from '@/app/lib/gameserver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import GameDefinition, { isNewFlag } from '@/app/lib/models/GameDefinition';
import dbConnect from '@/app/lib/mongodb';
import { DatabaseConfigError } from '@/app/lib/db/clusters';
import { scrubSecrets } from '@/app/lib/db-health';

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
        featured: Boolean(d.featured), isNewItem: isNewFlag(d),
        maxPlaysPerDay: Number(d.maxPlaysPerDay ?? g.maxPlaysPerDay),
      };
    });
    return NextResponse.json({ success: true, games });
  } catch (error) {
    // An unconfigured cluster is a deployment problem, not a server fault:
    // report it as 503 with the variable NAME that has to be set, so whoever
    // deploys this can fix it. The URI itself never appears here.
    if (error instanceof DatabaseConfigError) {
      console.error(
        `[games/definitions] ${error.state}: ${error.variable ?? 'cluster URI'} is not configured`,
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Game catalog is unavailable: the database is not configured',
          state: error.state,
          missingVariable: error.variable,
        },
        { status: 503 },
      );
    }
    // Anything else is a genuine failure. Log the scrubbed message so the
    // cause is diagnosable instead of vanishing into an empty catch.
    const message = error instanceof Error ? error.message : String(error);
    console.error('[games/definitions] failed:', scrubSecrets(message));
    return NextResponse.json({ success: false, error: 'Could not load games' }, { status: 500 });
  }
}
