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

YDL_OPTS = {
    "format": "bestaudio/best",
    "noplaylist": True,
    "quiet": False,
    "no_warnings": True,
    "default_search": "ytsearch",
    "source_address": "0.0.0.0",
    "nocheckcertificate": True,
    "socket-timeout": 15,
    "extractor_retries": 3,
    "retries": 3,
    "fragment_retries": 3,
    "buffer": 65536,
}

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
        self.thumbnail: str = data.get("thumbnail") or data.get("thumbnails", [{}])[0].get("url", "") if data.get("thumbnails") else ""
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

    def get_player(self, guild_id: int) -> GuildPlayer:
        if guild_id not in self._players:
            self._players[guild_id] = GuildPlayer(guild_id)
        return self._players[guild_id]

    def remove_player(self, guild_id: int) -> None:
        self._players.pop(guild_id, None)

    async def resolve(self, query: str) -> Optional[Track]:
        """Resolve a search query or URL to a Track via yt-dlp. Retries on failure."""
        last_exc: Optional[Exception] = None
        for attempt in range(3):
            try:
                loop = asyncio.get_running_loop()
                with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
                    data = await loop.run_in_executor(
                        None, lambda: ydl.extract_info(query, download=False))
                if data is None:
                    last_exc = ValueError("yt-dlp returned None")
                    continue
                if "entries" in data:
                    entries = [e for e in data["entries"] if e]
                    if not entries:
                        last_exc = ValueError("No entries found")
                        continue
                    data = entries[0]
                if not data.get("url") and not data.get("webpage_url"):
                    last_exc = ValueError("No URL in result")
                    continue
                track = Track(data, requester=None)
                log.info("resolve ok: %s (attempt %d)", track.title[:60], attempt + 1)
                return track
            except Exception as exc:
                last_exc = exc
                log.warning("yt-dlp attempt %d failed for %r: %s", attempt + 1, query[:100], exc)
                if attempt < 2:
                    await asyncio.sleep(1.5 * (attempt + 1))
        log.error("yt-dlp failed after 3 attempts for %r: %s", query[:100], last_exc)
        return None

    async def play_now(self, player: GuildPlayer, track: Track,
                       voice_channel: discord.VoiceChannel, announce=None) -> None:
        if not player.is_connected():
            try:
                player.voice = await voice_channel.connect(self_deaf=True)
            except discord.ClientException:
                pass
        player.current = track
        player.playing = True
        src = discord.FFmpegPCMAudio(track.stream_url, **FFMPEG_OPTS)
        src = discord.PCMVolumeTransformer(src, volume=player.volume)

        def _after(err):
            if err:
                log.warning("Player error: %s", err)
            loop = self.bot_loop or asyncio.get_running_loop()
            asyncio.run_coroutine_threadsafe(self._on_track_end(player, announce), loop)

        player.voice.play(src, after=_after)

    async def _on_track_end(self, player: GuildPlayer, announce=None) -> None:
        try:
            if not player.playing:
                return
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
