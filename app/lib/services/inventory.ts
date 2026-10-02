import dbConnect from '@/app/lib/mongodb';
import InventoryItem, { ITEM_KINDS, type ItemKind } from '@/app/lib/models/InventoryItem';
import type { CanonicalUser } from '@/app/lib/identity';

// ─────────────────────────────────────────────────────────────────────────
// THE inventory service.
//
// Like points, the failure mode this prevents is a SECOND writer. Orders grant
// items, games grant items, events grant items — and each of those used to
// express that in its own way (or, in one case, in a browser's localStorage).
// Three writers means three ideas of what the user owns.
//
// Contract:
//   grant()   credit items; idempotent on (user, itemId, grantKey)
//   consume() remove/ decrement; idempotent on grantKey so a double "use" of
//             one item cannot burn two
//   list()    the caller's inventory. Only ever the caller's.
//
// Nothing here converts an item into server currency. An item is worth Discord
// coins only if something explicitly declares it, and that conversion is a
// Murabot concern reading the item — not a side effect of owning it.
// ─────────────────────────────────────────────────────────────────────────

export type GrantOutcome = 'granted' | 'already_granted' | 'rejected';

export interface GrantItemInput {
  itemId: string;
  name?: string;
  icon?: string;
  description?: string;
  kind?: ItemKind;
  quantity?: number;
  stackable?: boolean;
  /** Idempotency key. Derive it from the EVENT (order id, session token). */
  grantKey: string;
  source?: string;
  reference?: string;
  metadata?: Record<string, string>;
}

export type InventoryResult =
  | { ok: true; outcome: GrantOutcome; itemId: string; quantity: number }
  | { ok: false; code: 'UNAUTHENTICATED' | 'INVALID_ITEM' | 'WRITE_FAILED'; error: string; itemId: string };

const ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const MAX_STACK = 9999;

function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: number; message?: string } | null;
  return Boolean(e && (e.code === 11000 || /E11000|duplicate key/i.test(e.message || '')));
}

export function isValidItemId(id: string): boolean {
  return ITEM_ID_PATTERN.test(id);
}

/**
 * Credit one or more items.
 *
 * `grantKey` is what makes this safe to call from a webhook that retries. The
 * caller does not need to know whether it already ran.
 */
export async function grantItems(
  user: CanonicalUser | null,
  items: GrantItemInput[],
): Promise<InventoryResult[]> {
  if (!user?.userId) {
    return [{ ok: false, code: 'UNAUTHENTICATED', error: 'Sign in required', itemId: '' }];
  }
  await dbConnect();

  const results: InventoryResult[] = [];
  const emailLc = user.emailLc;
  const now = new Date();

  for (const item of items) {
    const itemId = String(item.itemId || '').trim().toLowerCase();
    if (!isValidItemId(itemId) || !item.grantKey) {
      results.push({ ok: false, code: 'INVALID_ITEM', error: 'Invalid item id or grant key', itemId });
      continue;
    }
    const kind = item.kind && (ITEM_KINDS as readonly string[]).includes(item.kind) ? item.kind : 'website';
    const quantity = Math.max(1, Math.min(MAX_STACK, Math.trunc(item.quantity ?? 1)));
    const stackable = item.stackable !== false;

    try {
      if (stackable) {
        // Stackables merge, so the grant key is part of the match: a repeat of
        // the SAME grant finds the row it already wrote and does not add.
        await InventoryItem.updateOne(
          { canonicalUserId: user.userId, itemId, grantKey: item.grantKey },
          {
            $setOnInsert: {
              canonicalUserId: user.userId, userEmail: emailLc, itemId,
              name: item.name || itemId, icon: item.icon || '', description: item.description || '',
              kind, stackable: true, grantKey: item.grantKey,
              source: item.source || '', reference: item.reference || '',
              metadata: item.metadata, acquiredAt: now, createdAt: now, updatedAt: now,
            },
            $inc: { quantity },
            $set: { updatedAt: now },
          },
          { upsert: true },
        );
        const row = await InventoryItem.findOne({ canonicalUserId: user.userId, itemId, grantKey: item.grantKey })
          .select('quantity').lean<{ quantity?: number } | null>();
        results.push({ ok: true, outcome: 'granted', itemId, quantity: row?.quantity ?? quantity });
      } else {
        // Uniques must not merge, so the whole (user, item, grantKey) tuple is
        // the identity and a repeat trips the unique index instead of adding.
        await InventoryItem.create({
          canonicalUserId: user.userId, userEmail: emailLc, itemId,
          name: item.name || itemId, icon: item.icon || '', description: item.description || '',
          kind, stackable: false, quantity: 1, grantKey: item.grantKey,
          source: item.source || '', reference: item.reference || '',
          metadata: item.metadata, acquiredAt: now, createdAt: now, updatedAt: now,
        });
        results.push({ ok: true, outcome: 'granted', itemId, quantity: 1 });
      }
    } catch (err) {
      if (isDuplicateKey(err)) {
        const row = await InventoryItem.findOne({ canonicalUserId: user.userId, itemId, grantKey: item.grantKey })
          .select('quantity').lean<{ quantity?: number } | null>();
        results.push({ ok: true, outcome: 'already_granted', itemId, quantity: row?.quantity ?? quantity });
        continue;
      }
      results.push({ ok: false, code: 'WRITE_FAILED', error: 'Item could not be granted', itemId });
    }
  }

  return results;
}

/**
 * Spend items. Idempotent against double-use via a `useKey`, so "redeem this
 * ticket" replayed by a retrying client burns the ticket once.
 *
 * Reports which items were actually consumed rather than assuming success, so
 * a caller can say precisely what happened.
 */
export async function consumeItems(
  user: CanonicalUser | null,
  requests: { itemId: string; quantity?: number; useKey: string }[],
): Promise<{ ok: boolean; consumed: string[]; refused: Array<{ itemId: string; reason: string }> }> {
  const empty = { ok: false, consumed: [] as string[], refused: [] as Array<{ itemId: string; reason: string }> };
  if (!user?.userId) return { ...empty, refused: [{ itemId: '', reason: 'Sign in required' }] };
  await dbConnect();

  const consumed: string[] = [];
  const refused: Array<{ itemId: string; reason: string }> = [];

  for (const req of requests) {
    const itemId = String(req.itemId || '').trim().toLowerCase();
    if (!isValidItemId(itemId)) {
      refused.push({ itemId, reason: 'Invalid item id' });
      continue;
    }
    const want = Math.max(1, Math.trunc(req.quantity ?? 1));

    // Already spent under this key → do nothing, report it as consumed.
    const alreadySpent = await InventoryItem.findOne({
      canonicalUserId: user.userId, itemId, 'metadata.useKey': req.useKey,
    }).select('_id').lean<{ _id?: unknown } | null>();
    if (alreadySpent) {
      consumed.push(itemId);
      continue;
    }

    const holder = await InventoryItem.findOne({ canonicalUserId: user.userId, itemId, quantity: { $gte: want } })
      .sort({ acquiredAt: 1 }).select('_id quantity').lean<{ _id: unknown; quantity: number } | null>();
    if (!holder) {
      refused.push({ itemId, reason: 'Not enough items' });
      continue;
    }

    const updated = await InventoryItem.findOneAndUpdate(
      { _id: holder._id, quantity: { $gte: want } },
      { $inc: { quantity: -want }, $set: { updatedAt: new Date(), 'metadata.useKey': req.useKey } },
      { new: true },
    ).select('quantity').lean<{ quantity?: number } | null>();

    if (!updated) {
      // Lost a race with a concurrent consume; the guarded `$gte` stopped it
      // from overdrawing, which is the point of the guard.
      refused.push({ itemId, reason: 'Not enough items' });
      continue;
    }
    consumed.push(itemId);
  }

  return { ok: refused.length === 0, consumed, refused };
}

/** The caller's inventory. Resolved from the session, never from a parameter. */
export async function listInventory(
  user: CanonicalUser | null,
  opts: { kind?: ItemKind } = {},
): Promise<{
  userId: string;
  items: Array<{
    itemId: string; name: string; icon: string; description: string;
    kind: string; quantity: number; stackable: boolean;
    source: string; reference: string; acquiredAt: string;
  }>;
} | null> {
  if (!user?.userId) return null;
  await dbConnect();

  const filter: Record<string, unknown> = { canonicalUserId: user.userId, quantity: { $gt: 0 } };
  if (opts.kind) filter.kind = opts.kind;

  // Two rows for the same itemId are two different GRANTS, so they are
  // reported separately rather than summed — the grant key is part of what
  // the item is.
  const rows = await InventoryItem.find(filter).sort({ acquiredAt: -1 }).limit(500)
    .lean<Array<{
      itemId: string; name: string; icon: string; description: string; kind: string;
      quantity: number; stackable: boolean; source: string; reference: string; acquiredAt: Date;
    }>>();

  return {
    userId: user.userId,
    items: rows.map((r) => ({
      itemId: r.itemId,
      name: r.name || r.itemId,
      icon: r.icon || '',
      description: r.description || '',
      kind: r.kind,
      quantity: r.quantity,
      stackable: Boolean(r.stackable),
      source: r.source || '',
      reference: r.reference || '',
      acquiredAt: new Date(r.acquiredAt).toISOString(),
    })),
  };
}