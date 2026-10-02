import mongoose from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────
// The unified Muragoods inventory.
//
// A user should own ONE set of things. Today the answer is different
// depending on where you look: purchases are Orders, game prizes are
// GameReward rows, mystery-box discounts are a localStorage key on one
// device, and there is no shared record that says "this person owns these
// items" anywhere. That is why an item bought on the shop could not appear in
// a game, and why a discount won on one phone was invisible on another.
//
// This collection is that missing record. It is deliberately NOT a wallet and
// NOT currency — it holds *items* (tickets, cosmetics, unlocks, event badges).
// Points live in the points ledger; server economy lives in Murabot. Mixing
// them here is exactly the "silently become 500 Discord coins" failure the
// brief warns about.
//
// One row per (user, item, grantKey). `grantKey` makes grants idempotent:
// re-running the same purchase webhook, the same achievement claim, or the
// same event dispatch twice credits the item once. That is what lets callers
// be careless about retries without double-granting.
//
// `kind` records what an item is FOR, not where it came from:
//   'website'  cosmetic/site-only, no external effect
//   'game'     unlocks a game feature
//   'discord'  deliverable to Murabot
// A cross-system effect is therefore something an item explicitly declares.
// An item is never assumed to be worth server currency.
// ─────────────────────────────────────────────────────────────────────────

export const ITEM_KINDS = ['website', 'game', 'discord'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

const InventoryItemSchema = new mongoose.Schema({
  canonicalUserId: { type: String, required: true, index: true },
  // LEGACY owner key (lowercased email), still written and still matched.
  userEmail: { type: String, required: true, index: true },

  /** Stable item id, e.g. 'adventure-ticket'. */
  itemId: { type: String, required: true },
  /** Display name; the itemId stays the key even if this is renamed. */
  name: { type: String, default: '', maxlength: 120 },
  /** Emoji/asset hint for the UI. Cosmetic only. */
  icon: { type: String, default: '', maxlength: 16 },
  description: { type: String, default: '', maxlength: 300 },

  /** What this item is for. Drives whether Murabot/games act on it. */
  kind: { type: String, enum: ITEM_KINDS, default: 'website', index: true },

  /** Positive quantity. Stackable items merge; uniques do not. */
  quantity: { type: Number, default: 1, min: 0 },
  /** Non-stackable items (cosmetics, unlocks) get one row per grant. */
  stackable: { type: Boolean, default: true },

  /**
   * Idempotency key for THIS grant. Unique together with itemId so the same
   * event cannot credit the same item twice.
   */
  grantKey: { type: String, required: true },

  /** Where it came from: 'shop', 'game', 'event', 'admin' … */
  source: { type: String, default: '', index: true },
  /** A related order id, game id or event id. */
  reference: { type: String, default: '', index: true },

  /** Item-specific data (unlock id, ticket perks, expiry rules). */
  metadata: { type: Map, of: String, default: undefined },

  acquiredAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'user_inventory' });

// The unique pair is what makes a repeated grant a no-op rather than a second
// row. Two concurrent inserts of the same (user, item, grantKey) race to the
// index and exactly one wins.
InventoryItemSchema.index(
  { canonicalUserId: 1, itemId: 1, grantKey: 1 },
  { unique: true },
);
InventoryItemSchema.index({ canonicalUserId: 1, acquiredAt: -1 });
InventoryItemSchema.index({ canonicalUserId: 1, kind: 1 });

export default mongoose.models.InventoryItem ||
  mongoose.model('InventoryItem', InventoryItemSchema);