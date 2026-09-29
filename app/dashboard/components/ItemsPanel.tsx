'use client';

// Read-only Muragoods item catalog for the dashboard.
//
// This panel renders `app/lib/items-table.json`, a snapshot generated from
// the bot's canonical catalog (discord-bot/bot/items.py). The dashboard never
// defines its own item table — `scripts/check-items-parity.mjs` fails the
// build when the snapshot drifts from the bot.
//
// Prices, rarity, effect values and drop probabilities are ECONOMIC values.
// They are shown for reference but are NOT editable here; only the Murabot
// owner may change them, and only in the bot catalog.

import { useMemo, useState } from 'react';
import table from '@/app/lib/items-table.json';

interface ItemRow {
  id: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  buyPrice: number;
  sellPrice: number;
  stackable: boolean;
  tradeable: boolean;
  sellable: boolean;
  usable: boolean;
  equipable: boolean;
  effectType: string | null;
  effectValue: number;
  effectDuration: number;
  dropSources: string[];
  active: boolean;
}

const ITEMS = table.items as ItemRow[];
const RARITIES = table.rarities as string[];
const CATEGORIES = table.categories as string[];

// The generated snapshot stores Discord colour ints and lookup maps with
// heterogeneous value types, so the inferred JSON type needs a widening cast.
const RARITY_COLORS = table.rarityColors as unknown as Record<string, number>;
const RARITY_EMOJI = table.rarityEmoji as unknown as Record<string, string>;
const CATEGORY_EMOJI = table.categoryEmoji as unknown as Record<string, string>;
const CATEGORY_LABELS = table.categoryLabels as unknown as Record<string, string>;
const LOOT_TABLES = table.lootTables as unknown as Record<
  string,
  { label: string; bands: Record<string, number> }
>;

const rarityColor = (rarity: string) =>
  `#${(RARITY_COLORS[rarity] ?? 0x9ca3af).toString(16).padStart(6, '0')}`;
const rarityEmoji = (rarity: string) => RARITY_EMOJI[rarity] ?? '⚪';
const categoryEmoji = (category: string) => CATEGORY_EMOJI[category] ?? '📦';
const categoryLabel = (category: string) => CATEGORY_LABELS[category] ?? category;

export default function ItemsPanel() {
  const [rarity, setRarity] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [showLoot, setShowLoot] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.filter((i) => {
      if (rarity && i.rarity !== rarity) return false;
      if (category && i.category !== category) return false;
      if (q && !i.name.toLowerCase().includes(q) && !i.id.includes(q)) return false;
      return true;
    });
  }, [rarity, category, query]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of RARITIES) out[r] = ITEMS.filter((i) => i.rarity === r).length;
    return out;
  }, []);

  const selectStyle = {
    background: 'var(--cc-bg)',
    color: 'var(--cc-text)',
    border: '1px solid var(--cc-border, #2a2a3a)',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 12.5,
  } as const;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items…"
          style={{ ...selectStyle, minWidth: 180, flex: '1 1 180px' }}
        />
        <select value={rarity} onChange={(e) => setRarity(e.target.value)} style={selectStyle}>
          <option value="">All rarities</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {rarityEmoji(r)} {r} ({counts[r]})
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryEmoji(c)} {categoryLabel(c)}
            </option>
          ))}
        </select>
        <button className="cc-btn" style={{ fontSize: 12 }} onClick={() => setShowLoot((v) => !v)}>
          {showLoot ? 'Hide' : 'Show'} loot tables
        </button>
        <span style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>
          {filtered.length} of {ITEMS.length} items
        </span>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        {RARITIES.map((r) => (
          <div key={r} className="cc-card" style={{ padding: '10px 14px' }}>
            <strong style={{ color: rarityColor(r), fontSize: 13 }}>
              {rarityEmoji(r)} {r[0].toUpperCase() + r.slice(1)}
            </strong>
            <span style={{ fontSize: 12, color: 'var(--cc-text-faint)', marginLeft: 8 }}>
              {counts[r]} items
              {r === 'godly' && ' — prestigious, collectible only (no effects, unsellable)'}
            </span>
          </div>
        ))}
      </div>

      {showLoot && (
        <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 16 }}>
          <strong style={{ color: '#fff', fontSize: 13 }}>📦 Loot tables · server-side</strong>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {Object.entries(LOOT_TABLES).map(
              ([id, t]) => (
                <div key={id} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                  <code>{id}</code> — {t.label}:{' '}
                  {Object.entries(t.bands).map(([band, w]) => (
                    <span key={band} style={{ marginRight: 8 }}>
                      {rarityEmoji(band)} {band} {w}%
                    </span>
                  ))}
                </div>
              )
            )}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--cc-text-faint)' }}>
            Probabilities are resolved on the server from the bot catalog. They are never sent to,
            or accepted from, a Discord client.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.slice(0, 60).map((i) => (
          <div key={i.id} className="cc-card" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ color: rarityColor(i.rarity), fontSize: 13 }}>
                {rarityEmoji(i.rarity)} {i.name}
              </strong>
              <span style={{ fontSize: 12, color: 'var(--cc-text-dim)', whiteSpace: 'nowrap' }}>
                {i.buyPrice > 0 ? `Buy ${i.buyPrice.toLocaleString()}` : 'Not for sale'}
                {' · '}
                {i.sellable ? `Sell ${i.sellPrice.toLocaleString()}` : 'Unsellable'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--cc-text-faint)', marginTop: 3 }}>
              <code>{i.id}</code> · {categoryEmoji(i.category)}{' '}
              {categoryLabel(i.category)}
              {i.effectType && ` · \`${i.effectType}\` +${Math.round(i.effectValue * 100)}%`}
              {i.effectDuration > 0 && ` for ${Math.max(1, Math.round(i.effectDuration / 60))} min`}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--cc-text-dim)', marginTop: 3 }}>
              {i.description}
            </div>
            {i.dropSources.length > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)', marginTop: 3 }}>
                Sources: {i.dropSources.join(', ')}
              </div>
            )}
          </div>
        ))}
        {filtered.length > 60 && (
          <p style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>
            Showing the first 60 — narrow the filters to see the rest.
          </p>
        )}
        {filtered.length === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--cc-text-faint)' }}>No items match those filters.</p>
        )}
      </div>

      <p style={{ marginTop: 14, fontSize: 12, color: 'var(--cc-text-faint)' }}>
        🔒 Prices, rarity, effect values, drop probabilities and cooldowns are economic values —
        <strong style={{ color: 'var(--cc-text-dim)' }}> Bot Owner only</strong>. Server admins can
        review this catalog but cannot change it, and the API rejects economic writes from
        non-owner accounts.
      </p>
    </div>
  );
}
