"""Music engine — per-guild player with yt-dlp + FFmpeg, robust error handling."""

import asyncio
import logging
import shutil
from collections import deque
from pathlib import Path
from typing import Any, Optional

import discord
import yt_dlp

log = logging.getLogger("bot.music")


def _resolve_ffmpeg() -> str:
    """Find an FFmpeg binary: PATH first, then the bundled imageio-ffmpeg one.
    Returns 'ffmpeg' as a last resort so the error message stays accurate."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


FFMPEG_EXE = _resolve_ffmpeg()

# yt-dlp: stream extraction only, no downloads to disk.
YDL_OPTS = {
    "format": "bestaudio/best",
    "noplaylist": True,
    "quiet": True,
    "no_warnings": True,
    "default_search": "ytsearch",
    "source_address": "0.0.0.0",
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
        self.thumbnail: str = data.get("thumbnail") or ""
        self.url: str = data.get("url") or data.get("webpage_url", "")
        self.stream_url: str = data.get("url") or ""
        self.requester = requester

    def __str__(self) -> str:
        mins, secs = divmod(self.duration, 60)
        return f"**{self.title}** — {self.uploader} `({mins}:{secs:02d})`"


class GuildPlayer:
    """Holds one guild's queue + playback state. One instance per guild."""

    def __init__(self, guild_id: int):
        self.guild_id = guild_id
        self.queue: deque[Track] = deque()
        self.current: Optional[Track] = None
        self.playing: bool = False
        self.loop: bool = False
        self.volume: float = 0.5
        self.voice: Optional[discord.VoiceClient] = None
        self.now_playing_message: Optional[discord.Message] = None

    def enqueue(self, track: Track) -> int:
        self.queue.append(track)
        return len(self.queue)

    def pop_next(self) -> Optional[Track]:
        if self.loop and self.current:
            return self.current
        if self.queue:
            return self.queue.popleft()
        return None

    def clear(self) -> None:
        self.queue.clear()
        self.current = None

    def is_connected(self) -> bool:
        return self.voice is not None and self.voice.is_connected()


class MusicEngine:
    """Manages GuildPlayers across all guilds."""

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
        """Resolve a search query or URL to a Track via yt-dlp."""
        loop = asyncio.get_running_loop()
        try:
            with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
                data = await loop.run_in_executor(None, lambda: ydl.extract_info(query, download=False))
        except Exception as exc:
            log.warning("yt-dlp failed for %r: %s", query[:100], exc)
            return None
        if data is None:
            return None
        if "entries" in data:
            entries = [e for e in data["entries"] if e]
            if not entries:
                return None
            data = entries[0]
        return Track(data, requester=None)  # requester set by caller

    async def play_now(self, player: GuildPlayer, track: Track,
                       voice_channel: discord.VoiceChannel, announce=None) -> None:
        """Connect (if needed) and start playing a track."""
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
            if next_track is None:
                player.current = None
                player.playing = False
                return
            # Need a voice channel to (re)connect to — reuse the current one.
            if player.voice and player.voice.channel:
                await self.play_now(player, next_track, player.voice.channel, announce)
            else:
                player.playing = False
        except Exception:
            log.exception("Track-end handler failed")
            player.playing = False


engine = MusicEngine()
