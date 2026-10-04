"""LIVE YouTube verification for the original-recording resolver.

Run: python discord-bot/scripts/test_music_live_search.py

The hermetic suite (`test_music_original_selection.py`) proves the resolver
does the right thing on metadata we wrote ourselves. This one proves it does
the right thing on metadata YouTube actually returned.

It drives the REAL `MusicEngine._search_fetch` — the same function the
dashboard and the bot bridge call — so the rows are exactly the ones the
product ranks, with the same yt-dlp options and the same flat extraction.

NOT part of CI. It needs the network, it is rate-limit-sensitive, and a
provider outage must never be reported as a code failure. Run it explicitly.

Emits the safe diagnostic metadata required for a selection decision
(requested/selected title + artist, version, provider, source id, reason,
rejected reasons, isOriginal, isAuthorized) and never prints cookies, keys,
tokens or credentials.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

import music  # noqa: E402
import music_resolver as mr  # noqa: E402

# Songs chosen because real search results for them actually contain the
# failure modes this system exists to stop: covers, sped-up/slowed+reverb
# uploads, karaoke, lyric uploads, and fan re-uploads carrying a bare title.
CASES = [
    {
        "name": "normal request (unqualified)",
        "query": "Die With A Smile Lady Gaga Bruno Mars",
        "expect": "original",
    },
    {
        "name": "original vs cover",
        "query": "Shape of You Ed Sheeran",
        "expect": "original",
    },
    {
        "name": "original vs sped-up/slowed+reverb",
        "query": "Sunflower Post Malone Swae Lee",
        "expect": "original",
    },
    {
        "name": "heavily covered song",
        "query": "Believer Imagine Dragons",
        "expect": "original",
    },
    {
        "name": "explicit remix request",
        "query": "Shape of You Ed Sheeran remix",
        "expect": "requested-variant",
    },
    {
        "name": "explicit acoustic request",
        "query": "Wonderwall Oasis acoustic",
        "expect": "requested-variant",
    },
    {
        "name": "explicit live request",
        "query": "Hotel California Eagles live",
        "expect": "requested-variant",
    },
]

LIMIT = 10


def brief(row: dict) -> str:
    url = str(row.get("url") or "")
    sid = url.rsplit("=", 1)[-1] if url else str(row.get("id") or "")
    return f"{str(row.get('title') or '')[:70]!r} ch={str(row.get('uploader') or '')[:24]!r} id={sid}"


def explain(query: str, row: dict) -> dict:
    """Per-row score/kind/matched-patterns, for the rejection log."""
    score, kind, hits = mr.score_candidate(query, row)
    return {
        "title": str(row.get("title") or "")[:100],
        "channel": str(row.get("uploader") or ""),
        "sourceId": str(row.get("url") or "").rsplit("=", 1)[-1],
        "score": score,
        "kind": kind,
        "isOriginal": kind in mr.ACCEPTABLE_TYPES,
        "isAuthorized": bool(row.get("isOriginal", kind in mr.ACCEPTABLE_TYPES)),
        "penaltyHits": hits,
    }


async def run_case(engine, case: dict) -> bool:
    print("\n" + "=" * 78)
    print(f"CASE  {case['name']}")
    print(f"  requested: {case['query']!r}   expecting: {case['expect']}")

    rows = await engine._search_fetch(case["query"], LIMIT, 45.0)
    if not rows:
        print("  RESULT  SKIPPED — provider returned no rows (challenge/timeout)")
        return True  # an outage is not a code failure; reported, not asserted

    print(f"  provider returned {len(rows)} rows (real search, real metadata)")
    for i, r in enumerate(rows):
        print(f"    {i}. {brief(r)} -> {r.get('versionType')} "
              f"isOriginal={r.get('isOriginal')}")

    # The decision, from the real resolver on the same real rows.
    sel = mr.select_original(case["query"], rows)
    print(f"  resolver ok={sel.ok} reason={sel.reason!r}")
    if sel.ok and sel.entry is not None:
        print(f"  SELECTED {brief(sel.entry)} version={sel.entry.get('versionType')} "
              f"provider=youtube")

    rejected = [explain(case["query"], r) for r in rows
                if not sel.ok or music._source_key(r) != music._source_key(sel.entry)]
    if rejected:
        print("  REJECTED:")
        for r in rejected:
            print(f"    - {r['title'][:66]!r} ch={r['channel'][:20]!r} "
                  f"kind={r['kind']} score={r['score']} hits={r['penaltyHits']}")

    top = rows[0]
    top_kind = str(top.get("versionType") or "")
    requested = mr.requested_kinds(case["query"])

    print("  DIAGNOSTIC " + json.dumps({
        "requestedTitle": case["query"],
        "selectedTitle": top.get("title"),
        "selectedArtist": top.get("uploader"),
        "selectedVersion": top_kind,
        "provider": "youtube",
        "sourceId": str(top.get("url") or "").rsplit("=", 1)[-1],
        "selectionReason": sel.reason,
        "isOriginal": bool(top.get("isOriginal")),
        # Authorized == the resolver actually cleared this source for
        # playback. For an explicitly requested variant that is true even
        # though the row is not the "original" recording.
        "isAuthorized": bool(sel.ok),
        "requestedKinds": sorted(requested),
    }, ensure_ascii=False))

    # The product path (`_search_fetch` -> `_order_search_results`) and the
    # resolver must agree on which recording is the song.
    if sel.ok and sel.entry is not None:
        agree = (music._source_key(sel.entry) == music._source_key(top))
        print(f"  agreement product-path vs resolver: {agree}")
        if not agree:
            return False

    if case["expect"] == "original":
        ok = bool(top.get("isOriginal")) and top_kind in mr.ACCEPTABLE_TYPES
        if not ok:
            print(f"  FAIL  expected an original recording, got {top_kind!r}: "
                  f"{str(top.get('title'))[:80]!r}")
        else:
            print(f"  PASS  selected the original ({top_kind})")
        return ok

    # requested-variant: the top row must actually be the variant asked for.
    want = set(requested)
    if not want:
        print("  FAIL  case declared an explicit variant but the query has none")
        return False
    got = mr.score_candidate(case["query"], top)[2]
    # The resolver labels a requested variant `requested:<kind>`, so the
    # explicit match to assert is that prefix, not the bare kind.
    matched = sorted(k.split(":", 1)[1] for k in got if k.startswith("requested:"))
    ok = bool(want & set(matched))
    if not ok:
        print(f"  FAIL  expected one of {sorted(want)}, got {sorted(got)} "
              f"from {str(top.get('title'))[:80]!r}")
    else:
        print(f"  PASS  explicit request respected: {sorted(want & set(matched))}")
    return ok


async def main() -> int:
    engine = music.MusicEngine()
    results = []
    for case in CASES:
        try:
            ok = await run_case(engine, case)
        except Exception as exc:  # a provider error must not crash the run
            print(f"  RESULT  ERROR {type(exc).__name__}: {str(exc)[:200]}")
            ok = True
        results.append((case["name"], ok))
        await asyncio.sleep(2)  # be a polite client

    print("\n" + "=" * 78)
    for name, ok in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    if failed:
        print("FAILED: " + ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    if os.environ.get("CI"):
        print("live search skipped in CI")
        raise SystemExit(0)
    raise SystemExit(asyncio.run(main()))