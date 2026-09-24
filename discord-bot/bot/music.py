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


async def probe() -> bool:
    """Measure whether FFmpeg actually executes on THIS runtime.

    `music` used to be set to "ready" unconditionally from on_ready, so /health
    advertised working music on a host whose decoder was missing. This runs the
    real binary instead of asserting it. Recording the outcome is also what
    lets the dashboard distinguish "no decoder" from "decoder present but
    playback unproven".
    """
    global FFMPEG_OK
    ok = False
    try:
        proc = await asyncio.create_subprocess_exec(
            FFMPEG_EXE, "-version",
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        await asyncio.wait_for(proc.wait(), timeout=5)
        ok = proc.returncode == 0
    except Exception as exc:
        log.warning("FFmpeg probe failed (%s): %s", FFMPEG_EXE, str(exc)[:160])
    FFMPEG_OK = ok
    http.set_status("music", "ready" if ok else "ffmpeg-missing")
    return ok


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
        self.queue.clear()
        self.current = None

    def is_connected(self) -> bool:
        return self.voice is not None and self.voice.is_connected()


class MusicEngine:
    def __init__(self):
        self._players: dict[int, GuildPlayer] = {}
        self.bot_loop: Optional[asyncio.AbstractEventLoop] = None
        self._last_resolve_error: Optional[str] = None
        self._last_error_kind: Optional[str] = None
        # Whether YouTube challenged this host during the LAST resolve. Kept
        # separate from error_kind so a fallback success is not reported as a
        # failure -- the primary provider was still refused.
        self._youtube_challenged: bool = False
        self._ydlp_version: str = "unknown"

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
                    message = str(exc)[:500]
                    self._last_resolve_error = message
                    if is_bot_challenge(message):
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

    async def play_now(self, player: GuildPlayer, track: Track,
                       voice_channel: discord.VoiceChannel, announce=None,
                       seek_to: float = 0.0) -> None:
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            player.playing = False
            player.voice.stop()
            await asyncio.sleep(0)
        if not player.is_connected():
            existing = voice_channel.guild.voice_client
            if existing and existing.is_connected():
                player.voice = existing
                if existing.channel and existing.channel.id != voice_channel.id:
                    try:
                        await existing.move_to(voice_channel)
                    except Exception:
                        log.warning("Could not move to %s — playing from %s",
                                    voice_channel.id, existing.channel.id)
            else:
                try:
                    player.voice = await voice_channel.connect(self_deaf=True, timeout=20)
                except (discord.ClientException, asyncio.TimeoutError) as exc:
                    player.voice = None
                    raise RuntimeError("Could not connect to the voice channel") from exc
        if not player.voice or not player.voice.is_connected():
            raise RuntimeError("Voice connection was not established")
        player.current = track
        player.playing = True
        opts = dict(FFMPEG_OPTS)
        if seek_to and seek_to > 0:
            opts["before_options"] = f"{opts['before_options']} -ss {int(seek_to)}"
        src = discord.FFmpegPCMAudio(track.stream_url, **opts)
        src = discord.PCMVolumeTransformer(src, volume=player.volume)
        player._play_started = time.monotonic()
        player._play_offset = float(seek_to or 0.0)
        player._paused_at = None
        player._paused_elapsed = 0.0

        def _after(err):
            if err:
                log.warning("Player error: %s", err)
            loop = self.bot_loop
            if loop is None or loop.is_closed():
                log.error("Bot loop unavailable for track-end handling; queue halted")
                return
            asyncio.run_coroutine_threadsafe(
                self._on_track_end(player, announce, err), loop)

        player.voice.play(src, after=_after)

    async def _on_track_end(self, player: GuildPlayer, announce=None, err=None) -> None:
        try:
            if not player.playing:
                return
            if err and player.current:
                source = player.current.url or player.current.stream_url
                fresh = await self.resolve(source) if source else None
                if fresh and player.voice and player.voice.channel:
                    fresh.requester = player.current.requester
                    try:
                        await self.play_now(player, fresh, player.voice.channel, announce)
                        return
                    except Exception:
                        log.warning("Re-resolve retry failed for %r", fresh.title[:60])
            next_track = player.pop_next()
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
                return
            if player.voice and player.voice.channel:
                await self.play_now(player, next_track, player.voice.channel, announce)
            else:
                player.playing = False
        except Exception:
            log.exception("Track-end handler failed")
            player.playing = False

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
