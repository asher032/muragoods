"""Music engine — per-guild player with yt-dlp + FFmpeg, robust error handling."""

import asyncio
import logging
import shutil
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


def get_ydl_opts() -> dict[str, Any]:
    """Build yt-dlp options, including proxy if configured."""
    opts: dict[str, Any] = {
        "format": "bestaudio[acodec!=none]/bestaudio/best",
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
        "extractor_args": {"youtube": {"player_client": ["android", "web", "ios", "tv"]}},
    }
    proxy = config.YOUTUBE_PROXY
    if proxy:
        opts["proxy"] = proxy
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
        last_exc: Optional[Exception] = None
        strategies = [
            ("ytsearch", get_ydl_opts()),
            ("ytsearch1", {**get_ydl_opts(), "default_search": None}),
            ("ytsearch5", {**get_ydl_opts(), "default_search": None}),
            ("scsearch", {**get_ydl_opts(), "default_search": None}),
            ("bandcamp", {**get_ydl_opts(), "default_search": None}),
            ("direct", {**get_ydl_opts(), "force_generic_extractor": True}),
        ]
        for strategy_name, strategy_opts in strategies:
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
                    log.info("resolve ok via %s: %s (attempt %d)", strategy_name, track.title[:60], attempt + 1)
                    self._last_resolve_error = None
                    return track
                except Exception as exc:
                    last_exc = exc
                    self._last_resolve_error = str(exc)[:500]
                    log.warning("yt-dlp %s attempt %d failed for %r: %s", strategy_name, attempt + 1, query[:100], exc)
                    if attempt < 1:
                        await asyncio.sleep(1)
        log.error("yt-dlp failed after all strategies for %r: %s", query[:100], last_exc)
        return None

    def get_resolve_error(self) -> Optional[str]:
        return self._last_resolve_error

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
