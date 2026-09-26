"""Music commands — ack-first lifecycle, edit-in-place embeds, friendly errors."""

import asyncio
import logging
import random

import discord
from discord import app_commands
from discord.ext import commands

import embeds
import music
import utils

log = logging.getLogger("bot.music_cmds")


def _fmt(seconds: int) -> str:
    return embeds.fmt_duration(seconds)


def now_playing_embed(track: music.Track) -> discord.Embed:
    e = embeds.music("🎵 NOW PLAYING", f"**{track.title}**\n{track.uploader}")
    if track.duration:
        e.add_field(name="⏱ Duration", value=_fmt(track.duration), inline=True)
    e.add_field(name="🙋 Requested by",
                value=track.requester.mention if track.requester else "—", inline=True)
    if track.thumbnail:
        e.set_thumbnail(url=track.thumbnail)
    return e


def playback_error_embed(exc: BaseException) -> discord.Embed:
    """User-friendly embed for a classified playback failure.

    Technical detail goes to logs + playback-log, never to the user — but the
    TITLE names the failing subsystem so it is never a generic error.
    """
    if isinstance(exc, music.PlaybackError):
        return embeds.embed(exc.user_title, exc.user_message, embeds.ERROR)
    if isinstance(exc, asyncio.TimeoutError):
        title, msg = music.PLAYBACK_USER_MESSAGES[music.PLAYBACK_TIMEOUT]
        return embeds.embed(title, msg, embeds.WARN)
    code = music.classify_playback_exception(exc)
    title, msg = music.PLAYBACK_USER_MESSAGES.get(
        code, music.PLAYBACK_USER_MESSAGES[music.UNKNOWN_PLAYBACK_ERROR])
    # Voice refuses carry the real Discord reason (safe, no secrets).
    if code == music.VOICE_CONNECTION_FAILED and str(exc).strip():
        detail = music.sanitize_for_log(str(exc), limit=200) or ""
        if detail:
            msg = f"{msg}\n`{detail}`"
    return embeds.embed(title, msg, embeds.ERROR if code != music.PLAYBACK_TIMEOUT else embeds.WARN)


_PERM_DESCRIPTIONS = {
    "view_channel": "Allows the bot to see the voice channel.",
    "connect": "Allows the bot to join the voice channel.",
    "speak": "Allows the bot to transmit audio in the voice channel.",
}
_PERM_LABELS = {
    "view_channel": "View Channel",
    "connect": "Connect",
    "speak": "Speak",
}

def permission_status_embed(perms: dict) -> discord.Embed:
    lines = []
    for key in ("view_channel", "connect", "speak"):
        granted = perms.get(key)
        icon = "🟢 Granted" if granted else ("🔴 Missing" if granted is False else "⚪ Unknown")
        lines.append(f"**{_PERM_LABELS[key]}**\n`{_PERM_DESCRIPTIONS[key]}`\n{icon}")
    missing = perms.get("missing") or []
    desc = "\n\n".join(lines)
    if missing:
        names = ", ".join(_PERM_LABELS.get(m, m) for m in missing)
        desc += f"\n\n⚠️ The bot cannot play audio because **{names}** permission is missing."
    return embeds.embed("🔐 Voice Permissions", desc,
                        embeds.OK if not missing else embeds.WARN)


async def dj_guard(interaction: discord.Interaction, action: str) -> bool:
    """Enforce the guild DJ policy for one control action. Sends a denial
    embed and returns False when blocked. Deny ONLY on positive evidence of
    a restrictive policy — an unreadable config must not lock everyone out."""
    if action in music.DJ_OPEN_ACTIONS:
        return True
    try:
        cfg = await music.get_music_config(interaction.guild.id)
    except Exception:
        return True
    if cfg.get("controlMode", "everyone") == "everyone":
        return True
    allowed, reason = music.dj_allowed(interaction.user, interaction.guild, cfg, action)
    if allowed:
        return True
    embed = embeds.embed("🎧 DJ Restricted", reason or "This control is restricted.", embeds.WARN)
    try:
        await interaction.response.send_message(embed=embed, ephemeral=True)
    except discord.InteractionResponded:
        await interaction.followup.send(embed=embed, ephemeral=True)
    return False


async def refresh_now_playing(guild: discord.Guild) -> None:
    """Create-or-edit the Now Playing message in the configured music text
    channel. Edits in place — never spams a new message every few seconds."""
    try:
        cfg = await music.get_music_config(guild.id)
    except Exception:
        return
    if not cfg.get("enableNowPlaying", True):
        return
    channel_id = cfg.get("nowPlayingChannelId") or cfg.get("musicChannelId") or cfg.get("textChannelId")
    if not channel_id:
        return
    try:
        channel = guild.get_channel(int(channel_id))
    except (TypeError, ValueError):
        return
    if not isinstance(channel, discord.TextChannel):
        return
    player = music.engine.get_player(guild.id)
    track = player.current
    if track is None or not player.playing:
        return
    embed = now_playing_embed(track)
    view = MusicControls(guild.id)
    try:
        existing = player.now_playing_message
        if existing is not None:
            try:
                await existing.edit(embed=embed, view=view)
                return
            except (discord.NotFound, discord.HTTPException):
                player.now_playing_message = None
        msg = await channel.send(embed=embed, view=view)
        player.now_playing_message = msg
    except (discord.Forbidden, discord.HTTPException):
        pass


class MusicControls(utils.SafeView):
    """Buttons on the now-playing message (timeout → edit to expired)."""

    def __init__(self, guild_id: int):
        super().__init__(timeout=900)
        self.guild_id = guild_id

    def _player(self) -> music.GuildPlayer:
        return music.engine.get_player(self.guild_id)

    @discord.ui.button(emoji="⏸", style=discord.ButtonStyle.secondary)
    async def pause(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not await dj_guard(interaction, "pause"):
            return
        player = self._player()
        if player.voice and player.voice.is_playing():
            player.voice.pause()
            player.mark_paused()
            await interaction.response.send_message("⏸ Paused.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing is playing.", ephemeral=True)

    @discord.ui.button(emoji="▶️", style=discord.ButtonStyle.secondary)
    async def resume(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not await dj_guard(interaction, "resume"):
            return
        player = self._player()
        if player.voice and player.voice.is_paused():
            player.voice.resume()
            player.mark_resumed()
            await interaction.response.send_message("▶️ Resumed.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing is paused.", ephemeral=True)

    @discord.ui.button(emoji="⏭", style=discord.ButtonStyle.primary)
    async def skip(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer()
        if not await dj_guard(interaction, "skip"):
            return
        player = self._player()
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            player.voice.stop()
        else:
            await interaction.followup.send("Nothing to skip.", ephemeral=True)

    @discord.ui.button(emoji="🔁", style=discord.ButtonStyle.secondary)
    async def loop_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not await dj_guard(interaction, "loop"):
            return
        player = self._player()
        player.loop = not player.loop
        await interaction.response.send_message(
            f"🔁 Loop **{'on' if player.loop else 'off'}**.", ephemeral=True)

    @discord.ui.button(emoji="📜", style=discord.ButtonStyle.secondary)
    async def queue_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        player = self._player()
        if not player.queue:
            await interaction.response.send_message("The queue is empty.", ephemeral=True)
            return
        lines = [f"**{i}.** {t}" for i, t in enumerate(list(player.queue)[:10], 1)]
        await interaction.response.send_message(
            embed=embeds.music("📜 Queue", "\n".join(lines)), ephemeral=True)


class MusicCog(commands.Cog):
    """Named "MusicCog" so livecheck can look it up via bot.get_cog."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        # The voice player thread needs the bot's event loop to schedule the
        # track-end callback; without this the queue can silently stall.
        music.engine.bot_loop = bot.loop

    @staticmethod
    def _voice_channel(interaction: discord.Interaction):
        if not isinstance(interaction.user, discord.Member) or not interaction.user.voice:
            return None
        return interaction.user.voice.channel

    async def _voice_guard(self, interaction: discord.Interaction) -> bool:
        """Common voice checks: detect the user's channel, verify the bot can
        access it (View + Connect + Speak). Responds and returns False if
        blocked. Never asks for manual channel/permission IDs."""
        channel = self._voice_channel(interaction)
        if not channel:
            await interaction.followup.send(embed=embeds.music(
                "🎧 Voice Channel Detection",
                "You need to join a voice channel first — I play where **you** are. "
                "Join a channel, then run `/play` again."), ephemeral=True)
            return False
        try:
            perms = music.check_voice_permissions(channel, interaction.guild.me)
        except Exception:
            perms = {"view_channel": False, "connect": False,
                     "speak": False, "missing": ["view_channel", "connect", "speak"]}
        if not perms.get("all_granted"):
            await interaction.followup.send(
                embed=permission_status_embed(perms), ephemeral=True)
            return False
        return True

    async def on_voice_state_update(self, member: discord.Member,
                                    before: discord.VoiceState,
                                    after: discord.VoiceState):
        """Track the bot's own voice drops and attempt a bounded rejoin.

        Discord force-disconnects (kick/move/server outage) surface here as
        before.channel set → after.channel None for the bot itself. Retry at
        most MAX_VOICE_RECONNECTS times, then park in a clear failed state.
        """
        try:
            bot_user = getattr(self.bot, "user", None)
            if bot_user is None or member.id != bot_user.id:
                return
            if before.channel is None or after.channel is not None:
                return  # not a drop of the bot
            guild_id = member.guild.id if member.guild else None
            if guild_id is None:
                return
            player = music.engine.get_player(guild_id)
            player.note_disconnected(
                f"voice dropped from {getattr(before.channel, 'name', '?')}")
            log.warning("voice drop guild=%s channel=%s", guild_id,
                        getattr(before.channel, "id", "?"))
            # 24/7 mode holds the channel even with nothing playing: rejoin
            # under the same bounded budget, then idle in place.
            try:
                stay = (await music.get_music_config(guild_id)).get("twentyFourSeven", False)
            except Exception:
                stay = False
            player.stay_connected = bool(stay)
            if (not player.playing or not player.current) and not player.stay_connected:
                player.connection_state = "disconnected"
                player.player_state = "idle"
                return
            if not player.note_reconnecting():
                log.error("voice reconnect budget spent guild=%s — parking failed",
                          guild_id)
                player.playing = False
                player.player_state = "error"
                return
            try:
                player.voice = await before.channel.connect(self_deaf=True, timeout=20)
                player.note_connected(before.channel)
                player.player_state = "playing" if player.playing else "idle"
                log.info("voice rejoined guild=%s attempt=%d",
                         guild_id, player.reconnect_attempts)
                # Resume the interrupted track from its last position.
                if player.current and player.voice and player.voice.channel:
                    pos = player.position()
                    try:
                        await music.engine.play_now(
                            player, player.current, player.voice.channel,
                            seek_to=max(0.0, pos))
                    except Exception as exc:
                        log.warning("resume-after-rejoin failed: %s", str(exc)[:150])
            except Exception as exc:
                log.warning("voice rejoin attempt %d failed guild=%s: %s",
                            player.reconnect_attempts, guild_id, str(exc)[:150])
                if player.reconnect_attempts >= player.MAX_VOICE_RECONNECTS:
                    player.connection_state = "failed"
                    player.playing = False
                    player.player_state = "error"
        except Exception:
            log.exception("on_voice_state_update recovery failed")

    @app_commands.command(name="play", description="Play a song (search or URL).")
    @app_commands.describe(query="Song name or URL")
    async def play(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer()
        if not await self._voice_guard(interaction):
            return
        await interaction.followup.send(embed=embeds.music("🔎 Searching…", f"`{query[:80]}`"))
        track = await music.engine.resolve(query)
        if not track:
            err_detail = music.engine.get_resolve_error()
            if err_detail:
                await interaction.edit_original_response(embed=embeds.embed(
                    "🔎 Track Not Found",
                    f"yt-dlp: {err_detail}\nTry a different search or a direct URL.",
                    embeds.WARN))
            else:
                await interaction.edit_original_response(embed=embeds.embed(
                    "🔎 Track Not Found", "Try another search.", embeds.WARN))
            return
        track.requester = interaction.user
        player = music.engine.get_player(interaction.guild.id)
        try:
            max_q = (await music.get_music_config(interaction.guild.id))["maxQueueSize"]
        except Exception:
            max_q = 100
        if len(player.queue) >= max_q:
            await interaction.edit_original_response(embed=embeds.embed(
                "📜 Queue Full", f"This server allows {max_q} queued tracks.", embeds.WARN))
            return
        position = player.enqueue(track)
        if position == "duplicate":
            await interaction.edit_original_response(embed=embeds.embed(
                "🔁 Already queued", f"**{track.title}** is already in the queue.", embeds.WARN))
            return
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            await interaction.edit_original_response(embed=embeds.music(
                "➕ Queued", f"**{track.title}** — position **{position}**"))
            return
        channel = self._voice_channel(interaction)
        try:
            await music.engine.play_now(player, track, channel, requested_title=query)
        except music.PlaybackError as exc:
            log.warning("Playback classified fail code=%s stage=%s: %s",
                        exc.code, exc.stage, exc.detail[:200])
            await interaction.edit_original_response(embed=playback_error_embed(exc))
            if exc.code == music.MISSING_PERMISSION:
                try:
                    perms = music.check_voice_permissions(channel, interaction.guild.me)
                    await interaction.followup.send(
                        embed=permission_status_embed(perms), ephemeral=True)
                except Exception:
                    pass
            return
        except asyncio.TimeoutError as exc:
            log.warning("Playback start timed out: %s", str(exc)[:150])
            await interaction.edit_original_response(embed=playback_error_embed(exc))
            return
        except Exception as exc:
            log.exception("Playback failed (unclassified)")
            # Classify instead of generic: the user sees WHICH subsystem failed.
            await interaction.edit_original_response(embed=playback_error_embed(exc))
            return
        embed = now_playing_embed(track)
        view = MusicControls(interaction.guild.id)
        try:
            await refresh_now_playing(interaction.guild)
        except Exception:
            pass
        try:
            await interaction.edit_original_response(embed=embed, view=view)
        except discord.HTTPException:
            await interaction.followup.send(embed=embed, view=view)

    @app_commands.command(name="previous", description="Play the previous track again.")
    async def previous(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not await dj_guard(interaction, "skip"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if not player.voice or not player.voice.channel:
            await interaction.followup.send("I'm not in a voice channel.", ephemeral=True)
            return
        prev = player.previous()
        if not prev:
            await interaction.followup.send("No history yet — play something first.", ephemeral=True)
            return
        try:
            await music.engine.play_now(player, prev, player.voice.channel,
                                        requested_title=prev.title)
        except Exception as exc:
            log.exception("Previous-track playback failed")
            await interaction.followup.send(embed=playback_error_embed(exc), ephemeral=True)
            return
        await interaction.followup.send(embed=embeds.music(
            "⏮ Previous", f"**{prev.title}**"))

    @app_commands.command(name="replay", description="Restart the current track.")
    async def replay(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not await dj_guard(interaction, "seek"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if not player.current or not player.voice or not player.voice.channel:
            await interaction.followup.send("Nothing is playing.", ephemeral=True)
            return
        try:
            await music.engine.play_now(player, player.current, player.voice.channel,
                                        requested_title=player.current.title)
        except Exception as exc:
            log.exception("Replay failed")
            await interaction.followup.send(embed=playback_error_embed(exc), ephemeral=True)
            return
        await interaction.followup.send(embed=embeds.music(
            "🔁 Replay", f"**{player.current.title}** from the top."))

    @app_commands.command(name="seek", description="Seek to a timestamp (e.g. 1:30 or 90).")
    @app_commands.describe(position="Timestamp like 1:30 or seconds")
    async def seek(self, interaction: discord.Interaction, position: str):
        await interaction.response.defer()
        if not await dj_guard(interaction, "seek"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if not player.voice or not player.voice.channel or not player.current:
            await interaction.followup.send("Nothing is playing.", ephemeral=True)
            return
        try:
            if ":" in position:
                mins, secs = position.split(":", 1)
                seconds = int(mins) * 60 + int(secs)
            else:
                seconds = int(position)
        except ValueError:
            await interaction.followup.send("Use a timestamp like `1:30` or `90`.", ephemeral=True)
            return
        try:
            await music.engine.play_now(
                player, player.current, player.voice.channel, seek_to=max(0, seconds),
                requested_title=player.current.title)
        except Exception as exc:
            log.exception("Seek failed")
            await interaction.followup.send(embed=playback_error_embed(exc), ephemeral=True)
            return
        await interaction.followup.send(f"⏩ Seeked to `{position}`.", ephemeral=True)

    async def _nudge(self, interaction: discord.Interaction, delta: int, label: str) -> None:
        player = music.engine.get_player(interaction.guild.id)
        if not player.voice or not player.voice.channel or not player.current:
            await interaction.followup.send("Nothing is playing.", ephemeral=True)
            return
        target = int(player.position()) + delta
        duration = player.current.duration or 0
        if duration and target >= duration - 1:
            # Past the end — advance to the next track instead.
            player.voice.stop()
            await interaction.followup.send("⏭ Past the end — skipping.", ephemeral=True)
            return
        try:
            await music.engine.play_now(
                player, player.current, player.voice.channel, seek_to=max(0, target),
                requested_title=player.current.title)
        except Exception as exc:
            log.exception("%s failed", label)
            await interaction.followup.send(embed=playback_error_embed(exc), ephemeral=True)
            return
        arrow = "⏩" if delta > 0 else "⏪"
        await interaction.followup.send(
            f"{arrow} {label} {abs(delta)}s → `{player.position():.0f}s`.", ephemeral=True)

    @app_commands.command(name="forward", description="Skip forward N seconds (default 10).")
    @app_commands.describe(seconds="How many seconds")
    async def forward(self, interaction: discord.Interaction, seconds: int = 10):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "seek"):
            return
        await self._nudge(interaction, max(1, seconds), "Forward")

    @app_commands.command(name="rewind", description="Jump back N seconds (default 10).")
    @app_commands.describe(seconds="How many seconds")
    async def rewind(self, interaction: discord.Interaction, seconds: int = 10):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "seek"):
            return
        await self._nudge(interaction, -max(1, seconds), "Rewind")

    @app_commands.command(name="history", description="Recently played tracks.")
    async def history(self, interaction: discord.Interaction):
        await interaction.response.defer()
        player = music.engine.get_player(interaction.guild.id)
        if not player.history:
            await interaction.followup.send("No history yet — play something first.")
            return
        lines = [f"**{i}.** {t}" for i, t in enumerate(list(reversed(player.history))[:10], 1)]
        await interaction.followup.send(embed=embeds.music("🕘 History", "\n".join(lines)))

    @app_commands.command(name="savequeue", description="Save the current queue under a name.")
    @app_commands.describe(name="A name for this queue")
    async def savequeue(self, interaction: discord.Interaction, name: str):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "savequeue"):
            return
        player = music.engine.get_player(interaction.guild.id)
        tracks = [{"title": t.title, "url": t.url, "uploader": t.uploader}
                  for t in list(player.queue)[:50]]
        if not tracks:
            await interaction.followup.send("The queue is empty.", ephemeral=True)
            return
        import database
        await database._db.saved_queues.update_one(
            {"guildId": interaction.guild.id, "name": name[:40]},
            {"$set": {"tracks": tracks, "savedBy": interaction.user.id}}, upsert=True)
        await interaction.followup.send(
            embed=embeds.ok("💾 Queue saved", f"**{name}** — {len(tracks)} tracks."), ephemeral=True)

    @app_commands.command(name="loadqueue", description="Load a saved queue.")
    @app_commands.describe(name="Name of the saved queue")
    async def loadqueue(self, interaction: discord.Interaction, name: str):
        await interaction.response.defer()
        if not await dj_guard(interaction, "loadqueue"):
            return
        if not await self._voice_guard(interaction):
            return
        import database
        doc = await database._db.saved_queues.find_one(
            {"guildId": interaction.guild.id, "name": name[:40]})
        if not doc:
            await interaction.followup.send(f"No saved queue named **{name}**.", ephemeral=True)
            return
        player = music.engine.get_player(interaction.guild.id)
        added = 0
        for t in doc.get("tracks", [])[:50]:
            track = music.Track({"title": t["title"], "url": t.get("url", ""),
                                 "uploader": t.get("uploader", "")}, requester=interaction.user)
            player.queue.append(track)
            added += 1
        await interaction.followup.send(embed=embeds.ok(
            "📂 Queue loaded", f"**{name}** — {added} tracks queued."))

    @app_commands.command(name="savedqueues", description="List saved queues for this server.")
    async def savedqueues(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        import database
        docs = await database._db.saved_queues.find({"guildId": interaction.guild.id}).to_list(25)
        if not docs:
            await interaction.followup.send("No saved queues yet — `/savequeue <name>`.", ephemeral=True)
            return
        lines = [f"**{d['name']}** — {len(d.get('tracks', []))} tracks" for d in docs]
        await interaction.followup.send(
            embed=embeds.music("💾 Saved Queues", "\n".join(lines)), ephemeral=True)

    @app_commands.command(name="autoplay", description="Toggle autoplay of related tracks.")
    async def autoplay(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "autoplay"):
            return
        player = music.engine.get_player(interaction.guild.id)
        player.autoplay = not player.autoplay
        await interaction.followup.send(
            f"▶️ Autoplay **{'on' if player.autoplay else 'off'}**.", ephemeral=True)

    @app_commands.command(name="queueloop", description="Toggle looping the whole queue.")
    async def queueloop(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "loop"):
            return
        player = music.engine.get_player(interaction.guild.id)
        player.queue_loop = not player.queue_loop
        await interaction.followup.send(
            f"🔁 Queue loop **{'on' if player.queue_loop else 'off'}**.", ephemeral=True)

    @app_commands.command(name="queuepage", description="Show a specific queue page (10 per page).")
    @app_commands.describe(page="Page number")
    async def queuepage(self, interaction: discord.Interaction, page: int = 1):
        await interaction.response.defer()
        player = music.engine.get_player(interaction.guild.id)
        items = list(player.queue)
        if not items:
            await interaction.followup.send(embed=embeds.music("📜 Queue", "Empty."))
            return
        per = 10
        pages = (len(items) + per - 1) // per
        page = max(1, min(page, pages))
        chunk = items[(page - 1) * per: page * per]
        lines = [f"**{(page - 1) * per + i}.** {t}" for i, t in enumerate(chunk, 1)]
        await interaction.followup.send(embed=embeds.music(
            f"📜 Queue — page {page}/{pages}", "\n".join(lines)))

    @app_commands.command(name="radio", description="Start an endless radio stream by genre.")
    @app_commands.describe(genre="Station genre")
    @app_commands.choices(genre=[
        app_commands.Choice(name="Lo-fi", value="lofi hip hop radio"),
        app_commands.Choice(name="Chill", value="chill radio mix"),
        app_commands.Choice(name="Pop", value="pop radio hits"),
        app_commands.Choice(name="Rock", value="rock radio classics"),
        app_commands.Choice(name="Classical", value="classical radio"),
        app_commands.Choice(name="Gaming", value="gaming music mix"),
        app_commands.Choice(name="Study", value="study music radio"),
    ])
    async def radio(self, interaction: discord.Interaction, genre: app_commands.Choice[str]):
        await interaction.response.defer()
        if not await dj_guard(interaction, "radio"):
            return
        if not await self._voice_guard(interaction):
            return
        await interaction.followup.send(embed=embeds.music(
            "📻 Tuning in…", f"**{genre.name}** station"))
        track = await music.engine.resolve(genre.value)
        if not track:
            await interaction.edit_original_response(embed=embeds.embed(
                "📻 Station unavailable", "Couldn't find that stream — try another genre.", embeds.WARN))
            return
        track.requester = interaction.user
        player = music.engine.get_player(interaction.guild.id)
        player.autoplay = True  # radio never ends
        channel = self._voice_channel(interaction)
        try:
            await music.engine.play_now(player, track, channel,
                                        requested_title=genre.value)
        except Exception as exc:
            log.exception("Radio playback failed")
            await interaction.edit_original_response(embed=playback_error_embed(exc))
            return
        await interaction.edit_original_response(embed=embeds.music(
            f"📻 {genre.name} Radio", f"Now streaming **{track.title}**\nAutoplay enabled — the music never stops."))

    @app_commands.command(name="musicinfo", description="Music subsystem diagnostics.")
    async def music_info(self, interaction: discord.Interaction):
        """⚙️ Music Diagnostics: audio service, FFmpeg, voice, perms, player."""
        await interaction.response.defer(ephemeral=True)
        snap = music.engine.diagnostics_snapshot()
        audio = snap["audio_service"]
        ff = snap["ffmpeg"]
        p = music.engine.get_player(interaction.guild.id)

        def _dot(status: str) -> str:
            return {"working": "🟢", "ready": "🟢", "degraded": "🟡",
                    "unavailable": "🔴", "missing": "🔴", "failed": "🔴"}.get(status, "⚪")

        e = embeds.embed("⚙️ Music Diagnostics",
                         "Checks whether the configured audio provider can resolve and "
                         "provide playable audio, whether FFmpeg can process it, and "
                         "whether the bot can hold a Discord voice connection.",
                         embeds.INFO)
        e.add_field(
            name=f"{_dot(audio['status'])} Audio Service — {audio['status'].upper()}",
            value=(f"yt-dlp `{audio['ydlp_version']}`\n{audio['detail']}"
                   + (f"\nLast: `{music.sanitize_for_log(audio['last_resolve_error'], limit=150)}`"
                      if audio.get("last_resolve_error") else ""))[:1024],
            inline=False)
        e.add_field(
            name=f"{_dot(ff['status'])} FFmpeg — {ff['status'].upper()}",
            value=((f"`{ff['version']}`" if ff.get("version")
                    else (f"`{ff['error']}`" if ff.get("error") else f"`{ff['exe']}`"))
                   + "\nChecks whether FFmpeg is installed, accessible, and capable of "
                     "processing the selected audio stream.")[:1024],
            inline=False)
        # Discord voice
        if p.is_connected():
            voice_label, voice_icon = "CONNECTED", "🟢"
        elif p.connection_state in ("connecting", "reconnecting"):
            voice_label, voice_icon = p.connection_state.upper(), "🟡"
        else:
            voice_label, voice_icon = "DISCONNECTED", "🔴"
        e.add_field(
            name=f"{voice_icon} Discord Voice — {voice_label}",
            value=(f"Checks whether the bot can establish and maintain a Discord voice "
                   f"connection.\nChannel: **{p.voice_channel_name or '—'}**"
                   f"{f' (reconnects: {p.reconnect_attempts})' if p.reconnect_attempts else ''}"
                   + (f"\nLast good: <t:{0}:R>".format(0) if p.last_successful_connection else ""))[:1024],
            inline=False)
        # Bot permissions for the caller's channel (automatic, no IDs needed).
        channel = self._voice_channel(interaction)
        if channel is not None:
            try:
                perms = music.check_voice_permissions(channel, interaction.guild.me)
                rows = []
                for key, label in (("view_channel", "View Channel"),
                                   ("connect", "Connect"), ("speak", "Speak")):
                    rows.append(f"{'🟢' if perms.get(key) else '🔴'} {label}: "
                                f"{'Granted' if perms.get(key) else 'Missing'}")
                e.add_field(name="🔐 Bot Permissions — "
                                + ("OK" if perms.get("all_granted") else "MISSING"),
                            value="\n".join(rows), inline=False)
            except Exception:
                pass
        # Player state
        state_icons = {"idle": "🟢 Idle", "playing": "🟢 Playing",
                       "paused": "🟢 Paused", "buffering": "🟡 Buffering",
                       "reconnecting": "🟡 Reconnecting", "error": "🔴 Error"}
        e.add_field(
            name="🎛 Player",
            value=(f"Shows the current music player's operational state.\n"
                   f"**{state_icons.get(p.player_state, p.player_state)}**"
                   f"\nQueue: {len(p.queue)} • Current: {p.current.title[:60] if p.current else 'none'}"
                   + (f"\nLast error `{p.last_error_code}`: "
                      f"{music.sanitize_for_log(p.last_error, limit=150)}" if p.last_error_code else ""))[:1024],
            inline=False)
        last = snap.get("last_playback")
        if last and not last.get("ok"):
            e.add_field(
                name="📋 Last Playback Failure",
                value=(f"`{last.get('stage')}` → `{last.get('error_code')}`\n"
                       f"{music.sanitize_for_log(last.get('error_message'), limit=300) or 'no detail'}")[:1024],
                inline=False)
        await interaction.followup.send(embed=e, ephemeral=True)

    @app_commands.command(name="musictest", description="Run a staged audio self-test (Test Audio).")
    async def music_test(self, interaction: discord.Interaction):
        """[ ▶ Test Audio ] — report exactly which stage passed or failed."""
        await interaction.response.defer(ephemeral=True)
        await interaction.followup.send(embed=embeds.music(
            "▶ Test Audio", "Running staged checks…"), ephemeral=True)
        result = await music.engine.run_playback_test()
        stages = result.get("stages", {})
        # Live voice-permission check against the caller's channel when possible.
        channel = self._voice_channel(interaction)
        if channel is not None:
            try:
                perms = music.check_voice_permissions(channel, interaction.guild.me)
                stages["voice_permissions"] = (
                    "PASS" if perms.get("all_granted")
                    else "FAIL")
                missing = ", ".join(perms.get("missing") or [])
                result.setdefault("detail", {})["voice_permissions"] = (
                    f"{channel.name}: all granted" if perms.get("all_granted")
                    else f"{channel.name}: missing {missing}")
            except Exception as exc:
                stages["voice_permissions"] = "FAIL"
                result.setdefault("detail", {})["voice_permissions"] = str(exc)[:150]
        icons = {"PASS": "🟢 PASS", "FAIL": "🔴 FAIL", "NOT TESTED": "⚪ NOT TESTED"}
        order = ("discord_gateway", "voice_permissions", "ffmpeg", "audio_source", "playback")
        labels = {"discord_gateway": "Discord Gateway", "voice_permissions": "Voice Permissions",
                  "ffmpeg": "FFmpeg", "audio_source": "Audio Source", "playback": "Playback"}
        lines = [f"`{labels[k]:<18}` {icons.get(stages.get(k, 'NOT TESTED'), stages.get(k))}"
                 for k in order]
        detail = result.get("detail", {})
        extras = []
        if isinstance(detail.get("ffmpeg"), dict) and detail["ffmpeg"].get("version"):
            extras.append(f"FFmpeg: `{detail['ffmpeg']['version'][:80]}`")
        if isinstance(detail.get("audio_source"), dict):
            extras.append(f"Audio: **{(detail['audio_source'].get('title') or '')[:80]}**")
        elif isinstance(detail.get("audio_source"), str):
            extras.append(f"Audio: `{music.sanitize_for_log(detail['audio_source'], limit=150)}`")
        if detail.get("voice_permissions"):
            extras.append(f"Voice: `{music.sanitize_for_log(str(detail['voice_permissions']), limit=150)}`")
        if detail.get("youtube_challenged"):
            extras.append("⚠️ YouTube challenged this host — set `YT_COOKIES` or `YOUTUBE_PROXY`.")
        body = "```\n" + "\n".join(f"{labels[k]:<18} {stages.get(k, 'NOT TESTED')}" for k in order) + "\n```"
        if extras:
            body += "\n" + "\n".join(extras)
        e = embeds.embed("▶ Test Audio — Results", body,
                         embeds.OK if result.get("ok") else embeds.WARN)
        await interaction.followup.send(embed=e, ephemeral=True)

    @app_commands.command(name="searchmusic", description="Preview the top result for a search.")
    @app_commands.describe(query="What to search for")
    async def searchmusic(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer()
        track = await music.engine.resolve(query)
        if not track:
            err_detail = music.engine.get_resolve_error()
            if err_detail:
                await interaction.followup.send(embed=embeds.embed(
                    "🔎 Track Not Found",
                    f"yt-dlp: {err_detail}\nTry a different search or a direct URL.",
                    embeds.WARN))
            else:
                await interaction.followup.send(embed=embeds.embed(
                    "🔎 Track Not Found", "Try another search.", embeds.WARN))
            return
        e = embeds.music("🎵 Top result", f"**{track.title}**\n{track.uploader}")
        if track.thumbnail:
            e.set_thumbnail(url=track.thumbnail)
        view = discord.ui.View()
        if track.url:
            view.add_item(discord.ui.Button(label="🎧 Open track", url=track.url))
        await interaction.followup.send(embed=e, view=view)

    @app_commands.command(name="skip", description="Skip the current song.")
    async def skip(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not await dj_guard(interaction, "skip"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            player.voice.stop()
            await interaction.followup.send("⏭ Skipped.", ephemeral=True)
        else:
            await interaction.followup.send("Nothing is playing.", ephemeral=True)

    @app_commands.command(name="pause", description="Pause playback.")
    async def pause(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not await dj_guard(interaction, "pause"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if player.voice and player.voice.is_playing():
            player.voice.pause()
            player.mark_paused()
            await interaction.followup.send("⏸ Paused.", ephemeral=True)
        else:
            await interaction.followup.send("Nothing is playing.", ephemeral=True)

    @app_commands.command(name="resume", description="Resume playback.")
    async def resume(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not await dj_guard(interaction, "resume"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if player.voice and player.voice.is_paused():
            player.voice.resume()
            player.mark_resumed()
            await interaction.followup.send("▶️ Resumed.", ephemeral=True)
        else:
            await interaction.followup.send("Nothing is paused.", ephemeral=True)

    @app_commands.command(name="stop", description="Stop playback and clear the queue.")
    async def stop(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not await dj_guard(interaction, "stop"):
            return
        player = music.engine.get_player(interaction.guild.id)
        player.clear()
        if player.voice:
            player.voice.stop()
            player.playing = False
        await interaction.followup.send(embed=embeds.music("⏹ Stopped", "Queue cleared."))

    @app_commands.command(name="queue", description="Show the current queue.")
    async def queue(self, interaction: discord.Interaction):
        await interaction.response.defer()
        player = music.engine.get_player(interaction.guild.id)
        if not player.queue:
            await interaction.followup.send(embed=embeds.music(
                "📜 Queue", "Empty — add something with `/play`."))
            return
        lines = [f"**{i}.** {t}" for i, t in enumerate(list(player.queue)[:10], 1)]
        if len(player.queue) > 10:
            lines.append(f"…and {len(player.queue) - 10} more")
        current = f"**Now:** {player.current}\n\n" if player.current else ""
        await interaction.followup.send(embed=embeds.music("📜 Queue", current + "\n".join(lines)))

    @app_commands.command(name="nowplaying", description="Show the currently playing track with a progress bar.")
    async def nowplaying(self, interaction: discord.Interaction):
        await interaction.response.defer()
        player = music.engine.get_player(interaction.guild.id)
        if not player.current:
            await interaction.followup.send("Nothing is playing right now.", ephemeral=True)
            return
        e = now_playing_embed(player.current)
        dur = player.current.duration or 0
        if dur:
            pos = int(player.position())
            filled = int((min(pos, dur) / dur) * 18)
            bar = "▰" * filled + "▱" * (18 - filled)
            e.add_field(name="⏳ Progress", value=f"{embeds.fmt_duration(pos)} {bar} {embeds.fmt_duration(dur)}", inline=False)
        await interaction.followup.send(embed=e,
                                        view=MusicControls(interaction.guild.id))

    @app_commands.command(name="loop", description="Toggle looping the current track.")
    async def loop(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "loop"):
            return
        player = music.engine.get_player(interaction.guild.id)
        player.loop = not player.loop
        await interaction.followup.send(f"🔁 Loop **{'on' if player.loop else 'off'}**.", ephemeral=True)

    @app_commands.command(name="shuffle", description="Shuffle the queue.")
    async def shuffle(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "shuffle"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if len(player.queue) < 2:
            await interaction.followup.send("Need at least 2 tracks to shuffle.", ephemeral=True)
            return
        items = list(player.queue)
        random.shuffle(items)
        player.queue.clear()
        player.queue.extend(items)
        await interaction.followup.send(f"🔀 Shuffled **{len(items)}** tracks.", ephemeral=True)

    @app_commands.command(name="remove", description="Remove a track from the queue by position.")
    @app_commands.describe(position="Queue position to remove (1 = first)")
    async def remove(self, interaction: discord.Interaction, position: int):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "remove"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if position < 1 or position > len(player.queue):
            await interaction.followup.send("That position isn't in the queue.", ephemeral=True)
            return
        track = player.queue[position - 1]
        del player.queue[position - 1]
        await interaction.followup.send(f"🗑 Removed **{track.title}**.", ephemeral=True)

    @app_commands.command(name="clearqueue", description="Clear the music queue.")
    async def clear_queue(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "clear"):
            return
        player = music.engine.get_player(interaction.guild.id)
        count = len(player.queue)
        player.clear()
        await interaction.followup.send(f"🧹 Cleared **{count}** tracks.", ephemeral=True)

    @app_commands.command(name="volume", description="Set playback volume (1–150).")
    @app_commands.describe(level="Volume percent")
    async def volume(self, interaction: discord.Interaction, level: int):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "volume"):
            return
        try:
            cfg = await music.get_music_config(interaction.guild.id)
            server_max = cfg["maxVolume"]
        except Exception:
            server_max = 150
        if not 1 <= level <= server_max:
            await interaction.followup.send(
                f"Volume must be between 1 and {server_max} on this server.", ephemeral=True)
            return
        player = music.engine.get_player(interaction.guild.id)
        player.volume = level / 100
        player._volume_touched = True
        if player.voice and isinstance(player.voice.source, discord.PCMVolumeTransformer):
            player.voice.source.volume = player.volume
        await interaction.followup.send(f"🔊 Volume **{level}%**.", ephemeral=True)

    @app_commands.command(name="join", description="Summon the bot to your voice channel.")
    async def join(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "join"):
            return
        if not await self._voice_guard(interaction):
            return
        channel = self._voice_channel(interaction)
        player = music.engine.get_player(interaction.guild.id)
        try:
            if player.voice and player.voice.is_connected():
                await player.voice.move_to(channel)
            elif player.voice:
                # Stale handle from a force-disconnect — recreate cleanly.
                player.voice = await channel.connect(self_deaf=True, timeout=15)
            else:
                player.voice = await channel.connect(self_deaf=True, timeout=15)
        except asyncio.TimeoutError:
            await interaction.followup.send("⏱ Voice handshake timed out — Discord didn't respond in time. Try again.", ephemeral=True)
            return
        except discord.ClientException:
            await interaction.followup.send("⚠️ Already connected elsewhere — try `/leave` first.", ephemeral=True)
            return
        except discord.HTTPException as exc:
            await interaction.followup.send(f"⚠️ Discord refused the join ({exc.code if hasattr(exc, 'code') else 'HTTP error'}). Check my Connect/Speak permissions there.", ephemeral=True)
            return
        await interaction.followup.send(f"👋 Joined **{channel.name}**.", ephemeral=True)

    @app_commands.command(name="leave", description="Disconnect and clear the queue.")
    async def leave(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "leave"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if player.voice:
            await player.voice.disconnect(force=True)
            player.voice = None
        player.clear()
        music.engine.remove_player(interaction.guild.id)
        await interaction.followup.send("👋 Left the voice channel.", ephemeral=True)

    @app_commands.command(name="disconnect", description="Disconnect the bot from voice (alias of /leave).")
    async def disconnect(self, interaction: discord.Interaction):
        await self.leave.callback(self, interaction)

    @app_commands.command(name="move", description="Move a queued track to another position.")
    @app_commands.describe(from_position="Current queue position (1 = first)",
                           to_position="New queue position")
    async def move(self, interaction: discord.Interaction, from_position: int, to_position: int):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "move"):
            return
        player = music.engine.get_player(interaction.guild.id)
        if player.move(from_position, to_position):
            await interaction.followup.send(
                f"↕ Moved queue item **#{from_position}** to **#{to_position}**.", ephemeral=True)
        else:
            await interaction.followup.send(
                "Those positions aren't in the queue.", ephemeral=True)

    @app_commands.command(name="filters", description="List or set audio filters (bassboost, nightcore, …).")
    @app_commands.describe(name="Filter name, or 'normal' to reset")
    async def filters(self, interaction: discord.Interaction, name: str = ""):
        await interaction.response.defer(ephemeral=True)
        player = music.engine.get_player(interaction.guild.id)
        choice = (name or "").strip().lower()
        if not choice:
            await interaction.followup.send(
                "Available filters: **normal** (reset), " +
                ", ".join(f"**{f}**" for f in sorted(music.FILTERS)) +
                (f"\nActive now: **{', '.join(player.filters)}**" if player.filters else "\nActive now: normal."),
                ephemeral=True)
            return
        if not await dj_guard(interaction, "filters"):
            return
        if choice in ("normal", "off", "none", "reset"):
            player.filters = []
            await interaction.followup.send(
                "🎚 Filters reset to **normal**. Applies from the next track.", ephemeral=True)
            return
        if choice not in music.FILTERS:
            await interaction.followup.send(
                f"Unknown filter. Available: normal, {', '.join(sorted(music.FILTERS))}.", ephemeral=True)
            return
        if choice not in player.filters:
            player.filters.append(choice)
            player.filters = player.filters[-3:]
        await interaction.followup.send(
            f"🎚 Filter **{choice}** on (active: {', '.join(player.filters)}). Applies from the next track.",
            ephemeral=True)

    @app_commands.command(name="247", description="Toggle 24/7 mode (stay in voice).")
    async def twofortyseven(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not await dj_guard(interaction, "twentyFourSeven"):
            return
        player = music.engine.get_player(interaction.guild.id)
        player.stay_connected = not player.stay_connected
        try:
            cfg = await music.get_music_config(interaction.guild.id)
            if player.stay_connected != bool(cfg.get("twentyFourSeven", False)):
                pass  # runtime toggle wins until the next save pushes config
        except Exception:
            pass
        await interaction.followup.send(
            f"🌙 24/7 mode **{'ON — I stay in voice' if player.stay_connected else 'OFF'}**.", ephemeral=True)

    @app_commands.command(name="search", description="Search YouTube and show the top results.")
    @app_commands.describe(query="What to search for")
    async def search(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer(ephemeral=True)
        if len(query.strip()) < 2:
            await interaction.followup.send("Search for at least 2 characters.", ephemeral=True)
            return
        results = await music.engine.search_top(query.strip(), limit=5)
        if not results:
            await interaction.followup.send("No results — try different words.", ephemeral=True)
            return
        lines = []
        for i, r in enumerate(results, 1):
            dur = f" ({embeds.fmt_duration(r['duration'])})" if r.get("duration") else ""
            lines.append(f"**{i}.** {r['title']}{dur}\n_{r.get('uploader', '')}_")
        await interaction.followup.send(
            embed=embeds.music("🔎 Search results",
                               "\n\n".join(lines) + "\n\nRun `/play` with a title or pick a row on the dashboard to queue it."),
            ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(MusicCog(bot))
