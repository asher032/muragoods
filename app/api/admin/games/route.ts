import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import GameDefinition from '@/app/lib/models/GameDefinition';
import { requireAdminEither as requireAdmin } from '@/app/lib/admin-guard';
import { ensureCatalog } from '@/app/lib/gameserver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin game management: list/tune games without deploys. No secrets here —
// tuning fields only (rewards, cooldowns, visibility).
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (gate.response) return gate.response;
  try {
    await ensureCatalog();
    await dbConnect();
    const games = await GameDefinition.find({}).sort({ sortOrder: 1 }).lean();
    return NextResponse.json({ success: true, games });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load games' }, { status: 500 });
  }
}

// PATCH /api/admin/games { gameId, patch: {enabled?, featured?, isNew?, maxPlaysPerDay?, cooldownSec?, xpPerPlay?, title?, description?, category?} }
export async function PATCH(req: Request) {
  const gate = await requireAdmin(req);
  if (gate.response) return gate.response;
  try {
    const body = await req.json().catch(() => ({}));
    const gameId = String(body.gameId || '');
    const patch = (body.patch || {}) as Record<string, unknown>;
    if (!gameId) return NextResponse.json({ success: false, error: 'gameId required' }, { status: 400 });
    const allowed: Record<string, (v: unknown) => unknown> = {
      enabled: (v) => Boolean(v),
      featured: (v) => Boolean(v),
      isNew: (v) => Boolean(v),
      maxPlaysPerDay: (v) => Math.max(1, Math.min(999, Math.floor(Number(v) || 1))),
      cooldownSec: (v) => Math.max(0, Math.min(86400, Math.floor(Number(v) || 0))),
      xpPerPlay: (v) => Math.max(0, Math.min(100, Math.floor(Number(v) || 0))),
      title: (v) => String(v).slice(0, 80),
      description: (v) => String(v).slice(0, 300),
      category: (v) => ['chance', 'activities', 'simulation', 'progression', 'social', 'arcade', 'daily'].includes(String(v)) ? String(v) : undefined,
    };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, fn] of Object.entries(allowed)) {
      if (patch[k] !== undefined) {
        const v = fn(patch[k]);
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
