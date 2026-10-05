"""Provider error classification for music resolution.

Every surface — `/play`, the `mg!` prefix, the dashboard search proxy, the
queue, autoplay — failed in its own way when yt-dlp raised, and two of them
printed the raw provider message straight into a Discord embed. That leaked
the shape of our egress configuration (and produced the literal string
`[redacted: possible credential]` to end users, which helps nobody).

This module is the single place that answers two questions for a failure:

  * what KIND of failure is this, internally?          -> a `YT_*` code
  * what is it safe to tell the user?                  -> fixed copy

Rules that must not drift:

  * Raw yt-dlp text NEVER leaves this module. It goes to `internal_detail`,
    which is for logs only. `user_message` is chosen from a closed set.
  * Access problems are named as access problems. A bot check is NOT "track
    not found": telling someone their track does not exist when YouTube
    refused us sends them looking in the wrong place entirely.
  * A refused authorization is never silently turned into a different track.
    Classification never invents a source.
"""

from __future__ import annotations

import re
from typing import NamedTuple

# ── Internal categories ──────────────────────────────────────────────────
YT_SEARCH_FAILED = "YT_SEARCH_FAILED"
YT_URL_EXTRACTION_FAILED = "YT_URL_EXTRACTION_FAILED"
YT_LOGIN_REQUIRED = "YT_LOGIN_REQUIRED"
YT_BOT_CHECK = "YT_BOT_CHECK"
YT_RATE_LIMITED = "YT_RATE_LIMITED"
YT_FORBIDDEN = "YT_FORBIDDEN"
YT_PROVIDER_UNAVAILABLE = "YT_PROVIDER_UNAVAILABLE"
YT_NO_RESULTS = "YT_NO_RESULTS"
YT_INVALID_URL = "YT_INVALID_URL"
YT_TIMEOUT = "YT_TIMEOUT"
YT_RESOLVER_BUSY = "YT_RESOLVER_BUSY"
YT_PREVIEW_ONLY = "YT_PREVIEW_ONLY"
YT_FALLBACK_MISMATCH = "YT_FALLBACK_MISMATCH"
YT_VALIDATION_FAILED = "YT_VALIDATION_FAILED"
YT_NO_AUTHORIZED_ORIGINAL = "YT_NO_AUTHORIZED_ORIGINAL"

#: Copy shown to users. Deliberately short, actionable, and free of any
#: provider internals, URLs, credentials or filesystem paths.
USER_MESSAGES: dict[str, str] = {
    YT_SEARCH_FAILED: "Music search is temporarily unavailable. Please try again.",
    YT_URL_EXTRACTION_FAILED: "Music search is temporarily unavailable. Please try again.",
    YT_LOGIN_REQUIRED: "YouTube couldn't be reached right now. Please try again later.",
    YT_BOT_CHECK: "YouTube couldn't be reached right now. Please try again later.",
    YT_RATE_LIMITED: "YouTube is rate limiting requests right now. Please try again in a moment.",
    YT_FORBIDDEN: "YouTube wouldn't serve that track. Please try a different one.",
    YT_PROVIDER_UNAVAILABLE: "Music search is temporarily unavailable. Please try again.",
    YT_NO_RESULTS: "No matching tracks were found.",
    YT_INVALID_URL: "That link isn't a supported music link.",
    YT_TIMEOUT: "The music service took too long to respond. Please try again.",
    YT_RESOLVER_BUSY: "The music service is busy right now. Please try again in a moment.",
    YT_PREVIEW_ONLY: "That link is only a short preview, not the full track.",
    YT_FALLBACK_MISMATCH: "I couldn't confirm a playable version of that track.",
    YT_VALIDATION_FAILED: "That search didn't match a playable track.",
    YT_NO_AUTHORIZED_ORIGINAL: (
        "I couldn't find a suitable authorized original recording for that. "
        "Only covers or re-recorded versions were available, so I didn't play one."),
}

#: Codes the resolver assigns ITSELF, mapped to a category.
#:
#: These are authoritative and must never be re-derived from the provider's
#: message. That is not a theoretical concern: when YouTube challenges this
#: host the resolver records `youtube_bot_challenge` and stores a message that
#: has ALREADY been scrubbed — so re-deriving it classified a live access
#: refusal as a generic search failure, which is the "your track does not
#: exist" mistake all over again.
RESOLVER_CODES: dict[str, str] = {
    "RESOLVER_BUSY": YT_RESOLVER_BUSY,
    "youtube_bot_challenge": YT_BOT_CHECK,
    "preview_only": YT_PREVIEW_ONLY,
    "fallback_mismatch": YT_FALLBACK_MISMATCH,
    "VALIDATION_FAILED": YT_VALIDATION_FAILED,
    "NO_ORIGINAL_FOUND": YT_NO_AUTHORIZED_ORIGINAL,
    "SEARCH_ALTERNATIVE_SOURCE": YT_NO_AUTHORIZED_ORIGINAL,
}

#: Categories worth ONE bounded retry. A bot check or a transient 5xx may pass;
#: an invalid URL or a refusal never will, and retrying only wastes quota.
TRANSIENT_CATEGORIES = frozenset({YT_BOT_CHECK, YT_TIMEOUT, YT_PROVIDER_UNAVAILABLE,
                                  YT_RATE_LIMITED, YT_LOGIN_REQUIRED})

# Hostnames we can actually extract. Anything else is rejected BEFORE it
# reaches yt-dlp, so an arbitrary pasted string is never handed to the
# extractor as if it were a media URL.
SUPPORTED_URL_HOSTS = (
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
    "youtu.be", "www.youtu.be",
)

_URL_RE = re.compile(r"^https?://", re.IGNORECASE)

# Credential shapes that appear INSIDE provider messages. yt-dlp echoes the
# command it ran on failure, so an error raised while routing through a
# configured proxy contains the proxy's own userinfo — which is precisely why
# the old surface printed `[redacted: possible credential]` to end users.
#
# These patterns blank the SECRET and keep the rest of the sentence, so the
# server log stays diagnosable. Replacing the whole message (what
# sanitize_for_log does) is safe but tells nobody anything.
_CREDENTIAL_PATTERNS: tuple[tuple[re.Pattern, str], ...] = (
    # scheme://user:password@host  ->  scheme://***@host
    (re.compile(r"([a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@", re.IGNORECASE),
     r"\1***@"),
    # scheme://token@host  ->  scheme://***@host
    (re.compile(r"([a-z][a-z0-9+.-]*://)[^/\s@]+@", re.IGNORECASE), r"\1***@"),
    # ?token=…/&sig=…/&key=… style query values
    (re.compile(
        r"(?i)\b((?:access[_-]?token|token|auth|authorization|signature|sig|"
        r"api[_-]?key|key|password|passwd|pwd|session|cookie)=)[^&\s'\"]+"),
     r"\1***"),
    # A cookie or authorization header, whole value dropped.
    (re.compile(r"(?i)\b(set-cookie|cookie|authorization|"
                r"proxy-authorization)\s*:\s*[^\n]+"), r"\1: ***"),
)


def redact_credentials(text: str | None) -> str:
    """Blank credential VALUES, keep the sentence around them.

    Used for log-only fields. It never returns something a user should see —
    it exists so that an operator can read WHY a resolve failed without the
    log itself becoming a place secrets accumulate.
    """
    out = text or ""
    for pattern, replacement in _CREDENTIAL_PATTERNS:
        out = pattern.sub(replacement, out)
    return out


class ProviderError(NamedTuple):
    """One classified failure.

    `category` and `provider` are safe to log. `internal_detail` is for the
    server log ONLY. `user_message` is the only field a UI should render.
    """

    category: str
    user_message: str
    internal_detail: str
    provider: str = "youtube"
    operation: str = "search"
    transient: bool = False

    def diagnostic(self, *, query: str | None = None,
                   duration_ms: int | None = None) -> dict:
        """Credential-free payload for /music/diagnostics.

        The query is NEVER included: a pasted URL can carry a token in its
        query string, and a search term is user input. Only its length is
        useful for triage and carries no content.
        """
        return {
            "provider": self.provider,
            "operation": self.operation,
            "status": "failed",
            "reason": self.category,
            "queryLength": len(query or ""),
            "durationMs": duration_ms,
        }


def is_url_query(text: str) -> bool:
    return bool(_URL_RE.match((text or "").strip()))


def is_supported_url(text: str) -> bool:
    """True only for a URL this system knows how to extract.

    Checked before yt-dlp so an arbitrary pasted string is never handed to
    the extractor, and so a malformed link is reported as an invalid link
    rather than as a provider failure.
    """
    raw = (text or "").strip()
    if not _URL_RE.match(raw):
        return False
    try:
        from urllib.parse import urlparse
        host = (urlparse(raw).hostname or "").lower()
    except Exception:
        return False
    return any(host == h or host.endswith("." + h) for h in SUPPORTED_URL_HOSTS)


def classify(text: str | None, *, is_url: bool = False,
             operation: str | None = None) -> ProviderError:
    """Map a provider failure message to a category and safe copy.

    Order matters: the most specific signal wins, so a "sign in" message that
    also mentions a bot check is reported as the access problem it is.
    """
    raw = (text or "").strip()
    low = raw.lower()
    op = operation or ("extract" if is_url else "search")

    def make(category: str) -> ProviderError:
        return ProviderError(
            category=category,
            user_message=USER_MESSAGES[category],
            internal_detail=redact_credentials(raw)[:300] or "no detail",
            operation=op,
            transient=category in TRANSIENT_CATEGORIES,
        )

    if not raw:
        return make(YT_NO_RESULTS if not is_url else YT_URL_EXTRACTION_FAILED)

    # Access / anti-bot. These say nothing about whether the track exists.
    #
    # Bot-check phrases are tested FIRST because the most common refusal is
    # "Sign in to confirm you're not a bot" — a bot challenge wearing the
    # words "sign in". Matching the login phrase first reported an automated
    # access refusal as "you need to sign in", which invites exactly the
    # wrong user action (logging into a service that never had an account).
    if any(s in low for s in ("not a bot", "confirm you are not a bot",
                              "bot check", "automated queries",
                              "unable to extract player response",
                              "failed to extract any player response",
                              "extract player response function")):
        return make(YT_BOT_CHECK)
    if any(s in low for s in ("http error 429", "too many requests",
                              "rate-limit", "rate limit")):
        return make(YT_RATE_LIMITED)
    if any(s in low for s in ("sign in to confirm", "sign in to view",
                              "login required", "this video is private",
                              "private video", "members-only", "age-restricted")):
        return make(YT_LOGIN_REQUIRED)
    if "http error 403" in low or "forbidden" in low:
        return make(YT_FORBIDDEN)
    if "http error 404" in low or "not available" in low or "unavailable" in low:
        return make(YT_PROVIDER_UNAVAILABLE)
    if any(s in low for s in ("timed out", "timeout", "read timeout")):
        return make(YT_TIMEOUT)
    if any(s in low for s in ("unsupported url", "no video formats found",
                              "requested format is not available")):
        return make(YT_NO_RESULTS)

    if is_url:
        return make(YT_URL_EXTRACTION_FAILED)
    return make(YT_SEARCH_FAILED)


def for_busy(category_hint: str | None = None) -> ProviderError:
    """Admission-control refusal, mapped to the same user-facing shape."""
    return ProviderError(
        category=YT_RESOLVER_BUSY,
        user_message=USER_MESSAGES[YT_RESOLVER_BUSY],
        internal_detail=f"resolver busy ({category_hint or 'queue'})",
        transient=True,
    )


def for_kind(kind: str | None, *, detail: str | None = None,
             is_url: bool = False) -> ProviderError:
    """Turn the resolver's own error kind into a classified failure.

    This is the single entry point a UI should use. A kind the resolver
    assigned is authoritative; only when there is none (or it is unknown) is
    the provider message classified. `internal_detail` is for the log.
    """
    if kind == "RESOLVER_BUSY":
        return for_busy(kind)
    # A YT_* code the resolver assigned itself is already a category.
    category = kind if kind in USER_MESSAGES else RESOLVER_CODES.get(kind or "")
    if category:
        return ProviderError(
            category=category,
            user_message=USER_MESSAGES[category],
            internal_detail=redact_credentials(detail or kind)[:300],
            operation="extract" if is_url or category in (
                YT_INVALID_URL, YT_URL_EXTRACTION_FAILED) else "search",
            transient=category in TRANSIENT_CATEGORIES,
        )
    return classify(detail, is_url=is_url)