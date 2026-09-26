"""Music engine — per-guild player with yt-dlp + FFmpeg, robust error handling."""

import asyncio
import logging
import os
import re
import shutil
import tempfile
import time
from collections import deque
from pathlib import Path
from typing import Any, Optional

import discord
import yt_dlp

import config
import net as http

log = logging.getLogger("bot.music")

# ── Bundled JavaScript runtime (yt-dlp's YouTube challenge solver) ────────
# YouTube's signature / n-parameter challenges cannot be solved without an
# external JavaScript runtime, and Deno is the only one yt-dlp enables by
# itself. yt-dlp finds runtimes through PATH, so a runtime that exists but is
# not on PATH is invisible — extraction then fails in a way that is
# indistinguishable from an IP block ("Sign in to confirm you're not a bot").
# The deploy downloads one into ./bin (scripts/install_deno.py); expose it
# here, before anything resolves a track, instead of trusting the host PATH.
_BUNDLED_BIN = Path(__file__).resolve().parent.parent / "bin"


def _expose_bundled_runtime() -> list[str]:
    """Prepend any bundled runtime directory to PATH; report what was added."""
    directories: list[Path] = []
    override = os.environ.get("YT_JS_RUNTIME_DIR", "").strip()
    if override:
        directories.append(Path(override))
    directories.append(_BUNDLED_BIN)
    added: list[str] = []
    entries = os.environ.get("PATH", "").split(os.pathsep)
    for directory in directories:
        entry = str(directory)
        if directory.is_dir() and entry not in entries:
            os.environ["PATH"] = f"{entry}{os.pathsep}{os.environ.get('PATH', '')}"
            entries.insert(0, entry)
            added.append(entry)
    return added


BUNDLED_RUNTIME_DIRS = _expose_bundled_runtime()


def _resolve_ffmpeg() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


FFMPEG_EXE = _resolve_ffmpeg()

# Last real measurement of the decoder (None = never measured). Exposed through
# /health so the dashboard never has to guess whether music can play.
FFMPEG_OK: bool | None = None
FFMPEG_VERSION: str | None = None
FFMPEG_ERROR: str | None = None


# ── Playback error taxonomy ──────────────────────────────────────────────
# Every playback failure maps to exactly one of these codes. The cog layer
# turns the code into a user-friendly message; the raw technical detail stays
# in backend logs + the playback-log ring buffer. Never invent a new generic
# message — classify instead.
AUDIO_SOURCE_FAILED = "audio_source_failed"
VOICE_CONNECTION_FAILED = "voice_connection_failed"
FFMPEG_FAILED = "ffmpeg_failed"
FFMPEG_MISSING = "ffmpeg_missing"
OPUS_MISSING = "opus_missing"
OPUS_LOAD_FAILED = "opus_load_failed"
AUDIO_PROCESS_FAILED = "audio_process_failed"
EXPIRED_AUDIO_SOURCE = "expired_audio_source"
SOURCE_UNAVAILABLE = "source_unavailable"
PLAYBACK_TIMEOUT = "playback_timeout"
MISSING_PERMISSION = "missing_permission"
QUEUE_CORRUPTED = "queue_corrupted"
# discord.py's voice backend was split into a separate package (davey). When it
# is absent every voice connect raises a RuntimeError that names no subsystem
# unless it is classified here — it used to fall through to the generic
# "unknown playback error" and told the user nothing actionable.
VOICE_LIBRARY_MISSING = "voice_library_missing"
# YouTube is challenging this host's IP. The remedy is credentials (cookies or
# a proxy), never a retry.
YOUTUBE_CHALLENGED = "youtube_challenged"
UNKNOWN_PLAYBACK_ERROR = "unknown_playback_error"

PLAYBACK_USER_MESSAGES: dict[str, tuple[str, str]] = {
    AUDIO_SOURCE_FAILED: (
        "🎵 Audio Source Failed",
        "The song was found, but the audio source could not be started. "
        "Try another result or check the configured music source.",
    ),
    VOICE_CONNECTION_FAILED: (
        "🔊 Voice Connection Failed",
        "The bot could not connect to the voice channel. Make sure the bot can "
        "View Channel, Connect, and Speak.",
    ),
    FFMPEG_FAILED: (
        "🎚️ FFmpeg Failed",
        "The audio processor could not start. Check that FFmpeg is installed "
        "correctly and available to the bot.",
    ),
    FFMPEG_MISSING: (
        "🎚️ FFmpeg Unavailable",
        "FFmpeg is unavailable on the music server, so no audio can be "
        "produced. Install FFmpeg where the bot runs and restart it.",
    ),
    OPUS_MISSING: (
        "🎙️ Opus Codec Missing",
        "The Opus voice codec library was not found on the music server, so "
        "Discord voice audio cannot be encoded. Install the Opus library "
        "where the bot runs and restart it.",
    ),
    OPUS_LOAD_FAILED: (
        "🎙️ Opus Codec Failed to Load",
        "The Opus voice codec is present but could not be loaded. Check the "
        "bot logs for the loader error and restart the bot.",
    ),
    AUDIO_PROCESS_FAILED: (
        "🔇 Audio Process Exited",
        "The audio process exited unexpectedly in the middle of playback. "
        "Try again — if it keeps happening, check Music Diagnostics.",
    ),
    EXPIRED_AUDIO_SOURCE: (
        "⌛ Audio Source Expired",
        "The audio stream URL expired before playback started. Queue the "
        "song again to fetch a fresh URL.",
    ),
    SOURCE_UNAVAILABLE: (
        "🌐 Source Unavailable",
        "The selected audio source is currently unavailable. Try another result.",
    ),
    PLAYBACK_TIMEOUT: (
        "⏱️ Playback Timeout",
        "The audio source took too long to start. Please try again.",
    ),
    MISSING_PERMISSION: (
        "🚫 Missing Permission",
        "The bot does not have the required voice-channel permissions.",
    ),
    QUEUE_CORRUPTED: (
        "📋 Queue Error",
        "The music queue was in an unusable state and has been reset. "
        "Please queue the song again.",
    ),
    VOICE_LIBRARY_MISSING: (
        "🔊 Voice Support Missing",
        "The bot cannot open a Discord voice connection because its voice "
        "library (davey) is not installed. Reinstall the bot's requirements "
        "and restart it — audio cannot play until then.",
    ),
    YOUTUBE_CHALLENGED: (
        "🔒 YouTube Needs Verification",
        "YouTube is challenging this server's IP address. Set YT_COOKIES or "
        "YOUTUBE_PROXY in the bot's environment and restart it — retrying "
        "cannot help.",
    ),
    UNKNOWN_PLAYBACK_ERROR: (
        "❓ Unknown Playback Error",
        "Playback could not be started. Check Music Diagnostics for the exact cause.",
    ),
}

_SENSITIVE_MARKERS = (
    "token", "cookie", "cookies", "api_key", "apikey", "secret",
    "password", "passwd", "authorization", "bearer", "set-cookie",
)


def sanitize_for_log(text: str | None, *, limit: int = 500) -> str | None:
    """Redact anything that looks like a credential before logging/display."""
    if not text:
        return text
    low = text.lower()
    for marker in _SENSITIVE_MARKERS:
        if marker in low:
            return "[redacted: possible credential]"
    # Never leak full URLs with query credentials; keep host + path only.
    if "://" in text and ("?" in text or "@" in text):
        try:
            head, _, tail = text.partition("://")
            host_path = tail.split("?", 1)[0]
            if "@" in host_path:
                host_path = host_path.split("@", 1)[1]
            return f"{head}://{host_path}"[:limit]
        except Exception:
            return text[:limit]
    return text[:limit]


class PlaybackError(Exception):
    """A classified playback failure: machine-readable code + safe detail."""

    def __init__(self, code: str, stage: str, detail: str = "",
                 diagnostics: dict | None = None):
        self.code = code
        self.stage = stage
        self.detail = detail
        self.diagnostics = diagnostics or {}
        title, user_msg = PLAYBACK_USER_MESSAGES.get(
            code, PLAYBACK_USER_MESSAGES[UNKNOWN_PLAYBACK_ERROR])
        self.user_title = title
        self.user_message = user_msg
        super().__init__(f"[{code}@{stage}] {detail}"[:500])


def classify_playback_exception(exc: BaseException) -> str:
    """Map any exception to a playback error code (never raises)."""
    if isinstance(exc, PlaybackError):
        return exc.code
    if isinstance(exc, asyncio.TimeoutError):
        return PLAYBACK_TIMEOUT
    name = type(exc).__name__
    msg = str(exc).lower()
    if "timed out" in msg or "timeout" in msg or "timedout" in msg:
        return PLAYBACK_TIMEOUT
    # An expired googlevideo stream URL answers 403 — that is a stale URL, not
    # a Discord permission problem. Must precede the Discord-403 rule below.
    if "expired" in msg or ("403" in msg and ("googlevideo" in msg or "stream" in msg or "url" in msg)):
        return EXPIRED_AUDIO_SOURCE
    if isinstance(exc, PermissionError) or "missing permission" in msg or "forbidden" in msg or "403" in msg:
        return MISSING_PERMISSION
    # An FFmpeg process that DIED mid-playback is a different fault from one
    # that never started (start failures are wrapped in an explicit
    # PlaybackError with FFMPEG_FAILED/MISSING, so this rule only re-labels
    # unwrapped process deaths). Must precede the generic ffmpeg rule.
    if "exited" in msg or ("process" in msg and "exit" in msg):
        return AUDIO_PROCESS_FAILED
    if "ffmpeg" in msg or "ffprobe" in msg or "executable" in msg or name in {"FileNotFoundError"} and "ffmpeg" in msg:
        return FFMPEG_FAILED
    # A missing voice backend raises "RuntimeError: davey library needed in
    # order to use voice". Classifying it matters three ways: it used to fall
    # through to UNKNOWN_PLAYBACK_ERROR (the user saw a generic "check Music
    # Diagnostics" for what is a missing dependency), and it must not be
    # reported as a permissions problem either.
    if "davey" in msg or ("library" in msg and "voice" in msg):
        return VOICE_LIBRARY_MISSING
    # Opus codec failures must name the codec, not the voice connection.
    # Load failures ("OpusNotLoaded", "could not load") precede the generic
    # missing-library wording so each maps to its own code.
    if "opus" in msg:
        if ("not loaded" in msg or "opusnotloaded" in msg or "could not load" in msg
                or "failed to load" in msg or "load" in msg):
            return OPUS_LOAD_FAILED
        if ("missing" in msg or "not found" in msg or "not installed" in msg
                or "no opus" in msg or "could not find" in msg
                or ("cannot open" in msg and "shared" in msg)):
            return OPUS_MISSING
        return OPUS_LOAD_FAILED
    # The resolve path already recognises YouTube's bot challenge; carry that
    # through so a playback-time failure names the real remedy (cookies or a
    # proxy) instead of falling back to the generic error.
    if is_bot_challenge(msg):
        return YOUTUBE_CHALLENGED
    if isinstance(exc, discord.ClientException):
        text = str(exc).lower()
        if "already playing" in text or "already connected" in text or "not connected" in text:
            return VOICE_CONNECTION_FAILED
        return VOICE_CONNECTION_FAILED
    if "connect" in msg and ("voice" in msg or "channel" in msg or "handshake" in msg):
        return VOICE_CONNECTION_FAILED
    # discord.py's voice failures surface as RuntimeError; without this they
    # were the main remaining source of "unknown playback error".
    if isinstance(exc, RuntimeError) and "voice" in msg:
        return VOICE_CONNECTION_FAILED
    if "unavailable" in msg or "not available" in msg or "404" in msg or "410" in msg:
        return SOURCE_UNAVAILABLE
    if "no audio" in msg or "no stream" in msg or "no url" in msg or "could not resolve" in msg:
        return AUDIO_SOURCE_FAILED
    return UNKNOWN_PLAYBACK_ERROR


async def probe() -> bool:
    """Measure whether FFmpeg actually executes on THIS runtime.

    `music` used to be set to "ready" unconditionally from on_ready, so /health
    advertised working music on a host whose decoder was missing. This runs the
    real binary instead of asserting it. Recording the outcome is also what
    lets the dashboard distinguish "no decoder" from "decoder present but
    playback unproven".
    """
    global FFMPEG_OK, FFMPEG_VERSION, FFMPEG_ERROR
    ok = False
    FFMPEG_VERSION = None
    FFMPEG_ERROR = None
    try:
        proc = await asyncio.create_subprocess_exec(
            FFMPEG_EXE, "-version",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=8)
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            FFMPEG_ERROR = "ffmpeg -version timed out"
            raise
        ok = proc.returncode == 0
        if ok:
            first = (out or b"").decode("utf-8", "replace").splitlines()
            FFMPEG_VERSION = (first[0][:120] if first else "ffmpeg (version unknown)")
        else:
            FFMPEG_ERROR = f"ffmpeg exited with code {proc.returncode}"
    except PlaybackError:
        raise
    except asyncio.TimeoutError:
        log.warning("FFmpeg probe timed out (%s)", FFMPEG_EXE)
        if not FFMPEG_ERROR:
            FFMPEG_ERROR = "probe timed out"
    except FileNotFoundError:
        FFMPEG_ERROR = f"binary not found: {FFMPEG_EXE}"
        log.warning("FFmpeg binary not found (%s)", FFMPEG_EXE)
    except Exception as exc:
        FFMPEG_ERROR = sanitize_for_log(f"{type(exc).__name__}: {exc}", limit=200) or "probe failed"
        log.warning("FFmpeg probe failed (%s): %s", FFMPEG_EXE, str(exc)[:160])
    FFMPEG_OK = ok
    http.set_status("music", "ready" if ok else "ffmpeg-missing")
    return ok


def ffmpeg_check() -> dict:
    """Synchronous FFmpeg facts: exists, executable, accessible, last probe.

    Never raises; safe to call from HTTP handlers.
    """
    exe = FFMPEG_EXE or "ffmpeg"
    found = shutil.which(exe) or (exe if Path(exe).exists() else None)
    exists = bool(found or (exe and Path(exe).exists()))
    executable = bool(found and os.access(found, os.X_OK))
    if exe and Path(exe).exists() and not shutil.which(exe):
        try:
            executable = os.access(exe, os.X_OK)
            exists = True
        except Exception:
            pass
    if FFMPEG_OK is True:
        status = "ready"
    elif FFMPEG_OK is False:
        status = "missing" if (FFMPEG_ERROR or "").startswith("binary not found") else "failed"
    else:
        status = "unknown"
    return {
        "exe": exe,
        "resolved": found,
        "exists": exists,
        "executable": executable,
        "accessible": exists and (executable or FFMPEG_OK is True),
        "probed_ok": FFMPEG_OK,
        "version": FFMPEG_VERSION,
        "error": FFMPEG_ERROR,
        "status": status,
    }


def opus_status() -> dict:
    """Opus voice-codec readiness. Actually verifies usability, never raises.

    discord.py loads libopus lazily on the first voice connect. When it is
    not loaded yet, this performs the same load discord.py itself would do
    (`discord.opus.load_opus()`) so the result is a verification, not a
    guess: success means the voice stack can really use it. Outcomes:

    - ready        — loaded (already, or verified by a load just now)
    - missing      — the loader reports OpusNotLoaded: no usable library
    - load_failed  — the load raised something else (see error)
    - unknown      — introspection itself failed (never raises either way)
    """
    try:
        import discord as _discord
        if bool(_discord.opus.is_loaded()):
            return {"loaded": True, "lib": None, "status": "ready"}
        # Verify the same way the voice stack does: discord.opus.load_opus()
        # takes the library name (it has no zero-arg auto-discovery), so feed
        # it ctypes' discovery result — exactly the documented public path.
        # No name discoverable (common on Windows, where discord.py ships its
        # own bundled DLL) is NOT proof of missing: report unknown and let
        # the voice connect be the verifier.
        try:
            from ctypes.util import find_library
            lib = find_library("opus")
        except Exception:
            lib = None
        if not lib:
            return {"loaded": False, "lib": None, "status": "unknown",
                    "note": "opus not loaded and no library name discoverable; "
                            "discord.py may still load its bundled copy on voice connect"}
        try:
            _discord.opus.load_opus(lib)
        except Exception as load_exc:
            name = type(load_exc).__name__
            if name == "OpusNotLoaded" or "not loaded" in str(load_exc).lower():
                return {"loaded": False, "lib": lib, "status": "missing",
                        "error": "OpusNotLoaded"}
            return {"loaded": False, "lib": lib, "status": "load_failed",
                    "error": sanitize_for_log(f"{name}: {load_exc}", limit=200)}
        loaded = bool(_discord.opus.is_loaded())
        return {"loaded": loaded, "lib": lib, "status": "ready" if loaded else "unknown",
                "note": "verified by load" if loaded else "load returned without error but opus reports unloaded"}
    except Exception as exc:
        return {"loaded": False, "lib": None, "status": "unknown",
                "error": f"{type(exc).__name__}"}


def check_voice_permissions(channel, me) -> dict:
    """Automatic voice permission check — no manual IDs required.

    Returns per-permission granted flags plus an overall verdict.
    Never raises: an undeterminable permission reads as missing, not granted.
    """
    result = {
        "view_channel": None,
        "connect": None,
        "speak": None,
        "all_granted": False,
        "missing": [],
        "channel_id": str(getattr(channel, "id", "") or ""),
        "channel_name": getattr(channel, "name", "") or "",
    }
    try:
        perms = channel.permissions_for(me)
    except Exception as exc:
        log.debug("permissions_for failed: %s", str(exc)[:120])
        result["missing"] = ["view_channel", "connect", "speak"]
        return result
    try:
        vc = bool(getattr(perms, "view_channel", getattr(perms, "view_channels", False)))
    except Exception:
        vc = False
    try:
        co = bool(getattr(perms, "connect", False))
    except Exception:
        co = False
    try:
        sp = bool(getattr(perms, "speak", False))
    except Exception:
        sp = False
    result["view_channel"] = vc
    result["connect"] = co
    result["speak"] = sp
    missing = [k for k, v in (("view_channel", vc), ("connect", co), ("speak", sp)) if not v]
    result["missing"] = missing
    result["all_granted"] = not missing
    return result


_COOKIE_TMP: str | None = None


def cookies_path() -> str | None:
    """Path to a Netscape cookie jar for yt-dlp, or None.

    YouTube challenges datacenter egress IPs, which surfaces as a resolve that
    hangs rather than an error. Operators' own cookies are the standard fix;
    both a file and inline contents are accepted so this works on hosts where
    writing a file next to the code is awkward.
    """
    global _COOKIE_TMP
    path = config.YT_COOKIES_FILE
    if path:
        return path if Path(path).exists() else None
    raw = config.YT_COOKIES
    if not raw:
        return None
    if _COOKIE_TMP is None or not Path(_COOKIE_TMP).exists():
        fd, tmp = tempfile.mkstemp(prefix="ytcookies-", suffix=".txt")
        os.close(fd)
        Path(tmp).write_text(raw, encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        _COOKIE_TMP = tmp
    return _COOKIE_TMP


def js_runtimes() -> dict[str, Any]:
    """Which JavaScript runtimes yt-dlp can use to solve YouTube's challenges.

    yt-dlp needs one of these for signature/n-parameter solving. Without any,
    extraction can stall instead of failing fast — which is indistinguishable
    from a blocked IP unless it is measured.
    """
    found = {name: (shutil.which(name) or None) for name in ("deno", "node", "bun", "qjs", "quickjs")}
    try:
        import yt_dlp_ejs  # noqa: F401
        ejs = True
    except Exception:
        ejs = False
    return {
        "available": {k: bool(v) for k, v in found.items()},
        "any": any(found.values()),
        "yt_dlp_ejs_installed": ejs,
        # Where a build-time runtime would live, so "no runtime" names the
        # directory that was searched instead of leaving it a mystery.
        "bundled_dir": str(_BUNDLED_BIN),
        "bundled_dir_exists": _BUNDLED_BIN.is_dir(),
        "path_dirs_added": BUNDLED_RUNTIME_DIRS,
    }


# ── YouTube bot-challenge detection ───────────────────────────────────────
# YouTube challenges datacenter egress IPs and reports it as an extractor
# error, not an HTTP status:
#   ERROR: [youtube] 4NRXx6U8ABQ: Sign in to confirm you're not a bot.
# The old code could not tell that apart from any other failure, so it fell
# through to the next provider and played whatever that returned -- observed
# live returning an unrelated track and a 30-second preview clip. Naming the
# challenge lets the failure carry its own remedy (cookies or a proxy) instead
# of a generic "timed out".
_BOT_CHALLENGE_MARKERS = (
    "confirm you're not a bot",
    "confirm you\u2019re not a bot",
    "cookies for the authentication",
    "use --cookies",
    "sign in to confirm",
    # YouTube's other wordings when it refuses a flagged egress IP. Deliberately
    # NOT keyed on a bare "HTTP Error 403/429": a 403 from a private or removed
    # video carries the same status as a bot refusal, so the status code alone
    # cannot tell them apart and would mislabel ordinary removals as challenges.
    # These markers only match when the message says what actually happened.
    "captcha",
    "automated queries",
    "bot detection",
    "unusual traffic",
    "too many requests",
)


def is_bot_challenge(text: str | None) -> bool:
    low = (text or "").lower()
    return any(m in low for m in _BOT_CHALLENGE_MARKERS)


def _search_tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) >= 3]


def looks_relevant(query: str, title: str) -> bool:
    """Whether a fallback provider's result plausibly answers the query.

    Only used for the non-YouTube search fallbacks. Nothing compared the
    query to the returned title before, so a mismatch was played silently.
    """
    tokens = _search_tokens(query)
    if not tokens:
        return True
    in_title = set(re.findall(r"[a-z0-9]+", (title or "").lower()))
    return any(tok in in_title for tok in tokens)


def is_preview_url(url: str | None) -> bool:
    """True for SoundCloud-style preview CDNs, which serve ~30s clips.

    A preview is not the song; playing one while reporting the track title is
    the same class of lie as a fake success message.
    """
    host = (url or "").split("/")[2].lower() if (url or "").count("/") > 2 else ""
    return "preview" in host


def get_ydl_opts(use_proxy: bool = True) -> dict[str, Any]:
    """Build yt-dlp options, including cookies/proxy when configured.

    `use_proxy=False` drops only the proxy — cookies, JS runtimes, format and
    retry policy stay identical, which is what the direct-egress fallback needs
    when YouTube refuses the proxy's IP.
    """
    # NOTE: no pinned format and no pinned player_client by default.
    #
    # Both were pinned, and that was actively harmful. A selector of
    # `bestaudio[acodec!=none]` fails the whole request when every returned
    # format lacks the `acodec` field, and pinning `player_client` disables
    # yt-dlp's own multi-client fallback chain (including its PO-token
    # handling). The observed live failure was exactly that:
    #   [youtube] dQw4w9WgXcQ: Requested format is not available
    # — YouTube had answered, so this was never an IP block. Both can still be
    # overridden deliberately via env.
    opts: dict[str, Any] = {
        "format": config.YT_FORMAT or "bestaudio/best",
        "noplaylist": True,
        "default_search": "ytsearch",
        "quiet": False,
        "no_warnings": True,
        "source_address": "0.0.0.0",
        "nocheckcertificate": True,
        "socket-timeout": 20,
        "extractor_retries": 5,
        "retries": 5,
        "fragment_retries": 5,
        "buffer": 65536,
        "geo_bypass": True,
        # yt-dlp enables ONLY deno by default for JS challenge solving. The
        # production host has node (no deno), so without this the n/signature
        # challenge can never be solved and every YouTube request fails even
        # with valid cookies. Enable all runtimes in upstream priority order;
        # yt-dlp probes each and uses the highest-priority one present.
        "js_runtimes": {"deno": {}, "node": {}, "quickjs": {}, "bun": {}},
    }
    if config.YT_PLAYER_CLIENT:
        opts["extractor_args"] = {"youtube": {"player_client": [
            c.strip() for c in config.YT_PLAYER_CLIENT.split(",") if c.strip()]}}
    if use_proxy:
        proxy = config.YOUTUBE_PROXY
        if proxy:
            opts["proxy"] = proxy
    cookies = cookies_path()
    if cookies:
        opts["cookiefile"] = cookies
    return opts


# ── YouTube egress (proxy) health ─────────────────────────────────────
# A proxy only helps while YouTube still accepts its egress IP. Reachability is
# NOT that test: the configured proxy answers HTTP 200 and YouTube can still
# refuse every request through it with
#   ERROR: [youtube] <id>: Sign in to confirm you're not a bot.
# while the identical cookies + JS runtime resolve the same track directly.
# So a challenge benches the proxy for a cooldown and playback continues on
# this host's own egress instead of dying with it. Bounded by construction:
# at most one direct plan per resolve, and no flapping back to a proxy that
# just refused us. Reported through /health/music as credential-free state.
PROXY_EGRESS_NOT_CONFIGURED = "not_configured"
PROXY_EGRESS_READY = "ready"
PROXY_EGRESS_CHALLENGED = "challenged"
PROXY_EGRESS_BYPASSED = "bypassed"

PROXY_CHALLENGE_COOLDOWN = 900.0  # seconds a challenged proxy stays benched

_egress_state: dict[str, Any] = {
    "status": PROXY_EGRESS_NOT_CONFIGURED,
    "last_path": None,
    "bench_until": 0.0,
    "challenge_count": 0,
    "bypass_count": 0,
    "last_reason": None,
}


def proxy_configured() -> bool:
    return bool(config.YOUTUBE_PROXY)


def _proxy_benched() -> bool:
    return _egress_state["bench_until"] > time.time()


def record_proxy_challenged(reason: str | None = None) -> None:
    """Bench a challenged proxy and remember why (never the proxy URL).

    The reason is scrubbed on the way in: it reaches a public health endpoint,
    and a driver error can quote the proxy URL with its credentials in it.
    """
    _egress_state["status"] = PROXY_EGRESS_CHALLENGED
    _egress_state["bench_until"] = time.time() + PROXY_CHALLENGE_COOLDOWN
    _egress_state["challenge_count"] = int(_egress_state["challenge_count"]) + 1
    _egress_state["last_path"] = "proxy"
    _egress_state["last_reason"] = sanitize_for_log(reason, limit=160)


def record_egress_success(used_proxy: bool) -> None:
    if used_proxy:
        _egress_state["status"] = PROXY_EGRESS_READY
        _egress_state["last_path"] = "proxy"
        _egress_state["last_reason"] = None
        return
    _egress_state["last_path"] = "direct"
    if not proxy_configured():
        _egress_state["status"] = PROXY_EGRESS_NOT_CONFIGURED
        return
    _egress_state["bypass_count"] = int(_egress_state["bypass_count"]) + 1
    _egress_state["status"] = (
        PROXY_EGRESS_CHALLENGED if _proxy_benched() else PROXY_EGRESS_BYPASSED
    )


def _current_proxy_status() -> str:
    if not proxy_configured():
        return PROXY_EGRESS_NOT_CONFIGURED
    if _proxy_benched():
        return PROXY_EGRESS_CHALLENGED
    return str(_egress_state["status"])


def proxy_state() -> dict[str, Any]:
    """Credential-free YouTube egress state for /health/music.

    Reports configuration presence and outcome only — the proxy URL, its
    username and its password must never appear in health output or logs.
    """
    remaining = int(_egress_state["bench_until"] - time.time())
    return {
        "configured": proxy_configured(),
        "status": _current_proxy_status(),
        "in_use": proxy_configured() and not _proxy_benched(),
        "benched": _proxy_benched(),
        "bench_seconds_remaining": max(0, remaining),
        "last_egress": _egress_state["last_path"],
        "challenge_count": _egress_state["challenge_count"],
        "bypass_count": _egress_state["bypass_count"],
        # Scrubbed again on the way out: this payload is public.
        "last_reason": sanitize_for_log(_egress_state["last_reason"], limit=160),
    }


def build_strategies(
    query: str, is_url: bool, use_proxy: bool, scope: str = "all"
) -> list[tuple[str, dict[str, Any]]]:
    """yt-dlp strategies for this query, with the proxy included or omitted.

    `scope` separates YouTube strategies from the other providers so the caller
    can order them: when YouTube refuses one egress, the same query is worth
    retrying on the other egress *before* falling back to a different provider
    (which may answer with something unrelated).

    A URL must resolve to that URL: the search fallbacks would otherwise treat
    the URL itself as a search string and hand back some other provider's best
    guess at it.
    """
    base = get_ydl_opts(use_proxy=use_proxy)
    if is_url:
        return [("url", base)]
    youtube = [
        ("ytsearch", base),
        ("ytsearch1", {**base, "default_search": None}),
        ("ytsearch5", {**base, "default_search": None}),
    ]
    providers = [
        ("scsearch", {**base, "default_search": None}),
        ("bandcamp", {**base, "default_search": None}),
        ("direct", {**base, "force_generic_extractor": True}),
    ]
    if scope == "youtube":
        return youtube
    if scope == "providers":
        return providers
    return youtube + providers


FFMPEG_OPTS = {
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
    "options": "-vn",
    "executable": FFMPEG_EXE,
}


class Track:
    def __init__(self, data: dict[str, Any], requester: discord.abc.User):
        self.title: str = data.get("title", "Unknown title")
        self.uploader: str = data.get("uploader", "Unknown artist")
        self.duration: int = int(data.get("duration") or 0)
        thumb = data.get("thumbnail")
        if not thumb and data.get("thumbnails"):
            thumb = data["thumbnails"][0].get("url", "")
        self.thumbnail: str = thumb or ""
        self.url: str = data.get("url") or data.get("webpage_url", "") or ""
        self.stream_url: str = data.get("url") or data.get("webpage_url", "") or ""
        # Which provider/host actually answered. Reported so a fallback result
        # is visibly a fallback rather than being indistinguishable from the
        # primary provider's.
        self.source: str = (self.stream_url or "").split("/")[2] if self.stream_url.count("/") > 2 else ""
        self.requester = requester

    def __str__(self) -> str:
        mins, secs = divmod(self.duration, 60)
        return f"**{self.title}** — {self.uploader} `({mins}:{secs:02d})`"


# ── Audio filters (FFmpeg -af presets, allowlisted) ─────────────────────
# Only these names are accepted anywhere (engine, control endpoint, slash
# commands). Anything else is rejected server-side — the -af string is never
# built from user input, so there is no filter/option injection.
FILTERS: dict[str, str] = {
    "bassboost": "bass=g=10,dynaudnorm=f=150:g=7",
    "nightcore": "aresample=48000,asetrate=48000*1.25,aresample=48000,atempo=1.25",
    "vaporwave": "aresample=48000,asetrate=48000*0.8,aresample=48000,atempo=0.8",
    "8d": "apulsator=hz=0.125",
    "karaoke": "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1,highpass=f=120",
    "tremolo": "tremolo=f=4:d=0.7",
}

# Autoplay safety: a resolver that keeps failing must not spin forever.
AUTOPLAY_MAX_CHAIN = 50
AUTOPLAY_MAX_CONSECUTIVE_FAILURES = 3

# Per-guild music config cache (bot's own guild_config store, fed by the
# dashboard through POST /music/config). Short TTL so saves apply quickly
# without a Discord read on every hot path.
_MUSIC_CONFIG_TTL = 60.0
_music_config_cache: dict[int, tuple[float, dict]] = {}


async def get_music_config(guild_id: int) -> dict:
    """Guild music settings with defaults. Never raises — unknown guilds or
    DB outages yield defaults, and the caller always gets a usable dict."""
    now = time.monotonic()
    try:
        gid = int(guild_id)
    except (TypeError, ValueError):
        gid = 0
    hit = _music_config_cache.get(gid)
    if hit and now - hit[0] < _MUSIC_CONFIG_TTL:
        return hit[1]
    cfg: dict = {}
    try:
        import database as _db
        doc = await _db.get_guild_config(gid)
        if isinstance(doc, dict):
            raw = doc.get("music")
            if isinstance(raw, dict):
                cfg = raw
    except Exception:
        cfg = {}
    merged = {
        "djRoleId": str(cfg.get("djRoleId") or ""),
        "musicChannelId": str(cfg.get("musicChannelId") or ""),
        "voiceChannelId": str(cfg.get("voiceChannelId") or ""),
        "textChannelId": str(cfg.get("textChannelId") or ""),
        "nowPlayingChannelId": str(cfg.get("nowPlayingChannelId") or ""),
        "controlMode": cfg.get("controlMode") if cfg.get("controlMode") in (
            "everyone", "dj", "moderators") else "everyone",
        "defaultVolume": max(1, min(150, int(cfg.get("defaultVolume") or 50))),
        "maxVolume": max(10, min(150, int(cfg.get("maxVolume") or 150))),
        "defaultLoop": str(cfg.get("defaultLoop") or "off"),
        "filters": [f for f in (cfg.get("filters") or []) if f in FILTERS][:3],
        "twentyFourSeven": bool(cfg.get("twentyFourSeven", False)),
        "autoPlay": bool(cfg.get("autoPlay", False)),
        "autoLeave": bool(cfg.get("autoLeave", False)),
        "enableNowPlaying": bool(cfg.get("enableNowPlaying", True)),
    }
    if merged["defaultLoop"] not in ("off", "track", "queue"):
        merged["defaultLoop"] = "off"
    _music_config_cache[gid] = (now, merged)
    return merged


def invalidate_music_config(guild_id: int | None = None) -> None:
    """Drop cached guild music config (called on config push + prefix refresh)."""
    try:
        if guild_id is None:
            _music_config_cache.clear()
        else:
            _music_config_cache.pop(int(guild_id), None)
    except (TypeError, ValueError):
        _music_config_cache.clear()


def clamp_volume(level: int, server_max: int = 150) -> int:
    """Volume bounds enforced in one place: 1..server_max, never above 150
    (unsafe amplification that can damage the audio pipeline is refused)."""
    try:
        cap = max(10, min(150, int(server_max)))
    except (TypeError, ValueError):
        cap = 150
    try:
        return max(1, min(cap, int(level)))
    except (TypeError, ValueError):
        return 50


# Actions any member may use even under DJ restrictions (discovery + queueing).
DJ_OPEN_ACTIONS = frozenset({"play", "search", "queue_add"})


def dj_allowed(member, guild, cfg: dict, action: str) -> tuple[bool, str]:
    """Single DJ-policy source of truth for slash, prefix, button AND
    dashboard-driven controls. Returns (allowed, reason). Never raises —
    undeterminable identity denies restricted actions, never grants them.

    controlMode: everyone → all pass; moderators → moderation perms pass;
    dj → DJ-role holders pass. Guild owner + Manage Server always pass
    (admin override)."""
    try:
        if action in DJ_OPEN_ACTIONS:
            return True, ""
        mode = cfg.get("controlMode", "everyone")
        if mode == "everyone":
            return True, ""
        if member is None or guild is None:
            return False, "Could not verify your server permissions."
        if getattr(member, "id", None) == getattr(guild, "owner_id", None):
            return True, ""
        perms = getattr(member, "guild_permissions", None)
        is_manager = bool(perms and (getattr(perms, "manage_guild", False)
                                     or getattr(perms, "administrator", False)))
        if is_manager:
            return True, ""
        if mode == "moderators":
            mod_perms = bool(perms and (getattr(perms, "moderate_members", False)
                                        or getattr(perms, "kick_members", False)
                                        or getattr(perms, "ban_members", False)))
            if mod_perms:
                return True, ""
            return False, "This server restricts music controls to moderators."
        if mode == "dj":
            dj_role_id = str(cfg.get("djRoleId") or "")
            role_ids = {str(getattr(r, "id", "")) for r in (getattr(member, "roles", []) or [])}
            if dj_role_id and dj_role_id in role_ids:
                return True, ""
            return False, "This server restricts music controls to the DJ role."
        return True, ""
    except Exception:
        return False, "Could not verify your server permissions."


class GuildPlayer:
    # Bounded voice reconnects: discord.py owns gateway reconnects, but a
    # dropped VOICE socket needs an explicit, limited rejoin — never a loop.
    MAX_VOICE_RECONNECTS = 3

    def __init__(self, guild_id: int):
        self.guild_id = guild_id
        self.queue: deque[Track] = deque()
        self.history: deque[Track] = deque(maxlen=50)
        self.current: Optional[Track] = None
        self.playing: bool = False
        self.loop: bool = False
        self.queue_loop: bool = False
        self.autoplay: bool = False
        self.volume: float = 0.5
        self.voice: Optional[discord.VoiceClient] = None
        self.now_playing_message: Optional[discord.Message] = None
        self._play_started: float = 0.0
        self._play_offset: float = 0.0
        self._paused_at: Optional[float] = None
        self._paused_elapsed: float = 0.0
        # ── Connection-recovery bookkeeping (surfaced in diagnostics) ──
        self.voice_channel_id: Optional[int] = None
        self.voice_channel_name: Optional[str] = None
        self.connection_state: str = "disconnected"  # disconnected|connecting|connected|reconnecting|failed
        self.reconnect_attempts: int = 0
        self.last_successful_connection: Optional[str] = None
        self.last_error: Optional[str] = None
        self.last_error_code: Optional[str] = None
        self.player_state: str = "idle"  # idle|buffering|playing|paused|reconnecting|error
        # ── Playback modifiers (runtime state; persisted config lives in
        # guild_config.music and is mirrored here when applied) ──
        self.filters: list[str] = []
        self.stay_connected: bool = False  # 24/7 mode: hold the VC + rejoin
        self.text_channel_id: Optional[int] = None
        self._volume_touched: bool = False
        self.autoplay_chain: int = 0
        self.autoplay_failures: int = 0

    def mark_paused(self) -> None:
        if self._paused_at is None and self._play_started:
            self._paused_at = time.monotonic()

    def mark_resumed(self) -> None:
        if self._paused_at is not None:
            self._paused_elapsed += time.monotonic() - self._paused_at
            self._paused_at = None

    def position(self) -> float:
        if not self.current or not self._play_started:
            return 0.0
        elapsed = self._paused_elapsed
        if self._paused_at is not None:
            elapsed += time.monotonic() - self._paused_at
        else:
            elapsed += time.monotonic() - self._play_started
        dur = float(self.current.duration) if self.current.duration else 0.0
        if dur > 0:
            elapsed = min(elapsed, dur)
        return max(0.0, elapsed)

    def enqueue(self, track: Track) -> int | str:
        for t in self.queue:
            if t.url and t.url == track.url:
                return "duplicate"
        self.queue.append(track)
        # Human-queued tracks reset the autoplay safety counters.
        self.autoplay_chain = 0
        self.autoplay_failures = 0
        return len(self.queue)

    def pop_next(self) -> Optional[Track]:
        if self.loop and self.current:
            return self.current
        if self.queue:
            if self.current:
                self.history.append(self.current)
            nxt = self.queue.popleft()
            if self.queue_loop and not self.queue and self.current:
                self.queue.append(self.current)
            return nxt
        if self.queue_loop and self.current:
            return self.current
        return None

    def move(self, from_pos: int, to_pos: int) -> bool:
        """Reorder the queue (1-based positions, current track untouched).
        Returns False for out-of-range positions. The mutation happens here,
        in the player — callers never reorder a copy."""
        n = len(self.queue)
        if from_pos < 1 or from_pos > n or to_pos < 1 or to_pos > n:
            return False
        if from_pos == to_pos:
            return True
        items = list(self.queue)
        track = items.pop(from_pos - 1)
        items.insert(to_pos - 1, track)
        self.queue.clear()
        self.queue.extend(items)
        return True

    def play_next(self, track: Track) -> int:
        """Insert a track at the front of the queue (plays next)."""
        if track is not None and getattr(track, "title", None):
            self.queue.appendleft(track)
        return len(self.queue)

    def previous(self) -> Optional[Track]:
        if self.current:
            self.queue.appendleft(self.current)
        if self.history:
            prev = self.history.pop()
            return prev
        return None

    def clear(self) -> None:
        try:
            self.queue.clear()
        except Exception:
            from collections import deque as _dq
            self.queue = _dq()
        self.current = None
        self.player_state = "idle"

    def is_connected(self) -> bool:
        try:
            return self.voice is not None and self.voice.is_connected()
        except Exception:
            return False

    def note_connected(self, channel=None) -> None:
        from datetime import datetime, timezone
        self.connection_state = "connected"
        self.reconnect_attempts = 0
        self.last_successful_connection = datetime.now(timezone.utc).isoformat()
        if channel is not None:
            try:
                self.voice_channel_id = getattr(channel, "id", None)
                self.voice_channel_name = getattr(channel, "name", None)
            except Exception:
                pass

    def note_disconnected(self, reason: str = "") -> None:
        if self.connection_state == "connected":
            self.connection_state = "disconnected"
        if reason:
            self.last_error = sanitize_for_log(reason, limit=300)

    def note_reconnecting(self) -> bool:
        """Enter reconnecting state; False when the retry budget is spent."""
        if self.reconnect_attempts >= self.MAX_VOICE_RECONNECTS:
            self.connection_state = "failed"
            return False
        self.reconnect_attempts += 1
        self.connection_state = "reconnecting"
        self.player_state = "reconnecting"
        return True

    def validate_queue(self) -> str | None:
        """Repair a corrupted queue in place. Returns None when healthy,
        otherwise a description of what was fixed (logged, never fatal)."""
        try:
            if not isinstance(self.queue, deque):
                items = list(self.queue) if hasattr(self.queue, "__iter__") else []
                self.queue = deque(t for t in items if t is not None)
                return "queue container rebuilt"
            before = len(self.queue)
            self.queue = deque(t for t in self.queue
                               if t is not None and getattr(t, "title", None))
            if len(self.queue) != before:
                return f"removed {before - len(self.queue)} invalid entries"
            return None
        except Exception as exc:
            from collections import deque as _dq
            self.queue = _dq()
            self.current = None
            self.player_state = "idle"
            return f"queue reset after corruption: {type(exc).__name__}"


# ── Search cache + in-flight deduplication ─────────────────────────────
# Repeated and concurrent identical searches share one provider request.
# Keys are normalized (case/whitespace) so "  Hello " hits "hello", but
# distinct queries ("hello" vs "hello world") never merge. Bounded size.
_SEARCH_CACHE_TTL = 60.0
_SEARCH_CACHE_MAX = 50
_search_cache: dict[str, tuple[float, list[dict]]] = {}
_search_inflight: dict[str, "asyncio.Future[list[dict]]"] = {}


def normalize_search_query(query: str | None) -> str:
    """Canonical cache key: lowercase, collapsed whitespace, trimmed."""
    q = re.sub(r"\s+", " ", (query or "")).strip().lower()[:200]
    return q if len(q) >= 2 else ""


def _search_cache_get(key: str) -> list[dict] | None:
    hit = _search_cache.get(key)
    if hit is None:
        return None
    at, rows = hit
    if time.monotonic() - at > _SEARCH_CACHE_TTL:
        _search_cache.pop(key, None)
        return None
    return rows


def _search_cache_put(key: str, rows: list[dict]) -> None:
    while len(_search_cache) >= _SEARCH_CACHE_MAX:
        oldest = min(_search_cache, key=lambda k: _search_cache[k][0])
        _search_cache.pop(oldest, None)
    _search_cache[key] = (time.monotonic(), [dict(r) for r in rows])


class MusicEngine:
    def __init__(self):
        from collections import deque as _dq
        self._players: dict[int, GuildPlayer] = {}
        self.bot_loop: Optional[asyncio.AbstractEventLoop] = None
        # Optional async callable invoked after a track starts via natural
        # advancement (queue/autoplay/re-resolve). The cog sets this to
        # refresh the Discord now-playing message. Invoked best-effort: a
        # failing handler must never break playback.
        self.track_started_handler = None
        self._last_resolve_error: Optional[str] = None
        self._last_error_kind: Optional[str] = None
        # Whether YouTube challenged this host during the LAST resolve. Kept
        # separate from error_kind so a fallback success is not reported as a
        # failure -- the primary provider was still refused.
        self._youtube_challenged: bool = False
        self._ydlp_version: str = "unknown"
        # Ring buffer of staged playback diagnostics (newest last, max 50).
        # Powers the dashboard's "what failed, why, what to fix" view.
        self._playback_log: _dq = _dq(maxlen=50)

    def get_player(self, guild_id: int) -> GuildPlayer:
        if guild_id not in self._players:
            self._players[guild_id] = GuildPlayer(guild_id)
        return self._players[guild_id]

    async def _emit_track_started(self, player: GuildPlayer) -> None:
        """Notify the track-started hook (now-playing refresh). A deleted
        message, missing channel or missing permissions inside the handler
        is the handler's problem to swallow — playback continues regardless."""
        handler = self.track_started_handler
        if handler is None:
            return
        try:
            result = handler(player)
            if asyncio.iscoroutine(result):
                await result
        except Exception:
            log.debug("track_started_handler failed (non-fatal)")

    def remove_player(self, guild_id: int) -> None:
        self._players.pop(guild_id, None)

    async def resolve(self, query: str) -> Optional[Track]:
        """Resolve a search query or URL to a Track via yt-dlp.
        Tries multiple strategies before giving up."""
        self._last_resolve_error = None
        if self._ydlp_version == "unknown":
            try:
                import yt_dlp as _yt
                self._ydlp_version = _yt.version.__version__
            except Exception:
                pass
        self._last_error_kind = None
        self._youtube_challenged = False
        last_exc: Optional[Exception] = None
        # A URL must resolve to that URL. The search fallbacks would otherwise
        # treat the URL itself as a search string and hand back some other
        # provider's best guess at it.
        is_url = bool(re.match(r"^https?://", query.strip(), re.I))
        # Tagged egress plan: try the configured proxy first (unless it is
        # benched for a previous challenge), then this host's own egress at most
        # once. Each entry is (strategy name, yt-dlp opts, uses proxy).
        try_proxy = bool(config.YOUTUBE_PROXY) and not _proxy_benched()
        plans: list[tuple[str, dict[str, Any], bool]] = [
            (*strategy, try_proxy)
            for strategy in build_strategies(query, is_url, try_proxy, "youtube")
        ]
        if try_proxy:
            # Same query, this host's own egress, tried immediately: it is the
            # same track, just a different IP, so it beats a different provider.
            plans.extend(
                (*strategy, False)
                for strategy in build_strategies(query, is_url, False, "youtube")
            )
        # Other providers last: they do not hit YouTube, so the challenge does
        # not apply to them and they keep the pre-existing behaviour of being a
        # fallback rather than the first answer.
        plans.extend(
            (*strategy, try_proxy)
            for strategy in build_strategies(query, is_url, try_proxy, "providers")
        )
        youtube_challenged = False
        challenged_egress: set[bool] = set()
        for strategy_name, strategy_opts, strategy_uses_proxy in plans:
            if strategy_uses_proxy in challenged_egress and strategy_name.startswith("ytsearch"):
                # The challenge is a property of the egress IP, so the sibling
                # YouTube strategies on that same egress are refused
                # identically. Not retrying them is the difference between ~10s
                # and ~80s.
                log.info(
                    "skipping %s: YouTube already challenged the %s egress",
                    strategy_name, "proxy" if strategy_uses_proxy else "host")
                continue
            search_query = query
            if strategy_name == "ytsearch1":
                search_query = f"ytsearch1:{query}"
            elif strategy_name == "ytsearch5":
                search_query = f"ytsearch5:{query}"
            elif strategy_name == "scsearch":
                search_query = f"scsearch:{query}"
            elif strategy_name == "bandcamp":
                search_query = f"bandcamp:{query}"
            for attempt in range(2):
                try:
                    loop = asyncio.get_running_loop()
                    with yt_dlp.YoutubeDL(strategy_opts) as ydl:
                        data = await loop.run_in_executor(
                            None, lambda q=search_query: ydl.extract_info(q, download=False))
                    if data is None:
                        last_exc = ValueError(f"[{strategy_name}] yt-dlp returned None")
                        continue
                    if "entries" in data:
                        entries = [e for e in data["entries"] if e]
                        if not entries:
                            last_exc = ValueError(f"[{strategy_name}] No entries found")
                            continue
                        data = entries[0]
                    if not data.get("url") and not data.get("webpage_url"):
                        last_exc = ValueError(f"[{strategy_name}] No URL in result")
                        continue
                    if not data.get("url"):
                        data = await self._refresh_stream_url(
                            data, use_proxy=strategy_uses_proxy)
                    track = Track(data, requester=None)
                    if strategy_name in ("scsearch", "bandcamp"):
                        # Fallback providers may answer with something else
                        # entirely, or with a short preview clip.
                        if is_preview_url(track.stream_url):
                            last_exc = ValueError(
                                f"[{strategy_name}] only a preview clip is available")
                            if self._last_error_kind is None:
                                self._last_error_kind = "preview_only"
                            log.warning("rejecting preview clip from %s for %r", strategy_name, query[:80])
                            continue
                        if not looks_relevant(query, track.title):
                            last_exc = ValueError(
                                f"[{strategy_name}] result does not match the query: {track.title[:60]!r}")
                            # First cause wins: a provider refusal is the root
                            # cause, and a rejected fallback result is only a
                            # symptom of it. Later strategies must not bury it.
                            if self._last_error_kind is None:
                                self._last_error_kind = "fallback_mismatch"
                            log.warning("rejecting mismatched %s result %r for %r",
                                        strategy_name, track.title[:60], query[:80])
                            continue
                    log.info("resolve ok via %s: %s (attempt %d)", strategy_name, track.title[:60], attempt + 1)
                    record_egress_success(strategy_uses_proxy)
                    self._last_resolve_error = None
                    # Succeeded: there is no failure to describe, whatever the
                    # primary provider did on the way here.
                    self._last_error_kind = None
                    return track
                except Exception as exc:
                    last_exc = exc
                    raw_message = str(exc)[:500]
                    # Challenge detection runs on the RAW text (the advisory
                    # mentions --cookies, which sanitization would redact);
                    # only the STORED copy is scrubbed so user-facing surfaces
                    # and diagnostics can never leak credentials or long URLs.
                    message = sanitize_for_log(raw_message, limit=500) or ""
                    self._last_resolve_error = message
                    if is_bot_challenge(raw_message):
                        youtube_challenged = True
                        self._youtube_challenged = True
                        self._last_error_kind = "youtube_bot_challenge"
                        challenged_egress.add(strategy_uses_proxy)
                        if strategy_uses_proxy:
                            # Reachability was never the question: bench the proxy
                            # and let the direct plan below answer instead of
                            # failing playback with it.
                            record_proxy_challenged(message)
                            has_direct_plan = any(
                                not uses_proxy for _, _, uses_proxy in plans)
                            log.warning(
                                "YouTube bot-challenge on %s for %r via the configured "
                                "proxy — %s",
                                strategy_name, query[:80],
                                "retrying on this host's own egress (cookies still apply)"
                                if has_direct_plan else
                                "set YT_COOKIES or replace the proxy; retrying cannot help")
                        else:
                            log.warning(
                                "YouTube bot-challenge on %s for %r on this host's egress — "
                                "set YT_COOKIES (or a proxy whose IP YouTube accepts) to "
                                "authenticate; retrying cannot help",
                                strategy_name, query[:80])
                        break
                    log.warning("yt-dlp %s attempt %d failed for %r: %s", strategy_name, attempt + 1, query[:100], exc)
                    if attempt < 1:
                        await asyncio.sleep(1)
        log.error("yt-dlp failed after all strategies for %r: %s", query[:100], last_exc)
        return None

    def get_resolve_error(self) -> Optional[str]:
        return self._last_resolve_error

    def get_error_kind(self) -> Optional[str]:
        """Machine-readable reason for the last failed resolve, or None."""
        return self._last_error_kind

    def youtube_challenged(self) -> bool:
        """Whether YouTube refused this host during the last resolve.

        True even when a fallback provider served the request, which is the
        signal that cookies or a proxy are still needed for the primary source.
        """
        return self._youtube_challenged

    # ── Playback diagnostics ──────────────────────────────────────────
    def record_playback_attempt(self, diag: dict) -> None:
        try:
            self._playback_log.append(diag)
        except Exception:
            pass

    def get_playback_log(self, limit: int = 20) -> list[dict]:
        try:
            items = list(self._playback_log)[-max(1, min(limit, 50)):]
            return list(reversed(items))
        except Exception:
            return []

    def get_last_playback_diagnostic(self) -> dict | None:
        try:
            return self._playback_log[-1] if self._playback_log else None
        except Exception:
            return None

    def build_diagnostic(self, *, requested_title: str = "", track=None,
                         player=None, voice_channel=None, perms: dict | None = None,
                         ffmpeg: dict | None = None, stage: str = "",
                         ok: bool = False, code: str | None = None,
                         error_type: str | None = None,
                         error_message: str | None = None,
                         ffmpeg_exit: int | None = None,
                         voice_status: str | None = None) -> dict:
        from datetime import datetime, timezone
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "requested_title": (requested_title or "")[:200],
            "resolved_title": (getattr(track, "title", "") or "")[:200],
            "source_provider": (getattr(track, "source", "") or "")[:120],
            "audio_url_present": bool(getattr(track, "stream_url", "") or getattr(track, "url", "")),
            "audio_url_host": ((getattr(track, "stream_url", "") or "").split("/")[2]
                               if (getattr(track, "stream_url", "") or "").count("/") > 2 else ""),
            "ffmpeg": ffmpeg or ffmpeg_check(),
            "ffmpeg_exit_code": ffmpeg_exit,
            "voice_connection": voice_status or (player.connection_state if player else "unknown"),
            "discord_voice_connected": bool(player and player.is_connected()),
            "channel_id": str(getattr(voice_channel, "id", "") or getattr(player, "voice_channel_id", "") or ""),
            "channel_name": getattr(voice_channel, "name", None) or getattr(player, "voice_channel_name", None),
            "bot_permissions": perms,
            "player_state": getattr(player, "player_state", None),
            "queue_length": len(getattr(player, "queue", []) or []) if player else 0,
            "has_current": bool(getattr(player, "current", None)),
            "stage": stage,
            "ok": ok,
            "error_code": code,
            "error_type": error_type,
            "error_message": sanitize_for_log(error_message, limit=500),
        }

    def diagnostics_snapshot(self) -> dict:
        """Aggregate audio-service / ffmpeg / voice / player health for the dashboard."""
        ff = ffmpeg_check()
        if ff["probed_ok"] is True:
            audio_status: str = "working" if not self._youtube_challenged else "degraded"
        elif ff["probed_ok"] is False:
            audio_status = "unavailable"
        else:
            audio_status = "degraded"
        last = self.get_last_playback_diagnostic()
        return {
            "audio_service": {
                "status": audio_status,
                "detail": ("YouTube challenged this host; fallback or cookies/proxy needed"
                           if self._youtube_challenged else
                           ("FFmpeg missing — playback cannot start" if ff["probed_ok"] is False
                            else "provider resolve path operational")),
                "youtube_challenged": self._youtube_challenged,
                "last_error_kind": self._last_error_kind,
                "last_resolve_error": sanitize_for_log(self._last_resolve_error, limit=300),
                "ydlp_version": self._ydlp_version,
                "cookies_configured": bool(cookies_path()),
                "js_runtimes": js_runtimes(),
            },
            "ffmpeg": {
                "status": ff["status"],
                "exe": ff["exe"],
                "version": ff["version"],
                "exists": ff["exists"],
                "executable": ff["executable"],
                "error": ff["error"],
            },
            "opus": opus_status(),
            "players": {
                str(gid): {
                    "connection": p.connection_state,
                    "player": p.player_state,
                    "connected": p.is_connected(),
                    "channel": p.voice_channel_name,
                    "channel_id": p.voice_channel_id,
                    "reconnect_attempts": p.reconnect_attempts,
                    "last_success": p.last_successful_connection,
                    "current": p.current.title[:120] if p.current else None,
                    "queue": len(p.queue),
                    "last_error_code": p.last_error_code,
                    "last_error": sanitize_for_log(p.last_error, limit=300),
                } for gid, p in self._players.items()
            },
            "last_playback": last,
        }

    # ── Egress preflight (shared by the CLI script and /music/preflight) ──
    # Resolves one stable track through every egress path this host can use,
    # so the dashboard can test direct/proxy/engine without shell access.
    # States: PASS | CHALLENGED | FAILED | NOT RUN | TIMEOUT. The payload is
    # credential-free by construction: booleans, titles and scrubbed error
    # class names only — never the proxy URL, cookies or cookie paths.
    PREFLIGHT_TRACK = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
    PREFLIGHT_PATH_TIMEOUT = 60.0

    def _classify_extract_error(self, exc: BaseException) -> tuple[str, str]:
        text = str(exc)
        if is_bot_challenge(text):
            return "CHALLENGED", "YouTube refused this egress (bot check)"
        safe = sanitize_for_log(f"{type(exc).__name__}: {text}", limit=160) or "failed"
        return "FAILED", safe

    async def _extract_once(self, query: str, use_proxy: bool) -> tuple[str, str]:
        """One blocking yt-dlp extraction in a worker thread (never the loop)."""
        import yt_dlp
        opts = get_ydl_opts(use_proxy=use_proxy)
        opts.update({"quiet": True, "no_warnings": True, "skip_download": True})
        loop = asyncio.get_running_loop()

        def _run():
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(query, download=False)

        try:
            info = await asyncio.wait_for(
                loop.run_in_executor(None, _run),
                timeout=self.PREFLIGHT_PATH_TIMEOUT)
        except asyncio.TimeoutError:
            return "TIMEOUT", f"no result in {int(self.PREFLIGHT_PATH_TIMEOUT)}s"
        except Exception as exc:
            return self._classify_extract_error(exc)
        if not info:
            return "FAILED", "yt-dlp returned no info"
        title = str(info.get("title") or "")[:60]
        return "PASS", f"{title} ({info.get('ext')}, acodec={info.get('acodec')})"

    async def preflight(self, query: str | None = None) -> dict[str, Any]:
        """Resolve one track on every egress path. Shared core: the CLI
        script and the /music/preflight endpoint both call this, so shell
        and dashboard can never disagree about what was tested."""
        track_query = (query or "").strip() or self.PREFLIGHT_TRACK
        paths: dict[str, dict[str, str]] = {}
        paths["direct"] = dict(zip(
            ("state", "note"),
            await self._extract_once(track_query, use_proxy=False)))
        if proxy_configured():
            paths["proxy"] = dict(zip(
                ("state", "note"),
                await self._extract_once(track_query, use_proxy=True)))
        else:
            paths["proxy"] = {"state": "NOT RUN",
                              "note": "YOUTUBE_PROXY is not configured"}
        try:
            track = await asyncio.wait_for(
                self.resolve(track_query), timeout=2 * self.PREFLIGHT_PATH_TIMEOUT)
        except asyncio.TimeoutError:
            paths["engine"] = {"state": "TIMEOUT", "note": "resolver timed out"}
            track = None
        except Exception as exc:
            paths["engine"] = {"state": "FAILED",
                               "note": sanitize_for_log(
                                   f"{type(exc).__name__}: {exc}", limit=160) or "failed"}
            track = None
        else:
            if track is None:
                kind = self.get_error_kind()
                paths["engine"] = {
                    "state": "FAILED",
                    "note": f"classified {kind!r}; egress={proxy_state()['last_egress']}"}
            else:
                paths["engine"] = {
                    "state": "PASS",
                    "note": f"{track.title[:50]} | egress={proxy_state()['last_egress']}"}
        direct_ok = paths["direct"]["state"] == "PASS"
        return {
            "ok": direct_ok,
            "track": track_query,
            "paths": paths,
            "proxy_configured": proxy_configured(),
            "cookies_configured": bool(cookies_path()),
        }

    async def search_top(self, query: str, limit: int = 5, timeout: float = 30) -> list[dict]:
        """Metadata-only search (no audio extraction per row): title,
        uploader, duration, thumbnail and page URL for the top results.

        Fast by construction, not by luck:
        - search-specific yt-dlp opts: tight retries/timeouts (the playback
          retry policy would multiply a slow provider by 5x here),
        - short-lived cache on the normalized query (60s),
        - in-flight deduplication: concurrent identical searches share one
          provider request instead of stampeding YouTube,
        - proxy then direct egress, each bounded, so a challenged path fails
          fast instead of hanging the interaction.
        Full audio extraction happens ONLY when the user plays a result
        (resolve()), never during search."""
        import yt_dlp
        key = normalize_search_query(query)
        if not key:
            return []
        limit = max(1, min(limit, 10))
        t_start = time.monotonic()
        cached = _search_cache_get(key)
        if cached is not None:
            log.debug("search cache hit %r in %.0fms", key[:60],
                      (time.monotonic() - t_start) * 1000)
            return [dict(r) for r in cached[:limit]]
        loop = asyncio.get_running_loop()
        existing = _search_inflight.get(key)
        if existing is not None:
            try:
                results = await asyncio.wait_for(
                    asyncio.shield(existing), timeout=timeout)
                log.debug("search dedup hit %r in %.0fms", key[:60],
                          (time.monotonic() - t_start) * 1000)
                return [dict(r) for r in results[:limit]]
            except Exception:
                pass
        future: asyncio.Future = loop.create_future()
        _search_inflight[key] = future
        try:
            results = await self._search_fetch(key, limit, timeout)
            if not future.done():
                future.set_result(results)
            _search_cache_put(key, results)
            return [dict(r) for r in results[:limit]]
        except Exception as exc:
            if not future.done():
                future.set_exception(exc)
            raise
        finally:
            _search_inflight.pop(key, None)
            elapsed_ms = (time.monotonic() - t_start) * 1000
            log.info("search_total_ms=%.0f query=%r", elapsed_ms, key[:60])

    async def _search_fetch(self, key: str, limit: int, timeout: float) -> list[dict]:
        """One uncached provider search: proxy egress, then direct egress."""
        import yt_dlp

        def light_opts(use_proxy: bool) -> dict:
            opts = get_ydl_opts(use_proxy=use_proxy)
            # Search must fail fast: the playback retry policy (retries 5,
            # 20s sockets) would turn one slow provider into minutes here.
            opts.update({"quiet": True, "no_warnings": True, "skip_download": True,
                         "extract_flat": "in_playlist", "playlistend": limit,
                         "default_search": "ytsearch",
                         "retries": 1, "extractor_retries": 2, "fragment_retries": 1,
                         "socket-timeout": 12})
            return opts

        async def attempt(use_proxy: bool, budget: float) -> list[dict] | None:
            loop = asyncio.get_running_loop()
            t0 = time.monotonic()

            def _run():
                with yt_dlp.YoutubeDL(light_opts(use_proxy)) as ydl:
                    return ydl.extract_info(f"ytsearch{limit}:{key}", download=False)

            try:
                data = await asyncio.wait_for(loop.run_in_executor(None, _run), timeout=budget)
            except asyncio.TimeoutError:
                log.info("search provider_request TIMEOUT egress=%s query=%r",
                         "proxy" if use_proxy else "direct", key[:60])
                return None
            except Exception as exc:
                if is_bot_challenge(str(exc)):
                    log.info("search provider_request CHALLENGED egress=%s query=%r",
                             "proxy" if use_proxy else "direct", key[:60])
                    return None
                raise
            finally:
                log.debug("search provider_request_ms=%.0f egress=%s",
                          (time.monotonic() - t0) * 1000,
                          "proxy" if use_proxy else "direct")
            t1 = time.monotonic()
            out = []
            for e in ((data or {}).get("entries") or [])[:limit]:
                if not e:
                    continue
                vid = str(e.get("id") or "")
                url = str(e.get("url") or e.get("webpage_url") or "")
                if vid and not url.startswith("http"):
                    url = f"https://www.youtube.com/watch?v={vid}"
                if not url:
                    continue
                out.append({
                    "title": str(e.get("title") or "Unknown title")[:120],
                    "uploader": str(e.get("uploader") or e.get("channel") or "")[:80],
                    "duration": int(e.get("duration") or 0),
                    "thumbnail": str(e.get("thumbnail") or "")[:300],
                    "url": url[:300],
                })
            log.debug("search result_parse_ms=%.0f rows=%d",
                      (time.monotonic() - t1) * 1000, len(out))
            return out

        per_attempt = max(8.0, timeout / 2)
        for use_proxy in (True, False):
            if use_proxy and not proxy_configured():
                continue
            rows = await attempt(use_proxy, per_attempt)
            if rows:
                return rows
        return []

    async def play_now(self, player: GuildPlayer, track: Track,
                       voice_channel: discord.VoiceChannel, announce=None,
                       seek_to: float = 0.0,
                       requested_title: str = "") -> None:
        """Full staged playback pipeline. Raises PlaybackError (classified).

        Stages: queue-validate → metadata → audio-source → ffmpeg-precheck →
        voice-permissions → voice-connect → ffmpeg-start → discord-send →
        player-update. Each stage logs its own technical reason; the caller
        maps PlaybackError.code to the user-friendly message.
        """
        from datetime import datetime, timezone
        req_title = requested_title or getattr(track, "title", "") or ""
        perms: dict | None = None
        ff = ffmpeg_check()
        diag_base = dict(requested_title=req_title)

        def _fail(code: str, stage: str, detail: str, *,
                  error_type: str | None = None, voice_status: str | None = None,
                  ffmpeg_exit: int | None = None) -> PlaybackError:
            safe = sanitize_for_log(detail, limit=500) or ""
            diag = self.build_diagnostic(
                requested_title=req_title, track=track, player=player,
                voice_channel=voice_channel, perms=perms, ffmpeg=ff,
                stage=stage, ok=False, code=code,
                error_type=error_type or code, error_message=safe,
                ffmpeg_exit=ffmpeg_exit,
                voice_status=voice_status or player.connection_state)
            self.record_playback_attempt(diag)
            player.last_error = safe[:300]
            player.last_error_code = code
            player.player_state = "error"
            log.warning("playback FAIL stage=%s code=%s guild=%s track=%r detail=%s",
                        stage, code, player.guild_id,
                        (getattr(track, "title", "") or "")[:80], safe[:300])
            return PlaybackError(code, stage, safe, diag)

        # Stage 1: queue integrity — a corrupt queue must never kill playback.
        # First play per player lifetime also absorbs persisted guild defaults
        # (24/7 hold, default loop/autoplay, server volume are config, not
        # code). Runtime toggles afterwards always win.
        if not getattr(player, "_config_applied", False):
            try:
                defaults = await get_music_config(player.guild_id)
                player.stay_connected = bool(defaults["twentyFourSeven"])
                if defaults["defaultLoop"] == "track":
                    player.loop, player.queue_loop = True, False
                elif defaults["defaultLoop"] == "queue":
                    player.loop, player.queue_loop = False, True
                if defaults["autoPlay"]:
                    player.autoplay = True
                player._config_applied = True
            except Exception:
                pass
        try:
            repaired = player.validate_queue()
            if repaired:
                log.warning("playback queue repaired guild=%s: %s", player.guild_id, repaired)
        except Exception as exc:
            raise _fail(QUEUE_CORRUPTED, "queue-validate",
                        f"queue unusable: {type(exc).__name__}: {exc}") from exc
        if track is None or not getattr(track, "title", None):
            raise _fail(QUEUE_CORRUPTED, "queue-validate", "current track missing")

        # Stage 2: song metadata resolved?
        if not getattr(track, "title", ""):
            raise _fail(AUDIO_SOURCE_FAILED, "metadata",
                        "song metadata missing title")

        # Stage 3: audio source resolved?
        stream_url = (getattr(track, "stream_url", "") or getattr(track, "url", "") or "")
        if not stream_url:
            raise _fail(AUDIO_SOURCE_FAILED, "audio-source",
                        "resolved track has no audio/stream URL")
        if is_preview_url(stream_url):
            raise _fail(AUDIO_SOURCE_FAILED, "audio-source",
                        "only a preview clip is available for this track")

        # Stage 4: FFmpeg precheck — fail fast with the real cause.
        # A missing binary is FFMPEG_MISSING (install it); a present binary
        # that fails to run is FFMPEG_FAILED (broken install). Different fixes.
        if ff["probed_ok"] is False:
            missing = ff["status"] == "missing" or "not found" in (ff["error"] or "").lower()
            raise _fail(FFMPEG_MISSING if missing else FFMPEG_FAILED, "ffmpeg-precheck",
                        f"ffmpeg unavailable: {ff['error'] or ff['exe']}",
                        error_type="FileNotFoundError" if missing else "FFmpegNotFound")
        if not ff["exists"]:
            raise _fail(FFMPEG_MISSING, "ffmpeg-precheck",
                        f"ffmpeg binary not found: {ff['exe']}")

        # Stage 5: voice channel detection + automatic permission check.
        if voice_channel is None:
            raise _fail(MISSING_PERMISSION, "voice-detect",
                        "no voice channel: user is not in a voice channel")
        try:
            guild = getattr(voice_channel, "guild", None)
            me = getattr(guild, "me", None)
            perms = check_voice_permissions(voice_channel, me)
        except Exception as exc:
            raise _fail(MISSING_PERMISSION, "voice-permissions",
                        f"permission check failed: {type(exc).__name__}: {exc}") from exc
        if not perms.get("all_granted"):
            missing = ", ".join(perms.get("missing") or ["unknown"])
            raise _fail(MISSING_PERMISSION, "voice-permissions",
                        f"bot missing voice permissions: {missing}",
                        error_type="MissingPermission")

        # Stage 6: stop any current audio, then (re)connect voice.
        try:
            if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
                player.playing = False
                player.voice.stop()
                await asyncio.sleep(0)
        except Exception as exc:
            log.debug("stop-before-play failed (non-fatal): %s", str(exc)[:120])

        if not player.is_connected():
            player.connection_state = "connecting"
            player.player_state = "buffering"
            existing = getattr(voice_channel.guild, "voice_client", None)
            if existing is not None:
                try:
                    if existing.is_connected():
                        player.voice = existing
                        if existing.channel and existing.channel.id != voice_channel.id:
                            try:
                                await existing.move_to(voice_channel)
                            except Exception as exc:
                                log.warning("Could not move to %s — staying in %s: %s",
                                            voice_channel.id,
                                            getattr(existing.channel, "id", "?"),
                                            str(exc)[:150])
                        player.note_connected(player.voice.channel or voice_channel)
                    else:
                        player.voice = None
                except Exception as exc:
                    raise _fail(VOICE_CONNECTION_FAILED, "voice-connect",
                                f"stale voice handle: {type(exc).__name__}: {exc}",
                                error_type=type(exc).__name__) from exc
            if not player.is_connected():
                try:
                    player.voice = await asyncio.wait_for(
                        voice_channel.connect(self_deaf=True, timeout=20), timeout=25)
                    player.note_connected(voice_channel)
                except asyncio.TimeoutError as exc:
                    player.voice = None
                    player.connection_state = "failed"
                    raise _fail(PLAYBACK_TIMEOUT, "voice-connect",
                                "voice handshake timed out (Discord did not answer in 25s)",
                                error_type="TimeoutError") from exc
                except discord.ClientException as exc:
                    player.connection_state = "failed"
                    raise _fail(VOICE_CONNECTION_FAILED, "voice-connect",
                                f"Discord refused voice connect: {exc}",
                                error_type="ClientException") from exc
                except Exception as exc:
                    player.connection_state = "failed"
                    code = classify_playback_exception(exc)
                    raise _fail(code, "voice-connect",
                                f"{type(exc).__name__}: {exc}",
                                error_type=type(exc).__name__) from exc
        else:
            # Already connected — verify we are in the right channel.
            try:
                if (player.voice.channel and
                        player.voice.channel.id != voice_channel.id):
                    await player.voice.move_to(voice_channel)
                player.note_connected(player.voice.channel or voice_channel)
            except Exception as exc:
                log.warning("voice move failed (non-fatal): %s", str(exc)[:150])
        if not player.voice or not player.voice.is_connected():
            raise _fail(VOICE_CONNECTION_FAILED, "voice-connect",
                        "voice connection was not established after connect")

        # Stage 7: FFmpeg start — capture stderr-worthy failures explicitly.
        player.current = track
        player.playing = True
        player.player_state = "buffering"
        # Server default volume applies once per player lifetime; any explicit
        # volume change after that wins (volume_touched).
        if not player._volume_touched:
            try:
                cfg = await get_music_config(player.guild_id)
                player.volume = clamp_volume(cfg["defaultVolume"], cfg["maxVolume"]) / 100
            except Exception:
                pass
        opts = dict(FFMPEG_OPTS)
        if seek_to and seek_to > 0:
            opts["before_options"] = f"{opts['before_options']} -ss {int(seek_to)}"
        # Audio filters: allowlisted names only; the -af chain is assembled
        # from the FILTERS map, never from user input.
        active_filters = [f for f in (player.filters or []) if f in FILTERS]
        if active_filters:
            opts["options"] = (opts.get("options") or "") + " -af " + ",".join(
                FILTERS[f] for f in active_filters)
        try:
            src = discord.FFmpegPCMAudio(stream_url, **opts)
        except FileNotFoundError as exc:
            raise _fail(FFMPEG_FAILED, "ffmpeg-start",
                        f"ffmpeg executable failed: {exc}",
                        error_type="FileNotFoundError") from exc
        except Exception as exc:
            code = classify_playback_exception(exc)
            raise _fail(code if code != UNKNOWN_PLAYBACK_ERROR else FFMPEG_FAILED,
                        "ffmpeg-start", f"{type(exc).__name__}: {exc}",
                        error_type=type(exc).__name__) from exc
        try:
            src = discord.PCMVolumeTransformer(src, volume=player.volume)
        except Exception as exc:
            raise _fail(FFMPEG_FAILED, "ffmpeg-start",
                        f"volume transformer failed: {type(exc).__name__}: {exc}",
                        error_type=type(exc).__name__) from exc

        # Stage 8: send audio to Discord.
        player._play_started = time.monotonic()
        player._play_offset = float(seek_to or 0.0)
        player._paused_at = None
        player._paused_elapsed = 0.0

        def _after(err):
            if err:
                log.warning("Player error guild=%s: %s", player.guild_id,
                            sanitize_for_log(str(err), limit=300))
                try:
                    from datetime import datetime as _dt, timezone as _tz
                    player.last_error = sanitize_for_log(str(err), limit=300)
                    player.player_state = "error"
                except Exception:
                    pass
            loop = self.bot_loop
            if loop is None or loop.is_closed():
                log.error("Bot loop unavailable for track-end handling; queue halted")
                return
            asyncio.run_coroutine_threadsafe(
                self._on_track_end(player, announce, err), loop)

        try:
            player.voice.play(src, after=_after)
        except discord.ClientException as exc:
            raise _fail(VOICE_CONNECTION_FAILED, "discord-send",
                        f"Discord refused playback: {exc}",
                        error_type="ClientException") from exc
        except Exception as exc:
            code = classify_playback_exception(exc)
            raise _fail(code, "discord-send",
                        f"{type(exc).__name__}: {exc}",
                        error_type=type(exc).__name__) from exc

        # Stage 9: player state updated — success.
        player.player_state = "playing"
        diag = self.build_diagnostic(
            requested_title=req_title, track=track, player=player,
            voice_channel=voice_channel, perms=perms, ffmpeg=ff,
            stage="playing", ok=True)
        self.record_playback_attempt(diag)
        log.info("playback START guild=%s channel=%s track=%r source=%s",
                 player.guild_id, getattr(voice_channel, "id", "?"),
                 (track.title or "")[:80], (track.source or "")[:60])

    async def _on_track_end(self, player: GuildPlayer, announce=None, err=None) -> None:
        """Advance the queue. Failed tracks are logged, skipped, and the next
        valid track is tried — the service never crashes on one bad track."""
        try:
            if not player.playing:
                return
            # Track ended with an FFmpeg/player error: log, then treat the
            # current track as failed and move on (with one re-resolve retry).
            if err and player.current:
                failed_title = (player.current.title or "")[:80]
                log.warning("track failed guild=%s title=%r err=%s — skipping",
                            player.guild_id, failed_title,
                            sanitize_for_log(str(err), limit=200))
                player.player_state = "error"
                source = player.current.url or player.current.stream_url
                fresh = await self.resolve(source) if source else None
                if fresh and player.voice and player.voice.channel:
                    fresh.requester = player.current.requester
                    try:
                        await self.play_now(player, fresh, player.voice.channel, announce)
                        await self._emit_track_started(player)
                        return
                    except PlaybackError as pe:
                        log.warning("Re-resolve retry failed for %r: %s",
                                    fresh.title[:60], pe.code)
                    except Exception:
                        log.warning("Re-resolve retry failed for %r", fresh.title[:60])
                # Fall through to the next queued track (current is spent).
                try:
                    if player.current:
                        player.history.append(player.current)
                except Exception:
                    pass
                player.current = None
            # Validate before popping — corruption resets to idle, not a crash.
            repaired = player.validate_queue()
            if repaired:
                log.warning("queue repaired at track-end guild=%s: %s",
                            player.guild_id, repaired)
            # Skip any queued entries that lost their audio source.
            next_track = None
            skipped = 0
            for _ in range(len(player.queue) + 1):
                cand = player.pop_next()
                if cand is None:
                    break
                if not (getattr(cand, "stream_url", "") or getattr(cand, "url", "")):
                    skipped += 1
                    log.warning("skipping queue entry without audio source: %r",
                                (getattr(cand, "title", "") or "")[:60])
                    try:
                        player.history.append(cand)
                    except Exception:
                        pass
                    continue
                next_track = cand
                break
            if skipped and next_track is None:
                log.info("all %d queued tracks unplayable guild=%s — idle",
                         skipped, player.guild_id)
            if next_track is None and player.autoplay and player.current:
                # Bounded autoplay: a resolver that keeps failing (or an
                # endless related-chain) must stop itself instead of spinning.
                if player.autoplay_chain >= AUTOPLAY_MAX_CHAIN:
                    log.warning("autoplay chain cap reached guild=%s — stopping",
                                player.guild_id)
                    player.autoplay = False
                elif player.autoplay_failures >= AUTOPLAY_MAX_CONSECUTIVE_FAILURES:
                    log.warning("autoplay failing repeatedly guild=%s — disabling",
                                player.guild_id)
                    player.autoplay = False
                else:
                    try:
                        related = await self._related(player.current)
                        if related:
                            next_track = related
                            player.autoplay_chain += 1
                        else:
                            player.autoplay_failures += 1
                    except Exception:
                        player.autoplay_failures += 1
            if next_track is None:
                player.current = None
                player.playing = False
                player.player_state = "idle"
                return
            if player.voice and player.voice.channel:
                try:
                    await self.play_now(player, next_track, player.voice.channel, announce)
                    await self._emit_track_started(player)
                except PlaybackError as pe:
                    # One bad next-track must not wedge the player: log it and
                    # continue with whatever follows.
                    log.warning("next-track failed guild=%s code=%s — trying following track",
                                player.guild_id, pe.code)
                    try:
                        player.history.append(next_track)
                    except Exception:
                        pass
                    player.current = None
                    # Recurse once (bounded by queue length) to try the rest.
                    if player.queue:
                        await self._on_track_end(player, announce, None)
                    else:
                        player.playing = False
                        player.player_state = "idle"
            else:
                player.playing = False
                player.player_state = "idle"
        except Exception:
            log.exception("Track-end handler failed")
            player.playing = False
            try:
                player.player_state = "idle"
            except Exception:
                pass

    async def run_playback_test(self) -> dict:
        """Controlled self-test for the [▶ Test Audio] button.

        Checks each stage WITHOUT joining voice: gateway/loop, permissions are
        per-guild (reported as NOT TESTED here), ffmpeg, audio source, and
        whether a stream URL is actually producible. Returns staged PASS/FAIL.
        """
        stages: dict[str, str] = {}
        detail: dict = {}
        # 1. Discord gateway (bot loop alive?).
        try:
            loop_ok = self.bot_loop is not None and not self.bot_loop.is_closed()
        except Exception:
            loop_ok = False
        stages["discord_gateway"] = "PASS" if loop_ok else "FAIL"
        detail["discord_gateway"] = "event loop available" if loop_ok else "bot loop not ready"
        # 2. Voice permissions — needs a real channel; report honestly.
        stages["voice_permissions"] = "NOT TESTED"
        detail["voice_permissions"] = "requires a guild voice channel — checked live on /play"
        # 3. FFmpeg.
        ff = ffmpeg_check()
        if ff["probed_ok"] is True:
            stages["ffmpeg"] = "PASS"
        elif ff["probed_ok"] is False:
            stages["ffmpeg"] = "FAIL"
        else:
            stages["ffmpeg"] = "NOT TESTED"
        detail["ffmpeg"] = ff
        # 4. Audio source — real resolve of a known track.
        audio_ok = False
        try:
            track = await asyncio.wait_for(
                self.resolve("Rick Astley Never Gonna Give You Up"), timeout=60)
            if track and (track.stream_url or track.url):
                if is_preview_url(track.stream_url):
                    stages["audio_source"] = "FAIL"
                    detail["audio_source"] = "fallback returned only a preview clip"
                else:
                    audio_ok = True
                    stages["audio_source"] = "PASS"
                    detail["audio_source"] = {
                        "title": track.title[:120],
                        "provider": track.source,
                    }
            else:
                stages["audio_source"] = "FAIL"
                detail["audio_source"] = sanitize_for_log(
                    self.get_resolve_error(), limit=300) or "no result"
        except asyncio.TimeoutError:
            stages["audio_source"] = "FAIL"
            detail["audio_source"] = "resolve timed out (likely YouTube challenge or no JS runtime)"
        except Exception as exc:
            stages["audio_source"] = "FAIL"
            detail["audio_source"] = sanitize_for_log(f"{type(exc).__name__}: {exc}", limit=300)
        # 5. Playback — only proven by a real voice join; never fake it.
        stages["playback"] = "NOT TESTED" if audio_ok else "NOT TESTED"
        detail["playback"] = ("audio source resolves; full playback proven by /play in voice"
                              if audio_ok else "skipped: audio source failed")
        detail["error_kind"] = self.get_error_kind()
        detail["youtube_challenged"] = self.youtube_challenged()
        ok = stages["ffmpeg"] == "PASS" and stages["audio_source"] == "PASS"
        return {"ok": ok, "stages": stages, "detail": detail}

    async def _refresh_stream_url(
        self, data: dict[str, Any], use_proxy: bool = True
    ) -> dict[str, Any]:
        webpage = data.get("webpage_url") or data.get("url")
        if not webpage:
            return data
        try:
            loop = asyncio.get_running_loop()
            # Refresh through the egress that produced the result, otherwise a
            # challenged proxy re-breaks a track that resolved directly.
            with yt_dlp.YoutubeDL(get_ydl_opts(use_proxy=use_proxy)) as ydl:
                fresh = await loop.run_in_executor(
                    None, lambda: ydl.extract_info(webpage, download=False))
            if fresh and fresh.get("url"):
                return fresh
        except Exception as exc:
            log.warning("Stream URL refresh failed for %r: %s", str(webpage)[:80], exc)
        return data

    async def _related(self, track: Track) -> Optional[Track]:
        if not track.url:
            return None
        video_id = ""
        if "youtube.com/watch?v=" in track.url:
            video_id = track.url.split("watch?v=")[-1].split("&")[0]
        elif "=" in track.url:
            video_id = track.url.split("=")[-1].split("&")[0]
        if not video_id:
            return None
        url = f"https://www.youtube.com/watch?v={video_id}&list=RD{video_id}"
        return await self.resolve(url)


engine = MusicEngine()
