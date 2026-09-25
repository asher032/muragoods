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
        try:
            _discord.opus.load_opus()
        except Exception as load_exc:
            name = type(load_exc).__name__
            if name == "OpusNotLoaded" or "not loaded" in str(load_exc).lower():
                return {"loaded": False, "lib": None, "status": "missing",
                        "error": "OpusNotLoaded"}
            return {"loaded": False, "lib": None, "status": "load_failed",
                    "error": sanitize_for_log(f"{name}: {load_exc}", limit=200)}
        loaded = bool(_discord.opus.is_loaded())
        return {"loaded": loaded, "lib": None, "status": "ready" if loaded else "unknown",
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


def get_ydl_opts() -> dict[str, Any]:
    """Build yt-dlp options, including cookies/proxy when configured."""
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
    proxy = config.YOUTUBE_PROXY
    if proxy:
        opts["proxy"] = proxy
    cookies = cookies_path()
    if cookies:
        opts["cookiefile"] = cookies
    return opts


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


class MusicEngine:
    def __init__(self):
        from collections import deque as _dq
        self._players: dict[int, GuildPlayer] = {}
        self.bot_loop: Optional[asyncio.AbstractEventLoop] = None
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
        if is_url:
            strategies = [("url", get_ydl_opts())]
        else:
            strategies = [
                ("ytsearch", get_ydl_opts()),
                ("ytsearch1", {**get_ydl_opts(), "default_search": None}),
                ("ytsearch5", {**get_ydl_opts(), "default_search": None}),
                ("scsearch", {**get_ydl_opts(), "default_search": None}),
                ("bandcamp", {**get_ydl_opts(), "default_search": None}),
                ("direct", {**get_ydl_opts(), "force_generic_extractor": True}),
            ]
        youtube_challenged = False
        for strategy_name, strategy_opts in strategies:
            if youtube_challenged and strategy_name.startswith("ytsearch"):
                # The challenge is a property of this host's egress IP, so the
                # sibling YouTube strategies will be refused identically. Not
                # retrying them is the difference between ~10s and ~80s.
                log.info("skipping %s: YouTube already challenged this host's IP", strategy_name)
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
                        data = await self._refresh_stream_url(data)
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
                        log.warning(
                            "YouTube bot-challenge on %s for %r — set YT_COOKIES (or "
                            "YOUTUBE_PROXY) to authenticate; retrying cannot help",
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
        opts = dict(FFMPEG_OPTS)
        if seek_to and seek_to > 0:
            opts["before_options"] = f"{opts['before_options']} -ss {int(seek_to)}"
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
                try:
                    related = await self._related(player.current)
                    if related:
                        next_track = related
                except Exception:
                    pass
            if next_track is None:
                player.current = None
                player.playing = False
                player.player_state = "idle"
                return
            if player.voice and player.voice.channel:
                try:
                    await self.play_now(player, next_track, player.voice.channel, announce)
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

    async def _refresh_stream_url(self, data: dict[str, Any]) -> dict[str, Any]:
        webpage = data.get("webpage_url") or data.get("url")
        if not webpage:
            return data
        try:
            loop = asyncio.get_running_loop()
            with yt_dlp.YoutubeDL(get_ydl_opts()) as ydl:
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
