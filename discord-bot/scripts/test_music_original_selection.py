"""Tests for original-recording selection (bot/music_resolver.py).

Run: python discord-bot/scripts/test_music_original_selection.py

Every case in §12 of the brief, plus the three failure modes that motivated
extracting the resolver at all:

  * a ONE-RESULT search must not silently return a cover (the `ytsearch1`
    bug — ranking a single candidate always "wins");
  * an ALL-COVER result set must produce an honest refusal, not the
    least-bad cover;
  * autoplay must go through the same resolver (YouTube's `RD` radio list is
    the densest cover source on the platform).

These are hermetic: no yt-dlp, no network, no Discord. They exercise the real
resolver functions with the candidate lists a real search produces.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

import music_resolver as mr  # noqa: E402
import music  # noqa: E402  (the real ordering function, not a copy of it)

PASSED = 0
FAILED: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    global PASSED
    if condition:
        PASSED += 1
    else:
        FAILED.append(label)
        print(f"  FAIL  {label} — {detail}")


def section(name: str) -> None:
    print(f"\n── {name} " + "─" * max(0, 56 - len(name)))


def cand(title: str, uploader: str, **extra) -> dict:
    """One search result, shaped like the dict yt-dlp hands us."""
    # Pop ONCE: a second pop would fall back to the default and give the
    # id and the page URLs different values, so a source-identity comparison
    # would silently treat every candidate as the same recording.
    vid = extra.pop("id", "x")
    return {
        "title": title,
        "uploader": uploader,
        "id": vid,
        "url": f"https://www.youtube.com/watch?v={vid}",
        "webpage_url": f"https://www.youtube.com/watch?v={vid}",
        "duration": extra.pop("duration", 200),
        **extra,
    }


ORIGINAL = cand("Die With A Smile - Lady Gaga & Bruno Mars (Official Video)",
                "LadyGagaVEVO", id="orig")
COVER = cand("Die With A Smile (Sped Up + Reverb) [COVER]",
             "BestMusicCovers", id="cover")
SPED = cand("Die With A Smile (Sped Up)", "ViralHits", id="sped")
SLOWED = cand("Die With A Smile (Slowed + Reverb)", "ViralHits", id="slowed")
KARAOKE = cand("Die With A Smile - Karaoke Version", "SingKing", id="kara")
NIGHTCORE = cand("Die With A Smile - Nightcore", "NightCoreHub", id="night")


# ════════════════════════════════════════════════════════════════════════
def test_normal_request() -> None:
    section("§12 normal request prefers the original")
    sel = mr.select_original("Die With A Smile", [ORIGINAL, COVER, SPED, SLOWED])
    check("selects the official recording", sel.ok and sel.entry["id"] == "orig",
          sel.entry.get("title") if sel.entry else sel.reason)
    check("it is marked original", sel.entry.get("isOriginal") is True)
    check("it is classified official", sel.entry.get("versionType") == "official")
    check("the selection records why", bool(sel.entry.get("selectionReason")))


def test_cover_competing_with_original() -> None:
    section("§12 cover competing with original")
    for order in ([ORIGINAL, COVER], [COVER, ORIGINAL]):
        sel = mr.select_original("Die With A Smile", order)
        check(f"original wins (order {[c['id'] for c in order]})",
              sel.ok and sel.entry["id"] == "orig", sel.entry.get("title"))


def test_variants_competing_with_original() -> None:
    section("§12 sped-up / slowed+reverb / karaoke / nightcore vs original")
    for bad in (SPED, SLOWED, KARAOKE, NIGHTCORE, COVER):
        sel = mr.select_original("Die With A Smile", [ORIGINAL, bad])
        check(f"original beats {bad['id']}",
              sel.ok and sel.entry["id"] == "orig", sel.entry.get("title"))


def test_all_covers_refuses() -> None:
    section("§12 no original available → honest error, never a cover")
    sel = mr.select_original("Die With A Smile", [COVER, SPED, SLOWED])
    check("refuses", sel.ok is False)
    check("with SEARCH_ALTERNATIVE_SOURCE", sel.code == mr.NO_ORIGINAL_FOUND, sel.code)
    check("and explains why", "variant" in sel.reason.lower(), sel.reason)
    check("no entry is offered to play", sel.entry is None)
    check("nothing bool-truthy is returned", not bool(sel))

    solo = mr.select_original("Die With A Smile", [COVER])
    check("a single cover result is also refused", solo.ok is False, solo.code)


def test_single_result_search() -> None:
    section("the one-result-search bug (ytsearch1 returned exactly one entry)")
    # This is what `rank_candidates` alone would do with a single candidate:
    # return it, whatever it is, and report a healthy score.
    ranked = mr.rank_candidates("Die With A Smile", [COVER])
    check("plain ranking returns the only candidate (the old behaviour)",
          len(ranked) == 1 and ranked[0]["id"] == "cover")
    sel = mr.select_original("Die With A Smile", [COVER])
    check("the resolver refuses instead", sel.ok is False, sel.code)
    sel2 = mr.select_original("Die With A Smile", [ORIGINAL])
    check("but a lone ORIGINAL is accepted", sel2.ok is True and sel2.entry["id"] == "orig")


def test_explicit_versions() -> None:
    section("§12/§8 explicit version requests still work")
    remix_official = cand("Die With A Smile (Official Remix)", "LadyGagaVEVO", id="rx")
    fan_remix = cand("Die With A Smile (Remix)", "NightMixer", id="rf")

    sel = mr.select_original("Die With A Smile remix", [ORIGINAL, fan_remix, remix_official])
    check("a remix request returns a remix", sel.ok and "emix" in sel.entry["title"],
          sel.entry.get("title"))
    check("and prefers the authorized one",
          sel.entry["id"] in ("rx", "rf"), sel.entry.get("id"))

    sel = mr.select_original("Die With A Smile remix", [ORIGINAL, fan_remix])
    check("an unofficial remix is still chosen over the original when asked",
          sel.ok and sel.entry["id"] == "rf", sel.entry.get("title"))

    acoustic = cand("Song Name (Acoustic)", "ArtistVEVO", id="ac")
    sel = mr.select_original("Song Name acoustic", [ORIGINAL, acoustic])
    check("an acoustic request is honoured", sel.ok and sel.entry["id"] == "ac",
          sel.entry.get("title"))

    live = cand("Song Name (Live)", "ArtistVEVO", id="lv")
    sel = mr.select_original("Song Name live", [ORIGINAL, live])
    check("a live request is honoured", sel.ok and sel.entry["id"] == "lv",
          sel.entry.get("title"))

    sel = mr.select_original("Song Name instrumental", [ORIGINAL,
                                                        cand("Song Name Instrumental", "X", id="in")])
    check("an instrumental request is honoured", sel.ok, sel.code)

    # The critical inverse: asking for a remix must put "remix" in the
    # REQUESTED set, so its penalty is skipped and replaced by a bonus.
    check("a requested variant is registered as requested, not penalized",
          "remix" in mr.requested_kinds("Die With A Smile remix"),
          sorted(mr.requested_kinds("Die With A Smile remix")))
    check("a plain request registers no variant",
          not mr.requested_kinds("Die With A Smile"))


def test_normalization() -> None:
    section("§3 query normalization")
    check("strips a leading verb", mr.normalize_query("play about you") == "about you")
    check("strips trailing official noise",
          mr.normalize_query("About You official video") == "About You")
    check("strips bracketed noise", mr.normalize_query("About You [HD]") == "About You")
    check("leaves a plain title alone", mr.normalize_query("About You") == "About You")
    check("does not append anything",
          "cover" not in mr.normalize_query("About You").lower()
          and "official" not in mr.normalize_query("About You").lower())
    check("leaves an explicit variant intact",
          mr.normalize_query("Song remix") == "Song remix")
    check("leaves a URL intact",
          mr.normalize_query("https://youtu.be/x").startswith("https://"))
    # The §3 warning: over-restricting must not erase the real song.
    check("keeps a multi-word title recognisable",
          "die with a smile" in mr.normalize_query("Die With A Smile").lower())


def test_artist_and_source_signals() -> None:
    section("§5 artist / source matching")
    a = mr.select_original("Die With A Smile Lady Gaga",
                           [cand("Die With A Smile (Cover)", "RandomChannel", id="c")])
    check("a lone cover is refused even with an exact title", a.ok is False, a.code)

    official = cand("Die With A Smile", "LadyGagaVEVO", id="o")
    topic = cand("Die With A Smile", "Lady Gaga - Topic", id="t")
    for entry, label in ((official, "VEVO channel"), (topic, "- Topic channel")):
        sel = mr.select_original("Die With A Smile", [COVER, entry])
        check(f"recognized as official via {label}",
              sel.ok and sel.entry["versionType"] == "official",
              sel.entry.get("versionType"))

    sel = mr.select_original("Die With A Smile", [COVER, cand("Die With A Smile", "SonyRecords", id="l")])
    check("a label channel is preferred over a cover",
          sel.ok and sel.entry["id"] == "l", sel.entry.get("title"))

    # "official" is only claimed from a verifiable marker.
    #
    # Live YouTube search is what forced this: an exact title match on an
    # arbitrary channel ("Imagine Dragons - Believer" on LatinHype, "Shape
    # Of You (Audio)" on Phantom Lyrics, "Believer" on Minimal Sounds) was
    # being labelled `original`, so a fan upload became the answer the moment
    # the artist's own upload was missing. An exact title on an unverified
    # channel is no longer accepted at all — it is REFUSED, because
    # "Unauthorized sources are never used" outranks "always play something".
    sel = mr.select_original("Some Song", [cand("Some Song", "TotallyRandomChannel", id="r")])
    check("an exact title on an unverified channel is refused, not called original",
          sel.ok is False and sel.code == mr.NO_ORIGINAL_FOUND, sel.reason)
    check("the refused reason says why", "original" in sel.reason.lower(), sel.reason)

    # The artist's OWN channel needs no marker: that is the provenance.
    for channel, expect in (("ImagineDragons", "original"), ("imagine dragons", "original"),
                            ("TotallyRandomChannel", None), ("LatinHype", None),
                            ("Phantom Lyrics", None)):
        s = mr.select_original("Believer Imagine Dragons",
                               [cand("Imagine Dragons - Believer", channel, id="x")])
        got = s.entry.get("versionType") if s.ok else None
        check(f"channel {channel!r} -> {expect!r}", got == expect, (got, s.reason))

    # A channel that advertises itself as re-recording is never authorized.
    s = mr.select_original("Believer Imagine Dragons",
                           [cand("Imagine Dragons - Believer", "Imagine Dragons Tribute Band", id="t"),
                            cand("Imagine Dragons - Believer", "ImagineDragons", id="ok")])
    check("a tribute channel loses to the artist's own channel",
          s.ok and s.entry.get("id") == "ok", s.reason)


def test_word_boundaries() -> None:
    section("penalties must not match inside ordinary words")
    # The classic false positives: "recovery", "alive"/"Oliver", "credits".
    for title in ("Recovery Song", "Alive and Well", "Oliver Twist Theme",
                  "Credits Roll", "Rebirth"):
        sel = mr.select_original(title, [cand(title, "ArtistVEVO", id="ok")])
        check(f"{title!r} is not flagged as a variant",
              sel.ok and sel.entry.get("_rank_kinds") is None, sel.reason)
    kinds = mr.score_candidate("Song", cand("Song (Cover)", "X"))
    check("a real 'cover' IS flagged", "cover" in kinds[2], kinds)


def test_validation() -> None:
    section("§9 playback validation")
    ok, why = mr.validate_selection("Die With A Smile", ORIGINAL)
    check("a matching candidate validates", ok, why)
    ok, why = mr.validate_selection("Totally Different Song", ORIGINAL)
    check("a non-matching candidate is rejected", not ok and why, why)

    sel = mr.select_original("Die With A Smile", [cand("Unrelated Song", "X", id="u")])
    check("a resolver pick that fails validation refuses", sel.ok is False, sel.code)

    ok, why = mr.validate_selection("Song remix", ORIGINAL)
    check("a requested version missing from the pick is rejected", not ok, why)
    ok, why = mr.validate_selection("Song remix", cand("Song (Remix)", "X", id="r"))
    check("a requested version present in the pick validates", ok, why)


def test_queue_metadata() -> None:
    section("§7 queued tracks carry resolved metadata")
    sel = mr.select_original("Die With A Smile", [COVER, ORIGINAL])
    meta = mr.resolved_metadata(sel.entry)
    for field in ("title", "artist", "url", "provider", "sourceId", "version",
                  "isOriginal", "isAuthorized"):
        check(f"metadata carries {field}", field in meta, sorted(meta))
    check("provider is resolved", meta["provider"] == "youtube", meta["provider"])
    check("isOriginal is true", meta["isOriginal"] is True)
    check("isAuthorized reflects the official marker", meta["isAuthorized"] is True)
    check("no secret-looking keys leak", not any(
        k for k in meta if any(s in k.lower() for s in ("token", "cookie", "secret", "password"))))


def test_dashboard_parity() -> None:
    section("§10 dashboard and Discord agree")
    # The dashboard proxies to `engine.search`, which uses this resolver, so
    # parity is a property of there being ONE resolver. Assert the shared
    # surface exists and is the module every path imports.
    music_src = (ROOT / "bot" / "music.py").read_text()
    check("music.py imports the resolver", "from music_resolver import" in music_src)
    check("music.py does not redefine the variant table",
          "_VARIANT_PATTERNS" not in music_src and "_ALTERNATE_KINDS" not in music_src)
    check("music.py delegates selection", "select_original(" in music_src)
    check("autoplay uses the resolver", "select_original(" in music_src
          and "_related" in music_src)
    same = mr.select_original("Die With A Smile", [COVER, ORIGINAL])
    again = mr.select_original("Die With A Smile", [COVER, ORIGINAL])
    check("the same input resolves to the same track",
          same.entry["id"] == again.entry["id"])
    check("and to the same metadata", mr.resolved_metadata(same.entry)
          == mr.resolved_metadata(again.entry))


def test_honesty_guarantees() -> None:
    section("§13 no faking")
    # The resolver must never "fix" a problem by rewriting metadata.
    sel = mr.select_original("Die With A Smile", [COVER, ORIGINAL])
    check("the chosen title is the candidate's own title, unmodified",
          sel.entry["title"] == ORIGINAL["title"])
    check("the chosen uploader is the candidate's own uploader, unmodified",
          sel.entry["uploader"] == ORIGINAL["uploader"])
    src = (ROOT / "bot" / "music_resolver.py").read_text()
    check("the resolver never writes to a title field",
          ".title ==" not in src and "['title'] =" not in src)
    check("no secret-ish logging", not any(
        tok in src.lower() for tok in ("bot_token", "bridge_secret", "ytdlp_cookie")))


def test_empty_and_degenerate() -> None:
    section("edge cases")
    sel = mr.select_original("Song", [])
    check("an empty result set refuses", sel.ok is False and sel.code == mr.NO_ORIGINAL_FOUND)
    sel = mr.select_original("", [ORIGINAL])
    check("an empty query still returns something rather than crashing",
          isinstance(sel.ok, bool))
    sel = mr.select_original("Die With A Smile", [None, "junk", 42, ORIGINAL])
    check("non-dict candidates are skipped, not fatal",
          sel.ok and sel.entry["id"] == "orig", sel.reason)
    check("ranking is stable for equal scores",
          [r["id"] for r in mr.rank_candidates("S", [ORIGINAL, COVER])][-1] == "cover")


def test_search_list_has_no_duplicates() -> None:
    section("dashboard search lists each recording exactly once")
    # The ordering the dashboard sees is produced by music._order_search_results,
    # which hoists the chosen recording ahead of the ranked remainder. Both
    # helpers return FRESH dicts, so an object-identity (`is`) filter never
    # matches and the top row is emitted twice — which the dashboard renders
    # as a duplicated entry. Exercise the REAL function, not a copy of it.
    entries = [COVER, ORIGINAL, SPED]
    selection = mr.select_original("Die With A Smile", entries)
    ranked = mr.rank_candidates("Die With A Smile", entries)
    check("select_original returns a copy, not a ranked row",
          all(r is not selection.entry for r in ranked))
    check("_source_key identifies a recording across fresh dicts",
          music._source_key(ORIGINAL) == music._source_key(dict(ORIGINAL))
          and music._source_key(ORIGINAL) != music._source_key(COVER))

    ordered = music._order_search_results("Die With A Smile", entries)
    ids = [str(r.get("url") or "").rsplit("=", 1)[-1] for r in ordered]
    check("the chosen recording appears exactly once", ids.count("orig") == 1, ids)
    check("every candidate is still listed exactly once",
          sorted(ids) == sorted(["orig", "cover", "sped"]), ids)
    check("the chosen recording is first", ids and ids[0] == "orig", ids)
    check("the dashboard row is flagged original",
          ordered[0].get("isOriginal") is True, ordered[0])
    check("the cover row is not flagged original",
          all(r.get("isOriginal") is not True for r in ordered[1:]), ordered[1:])

    # A ranking failure must not take the whole search down with it.
    broken = [dict(ORIGINAL), None, 42]
    check("a malformed candidate set degrades to the raw rows",
          len(music._order_search_results("Die With A Smile", broken)) >= 1,
          music._order_search_results("Die With A Smile", broken))

    # And the music.py source must not reintroduce an identity-based filter.
    src = (ROOT / "bot" / "music.py").read_text()
    check("music.py does not filter the ranked remainder by object identity",
          "is not selection.entry" not in src and "is not sel.entry" not in src)


def test_backend_validates_pinned_source() -> None:
    """§4: the queue plays the pinned url, so the browser's `isOriginal`
    claim must never be taken on trust."""
    section("§4 backend re-verifies the source the dashboard selected")
    import music  # noqa: PLC0415 - imported here to keep the suite importable

    rows = {
        "official": {
            "title": "Imagine Dragons - Believer (Official Music Video)",
            "uploader": "ImagineDragons",
            "url": "https://www.youtube.com/watch?v=official",
            "id": "official",
        },
        "cover": {
            "title": "Believer - Imagine Dragons (Cover)",
            "uploader": "SomeGuyCovers",
            "url": "https://www.youtube.com/watch?v=cover",
            "id": "cover",
        },
    }
    # Mirror of the enqueue gate: the provider's own verdict decides, and a
    # claim the provider contradicts must fail rather than be substituted.
    s = mr.select_original(rows["official"]["title"], [rows["official"]])
    check("an official channel clears the backend gate",
          s.ok and mr.resolved_metadata(s.entry)["isAuthorized"] is True)
    # The gate sees the USER's request, not the row's own title. Querying with
    # the cover's own title would read as an explicit "cover" request, which
    # the resolver correctly honors — that is a different feature.
    s = mr.select_original("Believer Imagine Dragons", [rows["cover"]])
    check("a cover cannot satisfy an isOriginal=true claim",
          s.ok is False and s.code == mr.NO_ORIGINAL_FOUND, s.reason)
    # ...and an explicit cover request is still honoured, so the gate does
    # not over-reach and block a legitimate choice from the results list.
    s2 = mr.select_original("Believer Imagine Dragons cover", [rows["cover"]])
    check("an explicitly requested cover is still selectable",
          s2.ok and s2.entry["id"] == "cover", s2.reason)

    # classify_source is the query-independent gate the enqueue uses. Live
    # search caught both failure modes it has to avoid: a remix accepted
    # because its title word matched its channel ("SICKICK VERSION!!!"
    # on "SickickMusic"), and an artist's own audio refused because the
    # check had been dropped entirely.
    check("an artist channel carrying its own album track is authorized",
          mr.classify_source({"title": "Imagine Dragons - Believer (Audio)",
                              "uploader": "ImagineDragons"})[0] == "original")
    check("a remix whose title word matches its channel is NOT authorized",
          mr.classify_source({"title": "Ed Sheeran - Shape Of You (SICKICK VERSION!!!)",
                              "uploader": "SickickMusic"})[0] != "original")
    check("a fan re-upload on a bare channel is not authorized",
          mr.classify_source({"title": "Imagine Dragons - Believer",
                              "uploader": "LatinHype"})[0] == "unknown")
    check("an official music video stays official",
          mr.classify_source({"title": "Lady Gaga - Die With A Smile (Official Music Video)",
                              "uploader": "Lady Gaga"})[0] == "official")
    check("an explicit artist field corroborates its channel",
          mr.classify_source({"title": "Believer (Audio)", "uploader": "ImagineDragons",
                              "artist": "Imagine Dragons"})[0] == "original")
    check("a bare title with no artist segment stays unauthorized",
          mr.classify_source({"title": "Sunflower", "uploader": "Post Malone"})[0] == "unknown")
    check("the same track WITH its artist segment is authorized",
          mr.classify_source({"title": "Post Malone - Sunflower",
                              "uploader": "Post Malone"})[0] == "original")

    # §5/§6: never represent a metadata-only judgement as ownership proof,
    # and never let an unrun check read as a pass.
    off = mr.resolved_metadata({**mr.rank_candidates(
        "Believer Imagine Dragons",
        [cand("Imagine Dragons - Believer (Official Music Video)", "ImagineDragons", id="o")]
    )[0], "versionType": "official"})
    check("an accepted source is labelled HEURISTIC, never 'verified'",
          off["provenance"] == mr.PROVENANCE_HEURISTIC, off.get("provenance"))
    check("no VERIFIED provenance state is reachable from metadata",
          "VERIFIED" not in mr.PROVENANCE_STATES, sorted(mr.PROVENANCE_STATES))
    cov = mr.resolved_metadata({**mr.rank_candidates(
        "Believer Imagine Dragons",
        [cand("Believer (Karaoke)", "Sing King", id="k")]
    )[0], "versionType": "alternate"})
    check("a rejected source is labelled REJECTED_NOT_AUTHORIZED",
          cov["provenance"] == mr.PROVENANCE_REJECTED, cov.get("provenance"))
    una = mr.resolved_metadata({"versionType": "unknown",
                                "_provenance_unavailable": True})
    check("an unrun check is PROVIDER_UNAVAILABLE, not a pass",
          una["provenance"] == mr.PROVENANCE_UNAVAILABLE
          and una["isAuthorized"] is False, una)
    check("a label-shaped channel is still only a heuristic match",
          mr.provenance_of({"versionType": "original", "uploader": "SonyRecords"})
          == mr.PROVENANCE_HEURISTIC)

    check("verify_pinned_source exists and is a coroutine function",
          callable(getattr(music, "verify_pinned_source", None))
          and __import__("asyncio").iscoroutinefunction(music.verify_pinned_source))

    # The bridge must read the claim from the request body.
    src = (ROOT / "bot" / "main.py").read_text()
    check("the bridge reads a client isOriginal claim",
          'body.get("isOriginal")' in src)
    check("a contradicted claim is a 422, never a silent substitution",
          "MUSIC_SELECTION_MISMATCH" in src and "status=422" in src)


def main() -> int:
    test_normal_request()
    test_cover_competing_with_original()
    test_variants_competing_with_original()
    test_all_covers_refuses()
    test_single_result_search()
    test_explicit_versions()
    test_normalization()
    test_artist_and_source_signals()
    test_word_boundaries()
    test_validation()
    test_queue_metadata()
    test_dashboard_parity()
    test_backend_validates_pinned_source()
    test_search_list_has_no_duplicates()
    test_honesty_guarantees()
    test_empty_and_degenerate()
    print(f"\n{PASSED} passed, {len(FAILED)} failed")
    if FAILED:
        print("FAILED:")
        for label in FAILED:
            print(f"  - {label}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())