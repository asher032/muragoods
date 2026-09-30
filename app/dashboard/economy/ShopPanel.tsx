'use client';

import { useMemo, useState } from 'react';
import type { ShopItem, ShopSection } from './useEconomyData';

// ── 🛒 Shop ─────────────────────────────────────────────────────────────
// Renders the canonical catalog exactly as the shop will sell it: one entry
// per item whose `shop_enabled` is true. Epic and Godly items appear and are
// purchasable like any other — rarity is never a gate here or in the bot.
//
// Prices and sell values are ECONOMIC values: displayed read-only, and only
// the Murabot owner may change them (in the bot catalog, enforced server-side).

const RARITY_EMOJI: Record<string, string> = {
  common: '⚪', uncommon: '🟢', rare: '🔵', epic: '🟣', godly: '🟡',
};
const RARITY_COLOR: Record<string, string> = {
  common: '#9ca3af', uncommon: '#22c55e', rare: '#3b82f6', epic: '#a855f7', godly: '#f59e0b',
};
const CATEGORY_LABEL: Record<string, string> = {
  consumable: 'Consumable', collectible: 'Collectible', equipment: 'Equipment',
  sellable: 'Sellable', trinket: 'Trinket', loot_box: 'Loot Box', pack: 'Pack',
  buff: 'Buff', debuff: 'Debuff',
};

export default function ShopPanel({ items, sections, countsByRarity, currencySymbol, guildId }: {
  items: ShopItem[];
  sections: ShopSection[];
  countsByRarity: Record<string, number>;
  currencySymbol: string;
  guildId: string;
}) {
  const [section, setSection] = useState('');
  const [rarity, setRarity] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category))].sort(),
    [items],
  );

  // Filters run against the real catalog rows, so every count is live.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (section && i.section !== section) return false;
      if (rarity && i.rarity !== rarity) return false;
      if (category && i.category !== category) return false;
      if (q && !i.name.toLowerCase().includes(q) && !i.id.includes(q)) return false;
      return true;
    });
  }, [items, section, rarity, category, query]);

  // A visible arbitrage warning is worth surfacing even though the catalog
  // now refuses to define such a row — the invariant could regress.
  const arbitrage = filtered.filter(
    (i) => i.buyPrice > 0 && i.sellPrice > 0 && i.sellPrice >= i.buyPrice,
  );

  const selectStyle = {
    background: 'var(--cc-bg)', color: 'var(--cc-text)',
    border: '1px solid var(--cc-border, #2a2a3a)', borderRadius: 6,
    padding: '6px 8px', fontSize: 12.5,
  } as const;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shop items…"
          style={{ ...selectStyle, minWidth: 170, flex: '1 1 170px' }}
        />
        <select value={section} onChange={(e) => setSection(e.target.value)} style={selectStyle}>
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <select value={rarity} onChange={(e) => setRarity(e.target.value)} style={selectStyle}>
          <option value="">All rarities</option>
          {Object.keys(RARITY_EMOJI).map((r) => (
            <option key={r} value={r}>
              {RARITY_EMOJI[r]} {r} ({countsByRarity[r] ?? 0})
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>
          ))}
        </select>
      </div>

      {/* Rotations come from the bot's own bucket clock. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {sections.map((s) => {
          const count = items.filter((i) => i.section === s.id).length;
          return (
            <div key={s.id} className="cc-card" style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'var(--cc-text-faint)' }}>
                {count} item{count === 1 ? '' : 's'} · rotates in {s.rotatesIn}
              </div>
            </div>
          );
        })}
      </div>

      {arbitrage.length > 0 && (
        <div className="cc-alert cc-alert-error" style={{ marginBottom: 10 }} role="alert">
          <strong>🛡️ {arbitrage.length} item(s) would allow buy→sell profit</strong>
          <div style={{ marginTop: 4 }}>
            The catalog now refuses to define such a row, and the sell path re-checks at write time.
            Affected: {arbitrage.map((i) => i.name).join(', ')}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--cc-text-faint)', marginBottom: 8 }}>
        Showing <strong style={{ color: '#fff' }}>{filtered.length}</strong> of {items.length} shop items
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {filtered.map((item) => (
          <div key={item.id} className="cc-card" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ color: RARITY_COLOR[item.rarity] ?? '#fff', fontSize: 13 }}>
                {RARITY_EMOJI[item.rarity] ?? '⚪'} {item.name}
              </strong>
              <span style={{ fontSize: 11, color: 'var(--cc-text-faint)' }}>
                {CATEGORY_LABEL[item.category] ?? item.category}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--cc-text-dim)' }}>
                {sections.find((s) => s.id === item.section)?.label ?? item.section}
              </span>
            </div>
            <div style={{ marginTop: 5, fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
              <strong style={{ color: '#fff' }}>{item.buyPrice.toLocaleString()} {currencySymbol}</strong>
              {' · sells '}
              <strong style={{ color: item.sellable ? '#fff' : 'var(--cc-text-faint)' }}>
                {item.sellPrice > 0 ? `${item.sellPrice.toLocaleString()} ${currencySymbol}` : 'not sellable'}
              </strong>
            </div>
            <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
              {item.stock === null
                ? '♾️ Unlimited stock'
                : item.stock <= 0
                  ? '❌ Out of stock this rotation'
                  : `📦 ${item.stock} left this rotation`}
              {item.effectType ? ` · effect: ${item.effectType}` : ''}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>
          No shop items match these filters.
        </p>
      )}

      <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
        🔒 Prices and sell values are economic values — Bot Owner only. The dashboard shows them
        read-only; changes are made in the bot catalog and enforced server-side.
        Server <code>{guildId}</code>.
      </p>
    </div>
  );
}