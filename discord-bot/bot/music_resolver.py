"""One resolver for "which recording should we actually play".

Why this module exists
----------------------
yt-dlp returns results in provider order, which optimizes for engagement, not
authenticity. The first hit for a popular song is routinely a sped-up, slowed +
reverb, karaoke or AI cover reupload with a higher view count than the artist's
own channel. Anything that does `entries[0]` plays that.

Ranking alone was not enough, and this module exists because of three specific
ways the previous attempt still failed:

  1. **A one-result search cannot be ranked.** `ytsearch1` returns exactly one
     entry, so `rank_candidates` over it returns that entry whatever it is. If
     the 20-result search failed and the 1-result search succeeded, a cover was
     played with a rank score that looked fine. A resolver that can only choose
     between what it is given must be able to REFUSE, which is what
     `select_original` does.
  2. **Ranking a bad set still picks a bad track.** If every candidate is a
     cover, the highest-scoring cover was played and reported as success. The
     brief is explicit: no original available means an honest error, never a
     silent substitution.
  3. **Autoplay bypassed ranking entirely.** YouTube's `RD` radio playlist is
     the single densest source of slowed/nightcore/cover uploads, and it is
     fetched as a URL — and URL resolution skips ranking by design, because a
     URL must resolve to itself. The autoplay path therefore played covers
     systematically while `/play` did not.

The rules, in the order they are applied
----------------------------------------
  * `normalize_query` pulls a request toward the canonical song WITHOUT
    appending anything. It never adds "cover"/"remix"/"official"; a bare
    "About You" must stay "About You" or the original can drop out of results
    entirely, which is a worse failure than a wrong pick.
  * `requested_kinds` records variants the USER asked for. Those are not
    penalized — "Song remix" must be able to return a remix.
  * When NO variant was requested, structurally-undesirable candidates are
    REMOVED before ranking, not merely scored lower. Scoring lower still
    allows them to win when the good candidates are weak; removal cannot.
  * When no variant was requested and nothing survives, `select_original`
    returns a refusal with a real code. It never returns "the best cover".

Nothing here rewrites a title, an artist name or a channel name. `version_type`
is only ever `official` when a verifiable marker is present (VEVO / "official"
channel, "- Topic" channel, "official video"/"official audio" in the title), so
the classification cannot be faked by renaming anything.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Iterable

log = logging.getLogger("murabot.music.resolver")

# ── Refusal codes ───────────────────────────────────────────────────────
#: Every candidate was a cover/karaoke/slowed/etc. and the user asked for the
#: standard recording. Reported instead of playing the least-bad cover.
NO_ORIGINAL_FOUND = "SEARCH_ALTERNATIVE_SOURCE"
#: A candidate was chosen but does not match what was asked for.
VALIDATION_FAILED = "MUSIC_SELECTION_MISMATCH"

#: Which version types count as "the real recording" for a plain request.
ACCEPTABLE_TYPES = frozenset({"official", "original"})

#: Variant markers, strongest signal first. Weights are the penalty applied
#: when the user did NOT ask for that variant.
#:
#: Every pattern uses word boundaries on purpose: "cover" must not match
#: "recovery", "live" must not match "alive"/"Oliver", "edit" must not match
#: "credits". A missing boundary is how a ranking function starts rejecting
#: the artist's own uploads.
#:
#: Ambiguous words (live, acoustic, version, remaster) carry small weights so a
#: strong official signal still outranks them — "Live at Wembley" on the
#: artist's VEVO is usually still the thing someone typing "Artist - Song"
#: wants when it is the only thing that exists.
_VARIANT_PATTERNS: tuple[tuple[str, str, int], ...] = (
    # Unambiguously NOT the original recording. Heavy penalties.
    ("ai", r"\bai[\s\-]?(?:cover|version|generated|song|artist)\b", 90),
    ("karaoke", r"\bkaraoke\b|\bin[\s\-]?stereo\b|\bsing[\s\-]?along\b", 80),
    ("instrumental", r"\binstrumentals?\b|\bbacking[\s\-]track\b", 80),
    ("cover", r"\bcovers?\b|\bcovered\s+by\b|\bfan\s*made\b|\bfanmade\b|\bfan\s*version\b"
             r"|\bfan\s*upload\b|\btribute\b|\bparody\b|\bbootleg\b", 80),
    ("vocals-only", r"\bvocal\s*only\b|\binstrumental\s*version\s*with\s*vocal", 60),
    # Mangled reuploads. Heavy.
    ("sped-up", r"\bsped\s*-?\s*up\b|\bspeed\s*-?\s*up\b|\bsped\s*up\b|\b\d+(?:\.\d+)?x\b", 80),
    ("slowed", r"\bslowed\b|\bslow\s+(?:version|edit|songs?)\b|\bslowed\s*\+\s*reverb\b", 80),
    ("reverb", r"\breverb\b", 70),
    ("nightcore", r"\bnightcore\b", 70),
    ("8d", r"\b8\s*d\b|\b8d\s*audio\b", 60),
    ("bass-boosted", r"\bbass\s*-?\s*boost(?:ed)?\b", 60),
    ("remix", r"\bremix(?:es|ed)?\b", 70),
    ("mashup", r"\bmash\s*-?\s*ups?\b|\bmashups?\b|\bmedley\b", 60),
    ("edit", r"\bedits?\b|\bfan\s*edit\b|\bextended\b", 50),
    # Ambiguous: legitimate official releases carry these too.
    ("acoustic", r"\bacoustic\b|\bunofficial\b", 15),
    ("live", r"\blive\b|\blive\s*session\b", 15),
    ("version-alt", r"\bother\s+version\b|\balt(?:ernate)?\s+version\b|\bversion\s*\d+\b", 10),
    ("remaster", r"\bremaster(?:ed)?\b", 5),
    ("lyrics-video", r"\blyric(?:s)?\s*(?:video|only)\b|\bvisuali[sz]er\b|\bl(?:yrics?|yric)\b", 8),
    ("loop-upload", r"\b\d+\s*hours?\b|\bloop\b|\brepeat\b|\bnon[\s\-]?stop\b", 20),
)
_COMPILED_VARIANTS: tuple[tuple[str, re.Pattern[str], int], ...] = tuple(
    (kind, re.compile(pattern, re.IGNORECASE), weight)
    for kind, pattern, weight in _VARIANT_PATTERNS
)

#: Never penalized, at any weight, because they are not variant markers —
#: they are noise around the real title and appear on official uploads too.
_TITLE_NOISE = (
    "official music video", "official video", "official audio", "official lyric video",
    "official visualizer", "official hd", "official", "music video", "lyric video",
    "lyrics", "lyric", "audio", "video", "hd", "hq", "4k", "mv", "m/v", "visualizer",
    "full song", "full album", "explicit", "clean", "remastered", "remaster",
    "high quality", "wav", "flac", "with lyrics",
)
_NOISE_RE = re.compile(
    r"[\(\[\{]\s*(?:" + "|".join(re.escape(n) for n in _TITLE_NOISE) + r")[^)\]\}]*[\)\]\}]"
    # Separated trailing noise: "Song - Official Video".
    r"|(?:\s*[-–—|]\s*)(?:" + "|".join(re.escape(n) for n in _TITLE_NOISE) + r")\s*$"
    # Unseparated trailing noise: "Song Official Video". YouTube titles are
    # overwhelmingly written without a separator, so requiring one left the
    # single most common case unhandled.
    r"|\s+(?:" + "|".join(re.escape(n) for n in _TITLE_NOISE) + r")\s*$",
    re.IGNORECASE,
)
_BRACKET_NOISE_RE = re.compile(r"^[\s\-–—:]*[\(\[\{]([^\)\]\}]{1,40})[\)\]\}][\s\-–—:|]*")
_LEADING_VERB_RE = re.compile(
    r"^(?:please\s+)?(?:play|put\s+on|listen\s+to|jam\s+to|hear)\s+", re.IGNORECASE)

# ── Official / authorized markers ───────────────────────────────────────
_OFFICIAL_CHANNEL_RES = (
    # VEVO channels concatenate the artist name (TaylorSwiftVEVO), so there is
    # no word boundary before "VEVO" — anchor at the end as well.
    re.compile(r"(?:\bvevo\b|vevo$)", re.IGNORECASE),
    re.compile(r"\bofficial\b", re.IGNORECASE),
    re.compile(r"-\s*topic$", re.IGNORECASE),
)
_LABEL_CHANNEL_RES = (
    re.compile(r"\brecords\b", re.IGNORECASE),
    re.compile(r"\bmusic\b", re.IGNORECASE),
)
_OFFICIAL_TITLE_RES = (
    re.compile(r"\bofficial\s+(?:music\s+)?video\b", re.IGNORECASE),
    re.compile(r"\bofficial\s+audio\b", re.IGNORECASE),
)
_AUDIO_TITLE_RES = (re.compile(r"\baudio\b", re.IGNORECASE),)


def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) >= 3]


#: Historical name, kept because `music.py` re-exports it and older call sites
#: (and the pre-existing test suite) refer to it.
_search_tokens = _tokens


def looks_relevant(query: str, title: str) -> bool:
    """Whether a fallback provider's result plausibly answers the query.

    Used for the non-YouTube fallbacks, which previously played a result that
    did not match at all.
    """
    tokens = _tokens(query)
    if not tokens:
        return True
    in_title = set(re.findall(r"[a-z0-9]+", (title or "").lower()))
    return any(tok in in_title for tok in tokens)


def normalize_query(query: str) -> str:
    """Pull a request toward the canonical song, without inventing intent.

    Deliberately one-directional. It REMOVES noise ("play about you official
    video", "About You [HD]") and never APPENDS a qualifier, because appending
    "official" or narrowing the title can push the genuine recording out of
    the result set — and a missing original is a worse outcome than a
    mediocre pick, because at least a mediocre pick is inspectable.

    An explicit version request ("song remix", "song live") is left completely
    untouched; `requested_kinds` reads it from the ORIGINAL query, so nothing
    here can accidentally erase what the user asked for.
    """
    text = (query or "").strip()
    if not text:
        return ""
    if re.match(r"^https?://", text, re.IGNORECASE):
        return text  # a URL must resolve to itself
    text = _LEADING_VERB_RE.sub("", text).strip()
    previous = None
    while previous != text:
        previous = text
        text = _BRACKET_NOISE_RE.sub("", text).strip()
        text = _NOISE_RE.sub("", text).strip(" -–—|:")
    return text or (query or "").strip()


def requested_kinds(query: str) -> set[str]:
    """Variant kinds the user EXPLICITLY asked for — never penalized.

    Read from the RAW query, never from `normalize_query`: "song remix" must
    still be seen as a remix request after cleanup, and the cleanup exists to
    make a PLAIN request canonical, not to erase intent.
    """
    text = f" {(query or '').lower()} "
    return {kind for kind, rx, _ in _COMPILED_VARIANTS if rx.search(text)}


def score_candidate(query: str, entry: dict) -> tuple[float, str, list[str]]:
    """Score one candidate. Returns `(score, version_type, kinds)`.

    `version_type` is `official | original | alternate | unknown`. "official"
    requires a verifiable marker — it is never inferred from vibes, because an
    unverified "official" is exactly the fake-success this whole module exists
    to prevent.
    """
    title = str(entry.get("title") or "")
    uploader = str(entry.get("uploader") or entry.get("channel") or "")
    requested = requested_kinds(query)
    kinds: list[str] = []
    score = 0.0

    q_tokens = set(_tokens(query))
    t_tokens = set(re.findall(r"[a-z0-9]+", title.lower()))
    overlap = 0.0
    if q_tokens:
        overlap = len(q_tokens & t_tokens) / len(q_tokens)
        score += overlap * 30.0
        if overlap >= 0.6:
            score += 5.0
    u_tokens = set(re.findall(r"[a-z0-9]+", uploader.lower()))
    if q_tokens and u_tokens:
        score += min(len(q_tokens & u_tokens) * 5.0, 15.0)

    official = False
    for rx in _OFFICIAL_CHANNEL_RES:
        if rx.search(uploader):
            score += 25.0
            official = True
            break
    if not official:
        for rx in _LABEL_CHANNEL_RES:
            if rx.search(uploader):
                score += 10.0
                break
    for rx in _OFFICIAL_TITLE_RES:
        if rx.search(title):
            score += 15.0
            official = True
            break
    else:
        for rx in _AUDIO_TITLE_RES:
            if rx.search(title):
                score += 5.0
                break

    for kind, rx, weight in _COMPILED_VARIANTS:
        if kind in requested:
            # An explicit request ("remix", "live", …) is the strongest intent
            # signal there is: matching entries earn a BONUS instead of a
            # penalty, so the requested version beats the original.
            if rx.search(title):
                kinds.append(f"requested:{kind}")
                score += 40.0
            continue
        if rx.search(title):
            kinds.append(kind)
            score -= float(weight)

    if kinds:
        version_type = "alternate"
    elif official:
        version_type = "official"
    elif q_tokens and overlap >= 0.6:
        version_type = "original"
    else:
        version_type = "unknown"
    return score, version_type, kinds


def rank_candidates(query: str, entries: Iterable[dict]) -> list[dict]:
    """Order candidates best-first, tagging each with `versionType`.

    Stable: ties keep provider order. Never mutates the input dicts.
    """
    scored: list[tuple[float, int, dict]] = []
    for idx, entry in enumerate(entries or []):
        if not isinstance(entry, dict):
            continue
        score, version_type, kinds = score_candidate(query, entry)
        row = dict(entry)
        row["versionType"] = version_type
        row["_rank_kinds"] = kinds
        row["_rank_score"] = round(score, 1)
        scored.append((score, idx, row))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [row for _s, _i, row in scored]


class Selection:
    """The outcome of resolving one request. Never ambiguous about success."""

    __slots__ = ("ok", "entry", "code", "reason", "rejected", "considered")

    def __init__(self, ok: bool, entry: dict | None = None, *, code: str = "OK",
                 reason: str = "", rejected: list[dict] | None = None,
                 considered: int = 0) -> None:
        self.ok = ok
        self.entry = entry
        self.code = code
        self.reason = reason
        self.rejected = rejected or []
        self.considered = considered

    def __bool__(self) -> bool:
        return self.ok


def select_original(query: str, entries: Iterable[dict],
                    *, require_original: bool = True) -> Selection:
    """THE decision. Every caller that turns a request into a track uses this.

    Order of operations, and why:

      1. Rank everything (so the reason logged is about the real scores).
      2. If the user asked for a variant, keep everything — a remix request may
         legitimately have no official/original candidate at all.
      3. Otherwise STRUCTURALLY remove anything classified `alternate`. This is
         the part scoring cannot do: a weak official upload must still beat a
         good cover, and a score gap is not a guarantee.
      4. If nothing survives, refuse. Playing the best cover here is the exact
         failure this function was written to prevent.
      5. Validate the winner before handing it back.
    """
    all_entries = [e for e in (entries or []) if isinstance(e, dict)]
    considered = len(all_entries)
    if not all_entries:
        return Selection(False, code=NO_ORIGINAL_FOUND,
                         reason="the search returned no results", considered=0)

    ranked = rank_candidates(query, all_entries)
    requested = requested_kinds(query)

    if requested:
        # The user named a version. Alternates of that kind are the POINT.
        pool = list(ranked)
        reason = f"explicit version request: {', '.join(sorted(requested))}"
    else:
        # Structural removal, not a score penalty: a score gap is not a
        # guarantee, and a weak official upload must still beat a good cover.
        keep_ids = {id(r) for r in ranked if r.get("versionType") in ACCEPTABLE_TYPES}
        pool = [r for r in ranked if id(r) in keep_ids]
        dropped = [r for r in ranked if id(r) not in keep_ids]
        if not pool:
            best = ranked[0]
            why = ", ".join(best.get("_rank_kinds") or []) or "no official marker"
            log.info(
                "MUSIC_CANDIDATE_REJECTED request=%r selected=none reason=%s "
                "candidates=%d",
                (query or "")[:60], why, considered)
            return Selection(
                False, code=NO_ORIGINAL_FOUND,
                reason=("every result was a re-recorded variant (%s) and no "
                        "original/official recording was offered" % why),
                rejected=[{"title": r.get("title"), "reason": ",".join(r.get("_rank_kinds") or [])}
                          for r in ranked[:5]],
                considered=considered)
        reason = "original/official candidate present"
        for row in dropped:
            log.info("MUSIC_CANDIDATE_REJECTED request=%r title=%r reason=%s",
                     (query or "")[:60], str(row.get("title"))[:60],
                     ",".join(row.get("_rank_kinds") or []) or "alternate")

    best = pool[0]
    log.info(
        "MUSIC_CANDIDATE_SELECTED request=%r selectedTitle=%r selectedArtist=%r "
        "selectedVersion=%s provider=%s sourceId=%s isOriginal=%s selectionReason=%s",
        (query or "")[:60], str(best.get("title") or "")[:80],
        str(best.get("uploader") or "")[:60], best.get("versionType"),
        _provider_of(best), str(best.get("id") or best.get("url") or "")[:40],
        best.get("versionType") in ACCEPTABLE_TYPES, reason)

    ok, why = validate_selection(query, best)
    if not ok:
        log.info("MUSIC_CANDIDATE_REJECTED request=%r selectedTitle=%r rejectedReason=%s",
                 (query or "")[:60], str(best.get("title"))[:60], why)
        if require_original and not requested:
            return Selection(False, code=VALIDATION_FAILED, reason=why,
                             considered=considered)
        # An explicitly requested variant gets one retry without validation:
        # the user named the version, so a loose title match is expected.
        log.info("MUSIC_CANDIDATE_SELECTED (explicit variant, validation relaxed) "
                 "request=%r selectedTitle=%r", (query or "")[:60],
                 str(best.get("title"))[:60])

    out = dict(best)
    out.pop("_rank_kinds", None)
    out["selectionReason"] = reason
    out["isOriginal"] = out.get("versionType") in ACCEPTABLE_TYPES
    out["provider"] = _provider_of(out)
    out["sourceId"] = str(out.get("id") or out.get("url") or "")
    return Selection(True, out, reason=reason, considered=considered)


def validate_selection(query: str, entry: dict) -> tuple[bool, str]:
    """Does this candidate actually answer this request? (§9)

    Deliberately conservative: it refuses rather than guesses. An empty or
    metadata-free candidate is allowed through (the search already ranked it),
    but a candidate that confidently names a DIFFERENT artist is not — playing
    that while showing the requested title is the "fake success" failure.
    """
    title = str(entry.get("title") or "")
    if not title:
        return True, ""
    if not looks_relevant(query, title):
        return False, "selected title does not match the request"

    requested = requested_kinds(query)
    # A requested variant that is absent from the chosen title is a mismatch;
    # the user asked for that specific version.
    if requested:
        chosen = {kind for kind, rx, _ in _COMPILED_VARIANTS if rx.search(title)}
        if not (chosen & requested):
            return False, (f"requested version ({', '.join(sorted(requested))}) "
                           "is not present in the selected title")

    if entry.get("versionType") == "alternate" and not requested:
        return False, "selected candidate is a re-recorded variant"
    return True, ""


def _provider_of(entry: dict) -> str:
    url = str(entry.get("webpage_url") or entry.get("url") or "")
    host = url.split("/")[2] if url.count("/") > 2 else ""
    if "youtube" in host or str(entry.get("extractor") or "").startswith("youtube"):
        return "youtube"
    if "soundcloud" in host:
        return "soundcloud"
    if "bandcamp" in host:
        return "bandcamp"
    return host or "unknown"


def resolved_metadata(entry: dict) -> dict:
    """The row a queued track must carry, so it never has to search again.

    §7 of the brief: once a track is chosen, the queue plays THIS source. If
    it re-searched later it could land on a different recording, which is how a
    correct `/play` turns into a cover three tracks later.
    """
    return {
        "title": str(entry.get("title") or ""),
        "artist": str(entry.get("uploader") or entry.get("channel") or ""),
        "album": str(entry.get("album") or ""),
        "url": str(entry.get("webpage_url") or entry.get("url") or ""),
        "provider": _provider_of(entry),
        "sourceId": str(entry.get("id") or entry.get("url") or ""),
        "duration": int(entry.get("duration") or 0),
        "version": str(entry.get("versionType") or "unknown"),
        "isOriginal": bool(entry.get("isOriginal", entry.get("versionType") in ACCEPTABLE_TYPES)),
        "isAuthorized": entry.get("versionType") == "official",
        "selectionReason": str(entry.get("selectionReason") or ""),
    }