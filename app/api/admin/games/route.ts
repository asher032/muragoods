import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import GameDefinition, { isNewFlag } from '@/app/lib/models/GameDefinition';
import { requireStaff } from '@/app/lib/access-control';
import { ensureCatalog } from '@/app/lib/gameserver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin game management: list/tune games without deploys. No secrets here —
// tuning fields only (rewards, cooldowns, visibility).
export async function GET(req: Request) {
  const gate = await requireStaff(req, ['content']);
  if (!gate.ok) return gate.response;
  try {
    await ensureCatalog();
    await dbConnect();
    const rows = await GameDefinition.find({}).sort({ sortOrder: 1 }).lean();
    // Legacy `isNew` rows are surfaced as `isNewItem` (see isNewFlag) so the
    // admin UI has one shape whether or not the migration has run yet.
    const games = rows.map((row) => {
      const flag = isNewFlag(row as Record<string, unknown>);
      const rest = { ...(row as Record<string, unknown>) };
      delete rest.isNew; // legacy reserved key, superseded by isNewItem
      return { ...rest, isNewItem: flag };
    });
    return NextResponse.json({ success: true, games });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load games' }, { status: 500 });
  }
}

// PATCH /api/admin/games { gameId, patch: {enabled?, featured?, isNewItem?, maxPlaysPerDay?, cooldownSec?, xpPerPlay?, title?, description?, category?} }
export async function PATCH(req: Request) {
  const gate = await requireStaff(req, ['content']);
  if (!gate.ok) return gate.response;
  try {
    const body = await req.json().catch(() => ({}));
    const gameId = String(body.gameId || '');
    const patch = (body.patch || {}) as Record<string, unknown>;
    if (!gameId) return NextResponse.json({ success: false, error: 'gameId required' }, { status: 400 });
    const allowed: Record<string, (v: unknown) => unknown> = {
      enabled: (v) => Boolean(v),
      featured: (v) => Boolean(v),
      isNewItem: (v) => Boolean(v),
      maxPlaysPerDay: (v) => Math.max(1, Math.min(999, Math.floor(Number(v) || 1))),
      cooldownSec: (v) => Math.max(0, Math.min(86400, Math.floor(Number(v) || 0))),
      xpPerPlay: (v) => Math.max(0, Math.min(100, Math.floor(Number(v) || 0))),
      title: (v) => String(v).slice(0, 80),
      description: (v) => String(v).slice(0, 300),
      category: (v) => ['chance', 'activities', 'simulation', 'progression', 'social', 'arcade', 'daily'].includes(String(v)) ? String(v) : undefined,
    };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    // An older admin bundle still posts the pre-rename `isNew` key; accept it
    // as an alias so a cached client doesn't silently drop the change.
    const requested: Record<string, unknown> = { ...patch };
    if (requested.isNewItem === undefined && requested.isNew !== undefined) {
      requested.isNewItem = requested.isNew;
    }
    for (const [k, fn] of Object.entries(allowed)) {
      if (requested[k] !== undefined) {
        const v = fn(requested[k]);
        if (v !== undefined) update[k] = v;
      }
    }
    await dbConnect();
    const doc = await GameDefinition.findOneAndUpdate({ gameId }, { $set: update }, { new: true }).lean();
    if (!doc) return NextResponse.json({ success: false, error: 'Unknown game' }, { status: 404 });
    return NextResponse.json({ success: true, game: doc });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not save game' }, { status: 500 });
  }
}
