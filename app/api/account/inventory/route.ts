import { NextResponse } from 'next/server';
import { getIdentityWithId } from '@/app/lib/identity';
import { listInventory } from '@/app/lib/services/inventory';
import { ITEM_KINDS, type ItemKind } from '@/app/lib/models/InventoryItem';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/account/inventory — the ONE inventory.
//
// Owned items, wherever they came from: the shop, a game prize, an event. This
// is a read of the caller's own record; there is no `?userId=` and no way to
// ask for someone else's. Identity comes from the session.
//
// `?kind=game|discord|website` filters what an item is FOR. That filter is
// how Murastream/games/Discord discover what applies to them without this
// route knowing any of them: an item only appears under `discord` if it
// declared itself deliverable, so ownership never implies a server-currency
// conversion that nobody configured.

export async function GET(req: Request) {
  const user = await getIdentityWithId(req);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Sign in required', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const requested = url.searchParams.get('kind');
  const kind = requested && (ITEM_KINDS as readonly string[]).includes(requested)
    ? (requested as ItemKind)
    : undefined;

  const inventory = await listInventory(user, kind ? { kind } : {});
  return NextResponse.json({
    success: true,
    userId: user.userId,
    kinds: ITEM_KINDS,
    items: inventory?.items ?? [],
    count: inventory?.items.length ?? 0,
    note: 'Owning an item never converts it into Discord server currency. '
      + 'Only items declared with kind="discord" are deliverable, and their value is configured explicitly.',
  });
}