#!/usr/bin/env python3
"""Export the canonical item catalog for the web app.

`discord-bot/bot/items.py` is the single source of truth. The dashboard must
never define its own item table — that is how catalogs drift — so the site
reads a generated JSON snapshot instead. `scripts/check-items-parity.mjs`
re-runs this in CI and fails if the committed snapshot is stale.

Usage: python3 discord-bot/scripts/export_items.py [--check]
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "discord-bot" / "bot"))

import items as itemdb  # noqa: E402

OUT = ROOT / "app" / "lib" / "items-table.json"


def build() -> dict:
    rows = []
    for row in sorted(itemdb.CATALOG.values(), key=lambda r: r["item_id"]):
        rows.append({
            "id": row["item_id"],
            "name": row["name"],
            "description": row["description"],
            "category": row["category"],
            "rarity": row["rarity"],
            "buyPrice": row["buy_price"],
            "sellPrice": row["sell_price"],
            "stackable": row["stackable"],
            "tradeable": row["tradeable"],
            "sellable": row["sellable"],
            "usable": row["usable"],
            "equipable": row["equipable"],
            "effectType": row["effect_type"] or None,
            "effectValue": row["effect_value"],
            "effectDuration": row["effect_duration"],
            "dropSources": list(row["drop_sources"]),
            "active": row["active"],
        })
    return {
        "version": 1,
        "rarities": list(itemdb.RARITIES),
        "categories": list(itemdb.CATEGORIES),
        "rarityColors": itemdb.RARITY_COLORS,
        "rarityEmoji": itemdb.RARITY_EMOJI,
        "categoryEmoji": itemdb.CATEGORY_EMOJI,
        "categoryLabels": itemdb.CATEGORY_LABELS,
        "effectTypes": list(itemdb.EFFECT_TYPES),
        "lootTables": itemdb.LOOT_TABLES,
        "sourceDropChance": itemdb.SOURCE_DROP_CHANCE,
        "counts": itemdb.catalog_counts(),
        "items": rows,
    }


def main() -> int:
    payload = json.dumps(build(), indent=2, sort_keys=True) + "\n"
    if "--check" in sys.argv:
        if not OUT.exists():
            print(f"FAIL: {OUT} is missing — run python3 discord-bot/scripts/export_items.py")
            return 1
        current = OUT.read_text(encoding="utf-8")
        if current != payload:
            print(f"FAIL: {OUT.name} is stale. Re-run python3 discord-bot/scripts/export_items.py")
            return 1
        print(f"items-table.json up to date ({len(build()['items'])} items)")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload, encoding="utf-8")
    print(f"wrote {OUT} ({len(build()['items'])} items)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
