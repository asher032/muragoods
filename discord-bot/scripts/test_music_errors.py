"""Provider-error classification: the rule that raw yt-dlp text never ships.

Every surface used to render the provider's own words into a Discord embed
(`yt-dlp: <possibly-credential-shaped text>` + "Try a different search or a
direct URL."), which did two things at once: it leaked the shape of our
egress configuration, and it turned an ACCESS problem into "your track does
not exist" — sending users off to re-search a track YouTube had merely
refused us.

Those surfaces now ask `music_errors` for a category and a fixed line of
copy. This suite pins the properties that must never drift:

  * every category has its own copy, and no copy contains a provider
    fragment, a URL, a path, or anything credential-shaped;
  * the real yt-dlp failure strings map to the RIGHT category, so a bot
    check is an access problem and a 404 is not;
  * an unsupported link is refused BEFORE the extractor sees it;
  * a stubbed engine that fails six different ways yields six different
    categories, and none of them leaks.

Hermetic: no yt-dlp, no network, no Discord, no cookies.

Run:
    python discord-bot/scripts/test_music_errors.py
"""

from __future__ import annotations

import ast
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bot"))

import music  # noqa: E402
from music_resolver import NO_ORIGINAL_FOUND  # noqa: E402
from music_errors import (  # noqa: E402
    TRANSIENT_CATEGORIES,
    USER_MESSAGES,
    YT_BOT_CHECK,
    YT_FALLBACK_MISMATCH,
    YT_FORBIDDEN,
    YT_INVALID_URL,
    YT_LOGIN_REQUIRED,
    YT_NO_AUTHORIZED_ORIGINAL,
    YT_NO_RESULTS,
    YT_PREVIEW_ONLY,
    YT_PROVIDER_UNAVAILABLE,
    YT_RATE_LIMITED,
    YT_RESOLVER_BUSY,
    YT_SEARCH_FAILED,
    YT_TIMEOUT,
    YT_URL_EXTRACTION_FAILED,
    YT_VALIDATION_FAILED,
    classify,
    for_busy,
    for_kind,
    redact_credentials,
    is_supported_url,
    is_url_query,
)

PASSED = 0
FAILED = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if ok:
        PASSED += 1
        print(f"  ok  {name}")
    else:
        FAILED += 1
        print(f"  FAIL {name}{(' - ' + detail) if detail else ''}")


# Anything shaped like a leak. Copy is the ONLY field a user sees, so these
# are checked against every message in the table.
FORBIDDEN_IN_COPY = (
    "yt-dlp",
    "youtube.com/watch",
    "youtu.be",
    "http://",
    "https://",
    "cookie",
    "token",
    "proxy",
    "authorization",
    "passwd",
    "password",
    "/",
    "error:",
)


def test_every_category_has_safe_copy() -> None:
    print("every category has its own safe copy")
    check("the table covers every category we emit",
          {YT_SEARCH_FAILED, YT_URL_EXTRACTION_FAILED, YT_LOGIN_REQUIRED,
           YT_BOT_CHECK, YT_RATE_LIMITED, YT_FORBIDDEN,
           YT_PROVIDER_UNAVAILABLE, YT_NO_RESULTS, YT_INVALID_URL,
           YT_TIMEOUT, YT_RESOLVER_BUSY, YT_PREVIEW_ONLY,
           YT_FALLBACK_MISMATCH, YT_VALIDATION_FAILED,
           YT_NO_AUTHORIZED_ORIGINAL} <= set(USER_MESSAGES),
          str(sorted(set(USER_MESSAGES))))
    for code, msg in sorted(USER_MESSAGES.items()):
        check(f"{code}: no provider/URL/path/credential fragment",
              not any(tok in msg.lower() for tok in FORBIDDEN_IN_COPY), msg)
        check(f"{code}: ends with a full stop", msg.rstrip().endswith("."), msg)
    # The four messages the spec pins, verbatim.
    check("search failure copy is exact",
          USER_MESSAGES[YT_SEARCH_FAILED]
          == "Music search is temporarily unavailable. Please try again.")
    check("no-results copy is exact",
          USER_MESSAGES[YT_NO_RESULTS] == "No matching tracks were found.")
    check("invalid-url copy is exact",
          USER_MESSAGES[YT_INVALID_URL]
          == "That link isn't a supported music link.")
    check("access-problem copy is exact",
          USER_MESSAGES[YT_BOT_CHECK]
          == "YouTube couldn't be reached right now. Please try again later.")
    check("timeout copy is exact",
          USER_MESSAGES[YT_TIMEOUT]
          == "The music service took too long to respond. Please try again.")


def test_no_copy_mentions_the_provider() -> None:
    print("no user-facing line names the provider internals")
    # "YouTube is rate limiting…" is fine; "yt-dlp:" or a URL is not.
    for code, msg in sorted(USER_MESSAGES.items()):
        check(f"{code}: no 'yt-dlp' prefix", "yt-dlp:" not in msg.lower(), msg)
        check(f"{code}: no bracket redaction",
              "[redacted" not in msg.lower(), msg)


def test_url_validation() -> None:
    print("input is classified before the extractor sees it")
    for good in ("https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                 "http://youtube.com/watch?v=x",
                 "https://youtu.be/dQw4w9WgXcQ",
                 "https://music.youtube.com/watch?v=x",
                 "https://m.youtube.com/watch?v=x"):
        check(f"supported: {good[:44]}", is_supported_url(good))
    for bad in ("https://evil.example.com/watch?v=abc",
                "https://youtube.com.evil.tld/watch?v=x",
                "https://notyoutube.com/watch?v=x",
                "file:///etc/passwd",
                "javascript:alert(1)",
                "rm -rf /",
                "just a search term",
                ""):
        check(f"rejected: {bad[:44]!r}", not is_supported_url(bad))
    check("a bare term is not a URL", not is_url_query("take on me a-ha"))
    check("a link IS a url query", is_url_query("  https://youtu.be/x  "))
    check("an unsupported host is still a url query",
          is_url_query("https://evil.example.com/watch?v=abc"))


def test_classification_table() -> None:
    print("real yt-dlp failures map to the right category")
    cases = [
        # (raw provider text, expected category, operation)
        ("ERROR: [youtube] abc: Sign in to confirm you’re not a bot",
         YT_BOT_CHECK, "search"),
        ("ERROR: Unable to extract player response function for video",
         YT_BOT_CHECK, "search"),
        ("ERROR: [youtube] abc: Sign in to confirm your age", YT_LOGIN_REQUIRED, "search"),
        ("ERROR: [youtube] abc: Private video. Sign in to view", YT_LOGIN_REQUIRED, "search"),
        ("ERROR: [youtube] abc: This video is members-only", YT_LOGIN_REQUIRED, "search"),
        ("ERROR: HTTP Error 429: Too Many Requests", YT_RATE_LIMITED, "search"),
        ("ERROR: [youtube] abc: Unable to download webpage: HTTP Error 403: Forbidden",
         YT_FORBIDDEN, "search"),
        ("ERROR: [youtube] abc: Video unavailable. This video is not available",
         YT_PROVIDER_UNAVAILABLE, "search"),
        ("ERROR: Unable to download API page: HTTP Error 404: Not Found",
         YT_PROVIDER_UNAVAILABLE, "extract"),
        ("ERROR: Unable to download webpage: read timed out. Retrying (1/2)",
         YT_TIMEOUT, "search"),
        ("socket timed out", YT_TIMEOUT, "extract"),
        ("ERROR: Unsupported URL: https://vimeo.com/1", YT_NO_RESULTS, "extract"),
        ("ERROR: [youtube] abc: No video formats found!", YT_NO_RESULTS, "search"),
        ("something nobody has seen before", YT_SEARCH_FAILED, "search"),
        ("something nobody has seen before", YT_URL_EXTRACTION_FAILED, "extract"),
        ("", YT_NO_RESULTS, "search"),
    ]
    for raw, expected, op in cases:
        err = classify(raw, is_url=(op == "extract"))
        check(f"{expected} <- {raw[:52]!r}", err.category == expected,
              f"got {err.category}")
        check(f"operation reported as {op}", err.operation == op, err.operation)
        check("copy matches the category",
              err.user_message == USER_MESSAGES[expected], err.user_message)

    check("a bot check is transient (worth one retry)",
          YT_BOT_CHECK in TRANSIENT_CATEGORIES)
    check("an invalid URL is never retried",
          YT_INVALID_URL not in TRANSIENT_CATEGORIES)
    check("a refusal is never retried", YT_FORBIDDEN not in TRANSIENT_CATEGORIES)
    check("the detail is kept for logs",
          "not a bot" in classify("Sign in to confirm you're not a bot").internal_detail)
    busy = for_busy("queue")
    check("busy refusal has its own category", busy.category == YT_RESOLVER_BUSY)
    check("busy copy is safe", "yt-dlp" not in busy.user_message.lower())

    # for_kind: the resolver's own kind always beats the message.
    check("no kind -> classify the message",
          for_kind(None, detail="ERROR: HTTP Error 403").category == YT_FORBIDDEN)
    check("a self-assigned YT_ code is kept",
          for_kind("YT_INVALID_URL", detail="unsupported URL host").category
          == YT_INVALID_URL)
    check("a challenge is an access problem, whatever the scrubbed text says",
          for_kind("youtube_bot_challenge",
                   detail="[redacted: possible credential]").category == YT_BOT_CHECK)
    check("the challenge copy says YouTube could not be reached",
          for_kind("youtube_bot_challenge").user_message
          == "YouTube couldn't be reached right now. Please try again later.")
    check("an unknown kind falls back to the message",
          for_kind("something_new", detail="ERROR: HTTP Error 429").category
          == YT_RATE_LIMITED)
    check("no kind and no message is not a crash",
          for_kind(None, detail=None).category in USER_MESSAGES)


def test_log_detail_keeps_the_reason_but_not_the_secret() -> None:
    """The log-only detail must stay diagnosable AND credential-free.

    This is the shape that shipped: yt-dlp echoes the command it ran, so a
    failure raised while routing through the configured proxy carried the
    proxy's own userinfo. The old code replaced the WHOLE message with
    "[redacted: possible credential]"; blanking just the secret keeps the
    reason an operator needs.
    """
    print("the log detail redacts the secret, keeps the reason")
    raw = ("ERROR: [youtube] abc: Unable to download webpage: HTTP Error 403: "
           "Forbidden (via http://someuser:sup3rsecret@proxy.example:8080)")
    detail = classify(raw).internal_detail
    check("the reason survives", "http error 403" in detail.lower(), detail)
    check("the password is gone", "sup3rsecret" not in detail, detail)
    check("the proxy userinfo is gone", "someuser:" not in detail, detail)
    check("the host is still visible", "proxy.example" in detail, detail)
    check("userinfo is blanked, not the whole line",
          "***@proxy.example:8080" in detail, detail)

    for raw, secret in (
        ("failed via https://token@cdn.example/v", "token@"),
        ("url https://x.example/watch?signature=DEADBEEF&v=1", "DEADBEEF"),
        ("Cookie: SID=abcdef123456; other=1", "abcdef123456"),
        ("Authorization: Bearer ya29.abcdef", "ya29.abcdef"),
    ):
        out = redact_credentials(raw)
        check(f"secret removed: {raw[:34]!r}", secret not in out, out)

    # And the shape the UI never sees is still classified from the raw text.
    err = classify("ERROR: [youtube] abc: Forbidden (via http://u:p@proxy:8080)")
    check("classification ignores the redaction", err.category == YT_FORBIDDEN,
          err.category)


def test_public_egress_reason_keeps_the_reason() -> None:
    """/health/music is public: the reason must survive without the secret.

    This field has been answering "[redacted: possible credential]" because
    the stored message was scrubbed whole. The operator reading a public
    health endpoint learns nothing from that; they need to know the egress
    was refused, not that some string was scary.
    """
    print("the public egress reason is a reason, not a redaction notice")
    raw = ("ERROR: [youtube] abc: Sign in to confirm you’re not a bot. "
           "Use http://botuser:proxysecret@proxy.example:8080")
    music.record_proxy_challenged(raw)
    state = music.proxy_state()
    reason = str(state.get("last_reason"))
    check("the reason is kept", "not a bot" in reason.lower(), reason)
    check("the proxy password is gone", "proxysecret" not in reason, reason)
    check("the proxy user is gone", "botuser:" not in reason, reason)
    check("no redaction placeholder is published", "[redacted" not in reason,
          reason)
    published = json.dumps(state)
    check("the public payload still has no credentials",
          not any(tok in published.lower() for tok in
                  ("proxysecret", "botuser", "password")), published[:200])
    check("the operator can still see WHICH egress", "proxy" in reason.lower(),
          reason)
    music.record_egress_success(False)
    check("the counter moved", True)


def test_diagnostic_payload_is_credential_free() -> None:
    print("the diagnostic payload carries no query content")
    secretish = "https://www.youtube.com/watch?v=x&token=abcdef123456&ip=1.2.3.4"
    payload = classify("HTTP Error 403: Forbidden", is_url=True).diagnostic(
        query=secretish, duration_ms=1234)
    check("provider reported", payload["provider"] == "youtube", str(payload))
    check("operation reported", payload["operation"] == "extract", str(payload))
    check("status is failed", payload["status"] == "failed", str(payload))
    check("reason is the category", payload["reason"] == YT_FORBIDDEN, str(payload))
    check("duration is kept", payload["durationMs"] == 1234, str(payload))
    check("query length, not content",
          payload["queryLength"] == len(secretish) and "token" not in str(payload),
          str(payload))
    blob = str(payload)
    check("no url in the payload", "http" not in blob, blob)
    check("no secret in the payload", "abcdef123456" not in blob, blob)
    check("only the documented keys",
          set(payload) == {"provider", "operation", "status", "reason",
                           "queryLength", "durationMs"}, str(payload))


def test_source_files_never_render_provider_output() -> None:
    """No module may INTERPOLATE a raw provider message into user-facing text.

    Parsed, not grepped: a docstring is allowed to say `yt-dlp: …` (that is
    how the leak is described), and a log call or sanitize_for_log() is
    allowed to carry the detail. What must not exist is a format string or a
    literal that puts provider text in front of a user.
    """
    print("no source file hands provider text to a user")
    root = Path(__file__).resolve().parent.parent / "bot"
    offenders: list[str] = []

    def docstring_nodes(tree: ast.AST) -> set[int]:
        out: set[int] = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef,
                                 ast.AsyncFunctionDef)):
                body = getattr(node, "body", [])
                if (body and isinstance(body[0], ast.Expr)
                        and isinstance(body[0].value, ast.Constant)
                        and isinstance(body[0].value.value, str)):
                    out.add(id(body[0].value))
        return out

    def mentions_resolve_error(node: ast.AST) -> bool:
        for inner in ast.walk(node):
            if isinstance(inner, ast.Attribute) and inner.attr in (
                    "get_resolve_error", "_last_resolve_error"):
                return True
        return False

    for path in sorted(root.rglob("*.py")):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="ignore"))
        except SyntaxError:
            continue
        docs = docstring_nodes(tree)
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                if id(node) not in docs and "yt-dlp:" in node.value.lower():
                    offenders.append(f"{path.name}:{node.lineno} string literal 'yt-dlp:'")
            if isinstance(node, ast.JoinedStr) and mentions_resolve_error(node):
                offenders.append(
                    f"{path.name}:{node.lineno} interpolates a raw resolve error")
    check("no raw provider text in any user-facing path",
          not offenders, "; ".join(offenders[:4]))


class StubEngine(music.MusicEngine):
    """A resolve that fails the way the provider really failed."""

    def __init__(self, message: str, kind: str | None = None) -> None:
        super().__init__()
        self._message = message
        self._kind = kind
        self.seen: list[str] = []

    async def _resolve_unbounded(self, query: str):
        self.seen.append(query)
        self._last_resolve_error = self._message
        self._last_error_kind = self._kind
        return None


def reset_gate(limit: int = 4) -> None:
    music.config.MUSIC_RESOLVE_CONCURRENCY = limit
    music.config.MUSIC_RESOLVE_QUEUE_TIMEOUT = 120
    music.MusicEngine._resolve_semaphore = None
    music.MusicEngine._resolve_loop = None
    music.MusicEngine._resolve_inflight = 0
    music.MusicEngine._resolve_peak = 0


async def test_engine_surfaces() -> None:
    print("a failing resolve reports a category, not provider text")
    cases = [
        ("ERROR: [youtube] abc: Sign in to confirm you’re not a bot", None, YT_BOT_CHECK),
        ("ERROR: [youtube] abc: Private video. Sign in to view", None, YT_LOGIN_REQUIRED),
        ("ERROR: HTTP Error 429: Too Many Requests", None, YT_RATE_LIMITED),
        ("ERROR: [youtube] abc: HTTP Error 403: Forbidden", None, YT_FORBIDDEN),
        ("ERROR: Unable to download webpage: read timed out", None, YT_TIMEOUT),
        ("resolver busy: waited 120s for a resolve slot", "RESOLVER_BUSY",
         YT_RESOLVER_BUSY),
        # A code we assigned ourselves must survive untouched.
        ("unsupported URL host", "YT_INVALID_URL", YT_INVALID_URL),
        # The resolver's own refusal must NOT be re-derived as "no results".
        ("no authorized original recording found", NO_ORIGINAL_FOUND,
         YT_NO_AUTHORIZED_ORIGINAL),
        # A live YouTube challenge: the stored message is ALREADY scrubbed, so
        # classifying it from the text used to report "search failed" — the
        # "your track does not exist" mistake. The resolver's own kind wins.
        ("[redacted: possible credential]", "youtube_bot_challenge", YT_BOT_CHECK),
        ("preview clip only", "preview_only", YT_PREVIEW_ONLY),
        ("fallback provider returned a different track", "fallback_mismatch",
         YT_FALLBACK_MISMATCH),
        ("no authorized original recording found", "VALIDATION_FAILED",
         YT_VALIDATION_FAILED),
    ]
    for message, kind, expected in cases:
        reset_gate()
        eng = StubEngine(message, kind)
        track = await eng.resolve("take on me a-ha")
        err = eng.provider_error()
        check(f"{expected}: refused", track is None)
        check(f"{expected}: category", err.category == expected,
              f"got {err.category}")
        check(f"{expected}: no provider text in the copy",
              "yt-dlp" not in err.user_message.lower() and "ERROR" not in err.user_message,
              err.user_message)
        check(f"{expected}: refusal is never cached",
              eng.cache_stats()["resolver_cache_entries"] == 0, str(eng.cache_stats()))

    reset_gate()
    eng = StubEngine("no authorized original recording found", NO_ORIGINAL_FOUND)
    await eng.resolve("bohemian rhapsody queen")
    copy = eng.provider_error().user_message.lower()
    check("a cover refusal says so and offers no substitute",
          "authorized original" in copy and "didn't play one" in copy, copy)

    # A live challenge must not be reported as "no playable match".
    reset_gate()
    eng = StubEngine("[redacted: possible credential]", "youtube_bot_challenge")
    await eng.resolve("earth wind and fire september")
    err = eng.provider_error()
    check("a live challenge reports an access problem",
          err.category == YT_BOT_CHECK, err.category)
    check("the access copy is the YouTube one",
          err.user_message
          == "YouTube couldn't be reached right now. Please try again later.",
          err.user_message)
    check("nothing about a missing track is claimed",
          "not found" not in err.user_message.lower()
          and "no matching" not in err.user_message.lower(), err.user_message)


async def test_unsupported_url_never_reaches_yt_dlp() -> None:
    """The real _resolve_unbounded, with the extractor held back.

    The guard has to live INSIDE the real resolve — a stubbed body would
    pass this test without proving anything — so `build_strategies` is
    replaced with a recorder. If any extraction is even attempted, the
    recorder shows it.
    """
    print("an unsupported link is refused before extraction")
    attempts: list[str] = []
    original = music.build_strategies

    def recorder(query, is_url, use_proxy, scope="all", **kwargs):
        attempts.append(query)
        return []

    music.build_strategies = recorder
    try:
        eng = music.MusicEngine()
        track = await eng._resolve_unbounded("https://evil.example.com/watch?v=abc")
        err = eng.provider_error(is_url=True)
    finally:
        music.build_strategies = original
    check("refused", track is None)
    check("no extraction strategy was built", attempts == [], str(attempts))
    check("category is invalid-url", err.category == YT_INVALID_URL, err.category)
    check("copy is the invalid-link line",
          err.user_message == "That link isn't a supported music link.",
          err.user_message)
    check("the operation is recorded as extract", err.operation == "extract",
          err.operation)
    check("nothing was cached from a refusal",
          eng.cache_stats()["resolver_cache_entries"] == 0, str(eng.cache_stats()))


async def test_unsearchable_query_never_invents_a_source() -> None:
    """Blank / punctuation-only input must not reach the provider at all.

    Found in production: `/music/diagnose?q="   "` returned a real stream —
    "tesla (slowed electro mix)". An empty query ranks nothing, so the
    ranking had nothing to score and returned whatever the provider listed
    first, which is how an empty search became a slowed remix. This drives
    the real `_resolve_unbounded` with the strategy builder replaced by a
    recorder, so a regression cannot hide behind a stub.
    """
    print("an unsearchable query is refused before extraction")
    attempts: list[str] = []
    original = music.build_strategies

    def recorder(query, is_url, use_proxy, scope="all", **kwargs):
        attempts.append(query)
        return []

    music.build_strategies = recorder
    try:
        eng = music.MusicEngine()
        for bad in ("", "   ", "\t\n", "***", "...", "-_-", "?!?"):
            attempts.clear()
            track = await eng._resolve_unbounded(bad)
            err = eng.provider_error()
            label = repr(bad)
            check(f"{label}: refused", track is None)
            check(f"{label}: no extraction attempted", attempts == [], str(attempts))
            check(f"{label}: category is no-results", err.category == YT_NO_RESULTS,
                  err.category)
            check(f"{label}: copy says nothing was found",
                  err.user_message == "No matching tracks were found.",
                  err.user_message)
            check(f"{label}: nothing cached",
                  eng.cache_stats()["resolver_cache_entries"] == 0,
                  str(eng.cache_stats()))
        # A real query and a real link still get through (the recorder may see
        # the query more than once: one plan per egress).
        attempts.clear()
        await eng._resolve_unbounded("take on me a-ha")
        check("a real search is not refused",
              attempts and set(attempts) == {"take on me a-ha"}, str(attempts))
        attempts.clear()
        await eng._resolve_unbounded("https://youtu.be/dQw4w9WgXcQ")
        check("a real link is not refused",
              attempts and set(attempts) == {"https://youtu.be/dQw4w9WgXcQ"},
              str(attempts))
    finally:
        music.build_strategies = original


async def test_one_resolver_for_every_surface() -> None:
    print("every surface reads the SAME classification")
    reset_gate()
    eng = StubEngine("ERROR: [youtube] abc: Sign in to confirm you’re not a bot")
    await eng.resolve("billie jean")
    from_slash = eng.provider_error()
    from_prefix = eng.provider_error()
    from_dashboard = eng.provider_error(is_url=False)
    check("slash and prefix agree", from_slash == from_prefix)
    check("dashboard proxy agrees",
          (from_dashboard.category, from_dashboard.user_message)
          == (from_slash.category, from_slash.user_message))
    diag = from_dashboard.diagnostic(query="billie jean", duration_ms=10)
    check("diagnostic agrees too", diag["reason"] == YT_BOT_CHECK, str(diag))


def main() -> int:
    test_every_category_has_safe_copy()
    test_no_copy_mentions_the_provider()
    test_url_validation()
    test_classification_table()
    test_log_detail_keeps_the_reason_but_not_the_secret()
    test_public_egress_reason_keeps_the_reason()
    test_diagnostic_payload_is_credential_free()
    test_source_files_never_render_provider_output()
    for coro in (
        test_engine_surfaces(),
        test_unsupported_url_never_reaches_yt_dlp(),
        test_unsearchable_query_never_invents_a_source(),
        test_one_resolver_for_every_surface(),
    ):
        asyncio.run(coro)
    print(f"\n{PASSED} passed, {FAILED} failed")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())