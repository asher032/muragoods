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


class MusicControls(utils.SafeView):
    """Buttons on the now-playing message (timeout → edit to expired)."""

    def __init__(self, guild_id: int):
        super().__init__(timeout=900)
        self.guild_id = guild_id

    def _player(self) -> music.GuildPlayer:
        return music.engine.get_player(self.guild_id)

    @discord.ui.button(emoji="⏸", style=discord.ButtonStyle.secondary)
    async def pause(self, interaction: discord.Interaction, button: discord.ui.Button):
        player = self._player()
        if player.voice and player.voice.is_playing():
            player.voice.pause()
            await interaction.response.send_message("⏸ Paused.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing is playing.", ephemeral=True)

    @discord.ui.button(emoji="▶️", style=discord.ButtonStyle.secondary)
    async def resume(self, interaction: discord.Interaction, button: discord.ui.Button):
        player = self._player()
        if player.voice and player.voice.is_paused():
            player.voice.resume()
            await interaction.response.send_message("▶️ Resumed.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing is paused.", ephemeral=True)

    @discord.ui.button(emoji="⏭", style=discord.ButtonStyle.primary)
    async def skip(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer()
        player = self._player()
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            player.voice.stop()
        else:
            await interaction.followup.send("Nothing to skip.", ephemeral=True)

    @discord.ui.button(emoji="🔁", style=discord.ButtonStyle.secondary)
    async def loop_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
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
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @staticmethod
    def _voice_channel(interaction: discord.Interaction):
        if not isinstance(interaction.user, discord.Member) or not interaction.user.voice:
            return None
        return interaction.user.voice.channel

    async def _voice_guard(self, interaction: discord.Interaction) -> bool:
        """Common voice checks. Responds and returns False if blocked."""
        channel = self._voice_channel(interaction)
        if not channel:
            await interaction.followup.send(embed=embeds.music(
                "🎵 Music", "You need to join a voice channel first."), ephemeral=True)
            return False
        perms = channel.permissions_for(interaction.guild.me)
        if not perms.connect or not perms.speak:
            await interaction.followup.send(embed=embeds.embed(
                "⚠️ Missing Permission",
                "I need **Connect** and **Speak** in that voice channel.",
                embeds.WARN), ephemeral=True)
            return False
        return True

    @app_commands.command(name="play", description="Play a song (search or URL).")
    @app_commands.describe(query="Song name or URL")
    async def play(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer()
        if not await self._voice_guard(interaction):
            return
        await interaction.followup.send(embed=embeds.music("🔎 Searching…", f"`{query[:80]}`"))
        track = await music.engine.resolve(query)
        if not track:
            await interaction.edit_original_response(embed=embeds.embed(
                "🔎 Track Not Found", "Try another search.", embeds.WARN))
            return
        track.requester = interaction.user
        player = music.engine.get_player(interaction.guild.id)
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
            await music.engine.play_now(player, track, channel)
        except Exception:
            log.exception("Playback failed")
            await interaction.edit_original_response(embed=embeds.embed(
                "⚠️ Playback Error", "The audio service couldn't start playback.", embeds.ERROR))
            return
        embed = now_playing_embed(track)
        view = MusicControls(interaction.guild.id)
        try:
            await interaction.edit_original_response(embed=embed, view=view)
        except discord.HTTPException:
            await interaction.followup.send(embed=embed, view=view)

    @app_commands.command(name="previous", description="Play the previous track again.")
    async def previous(self, interaction: discord.Interaction):
        await interaction.response.defer()
        player = music.engine.get_player(interaction.guild.id)
        if not player.voice or not player.voice.channel:
            await interaction.followup.send("I'm not in a voice channel.", ephemeral=True)
            return
        prev = player.previous()
        if not prev:
            await interaction.followup.send("No history yet — play something first.", ephemeral=True)
            return
        try:
            await music.engine.play_now(player, prev, player.voice.channel)
        except Exception:
            log.exception("Previous-track playback failed")
            await interaction.followup.send(embed=embeds.embed(
                "⚠️ Playback Error", "Couldn't restart that track.", embeds.ERROR))
            return
        await interaction.followup.send(embed=embeds.music(
            "⏮ Previous", f"**{prev.title}**"))

    @app_commands.command(name="replay", description="Restart the current track.")
    async def replay(self, interaction: discord.Interaction):
        await interaction.response.defer()
        player = music.engine.get_player(interaction.guild.id)
        if not player.current or not player.voice or not player.voice.channel:
            await interaction.followup.send("Nothing is playing.", ephemeral=True)
            return
        try:
            await music.engine.play_now(player, player.current, player.voice.channel)
        except Exception:
            log.exception("Replay failed")
            await interaction.followup.send(embed=embeds.embed(
                "⚠️ Playback Error", "Couldn't restart that track.", embeds.ERROR))
            return
        await interaction.followup.send(embed=embeds.music(
            "🔁 Replay", f"**{player.current.title}** from the top."))

    @app_commands.command(name="seek", description="Seek to a timestamp (e.g. 1:30 or 90).")
    @app_commands.describe(position="Timestamp like 1:30 or seconds")
    async def seek(self, interaction: discord.Interaction, position: str):
        await interaction.response.defer(ephemeral=True)
        player = music.engine.get_player(interaction.guild.id)
        if not player.voice or not player.voice.is_playing():
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
        # discord.py's VoiceClient.seek works on seekable FFmpeg sources.
        try:
            player.voice.seek(seconds)
            await interaction.followup.send(f"⏩ Seeked to `{position}`.", ephemeral=True)
        except (NotImplementedError, AttributeError):
            await interaction.followup.send(
                "This stream doesn't support seeking — use `/forward` or skip instead.", ephemeral=True)

    @app_commands.command(name="forward", description="Skip forward N seconds (default 10).")
    @app_commands.describe(seconds="How many seconds")
    async def forward(self, interaction: discord.Interaction, seconds: int = 10):
        await interaction.response.defer(ephemeral=True)
        player = music.engine.get_player(interaction.guild.id)
        # FFmpeg PCM sources can be seeked via the stream timestamp when the
        # source exposes it; otherwise guide the user to /seek.
        if player.voice and player.voice.is_playing():
            await interaction.followup.send(
                f"Use `/seek <timestamp>` — position tracking depends on the source.",
                ephemeral=True)
        else:
            await interaction.followup.send("Nothing is playing.", ephemeral=True)

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
        player = music.engine.get_player(interaction.guild.id)
        player.autoplay = not player.autoplay
        await interaction.followup.send(
            f"▶️ Autoplay **{'on' if player.autoplay else 'off'}**.", ephemeral=True)

    @app_commands.command(name="queueloop", description="Toggle looping the whole queue.")
    async def queueloop(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
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
            await music.engine.play_now(player, track, channel)
        except Exception:
            log.exception("Radio playback failed")
            await interaction.edit_original_response(embed=embeds.embed(
                "⚠️ Playback Error", "The audio service couldn't start playback.", embeds.ERROR))
            return
        await interaction.edit_original_response(embed=embeds.music(
            f"📻 {genre.name} Radio", f"Now streaming **{track.title}**\nAutoplay enabled — the music never stops."))

    @app_commands.command(name="searchmusic", description="Preview the top result for a search.")
    @app_commands.describe(query="What to search for")
    async def searchmusic(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer()
        track = await music.engine.resolve(query)
        if not track:
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
        await interaction.response.defer(ephemeral=True)
        player = music.engine.get_player(interaction.guild.id)
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            player.voice.stop()
            await interaction.followup.send("⏭ Skipped.", ephemeral=True)
        else:
            await interaction.followup.send("Nothing is playing.", ephemeral=True)

    @app_commands.command(name="pause", description="Pause playback.")
    async def pause(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        player = music.engine.get_player(interaction.guild.id)
        if player.voice and player.voice.is_playing():
            player.voice.pause()
            await interaction.followup.send("⏸ Paused.", ephemeral=True)
        else:
            await interaction.followup.send("Nothing is playing.", ephemeral=True)

    @app_commands.command(name="resume", description="Resume playback.")
    async def resume(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        player = music.engine.get_player(interaction.guild.id)
        if player.voice and player.voice.is_paused():
            player.voice.resume()
            await interaction.followup.send("▶️ Resumed.", ephemeral=True)
        else:
            await interaction.followup.send("Nothing is paused.", ephemeral=True)

    @app_commands.command(name="stop", description="Stop playback and clear the queue.")
    async def stop(self, interaction: discord.Interaction):
        await interaction.response.defer()
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

    @app_commands.command(name="nowplaying", description="Show the currently playing track.")
    async def nowplaying(self, interaction: discord.Interaction):
        await interaction.response.defer()
        player = music.engine.get_player(interaction.guild.id)
        if not player.current:
            await interaction.followup.send("Nothing is playing right now.", ephemeral=True)
            return
        await interaction.followup.send(embed=now_playing_embed(player.current),
                                        view=MusicControls(interaction.guild.id))

    @app_commands.command(name="loop", description="Toggle looping the current track.")
    async def loop(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        player = music.engine.get_player(interaction.guild.id)
        player.loop = not player.loop
        await interaction.followup.send(f"🔁 Loop **{'on' if player.loop else 'off'}**.", ephemeral=True)

    @app_commands.command(name="shuffle", description="Shuffle the queue.")
    async def shuffle(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
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
        player = music.engine.get_player(interaction.guild.id)
        count = len(player.queue)
        player.clear()
        await interaction.followup.send(f"🧹 Cleared **{count}** tracks.", ephemeral=True)

    @app_commands.command(name="volume", description="Set playback volume (1–150).")
    @app_commands.describe(level="Volume percent")
    async def volume(self, interaction: discord.Interaction, level: int):
        await interaction.response.defer(ephemeral=True)
        if not 1 <= level <= 150:
            await interaction.followup.send("Volume must be between 1 and 150.", ephemeral=True)
            return
        player = music.engine.get_player(interaction.guild.id)
        player.volume = level / 100
        if player.voice and isinstance(player.voice.source, discord.PCMVolumeTransformer):
            player.voice.source.volume = player.volume
        await interaction.followup.send(f"🔊 Volume **{level}%**.", ephemeral=True)

    @app_commands.command(name="join", description="Summon the bot to your voice channel.")
    async def join(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not await self._voice_guard(interaction):
            return
        channel = self._voice_channel(interaction)
        player = music.engine.get_player(interaction.guild.id)
        try:
            if player.voice:
                await player.voice.move_to(channel)
            else:
                player.voice = await channel.connect(self_deaf=True)
        except discord.HTTPException:
            await interaction.followup.send("Couldn't join that channel.", ephemeral=True)
            return
        await interaction.followup.send(f"👋 Joined **{channel.name}**.", ephemeral=True)

    @app_commands.command(name="leave", description="Disconnect and clear the queue.")
    async def leave(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        player = music.engine.get_player(interaction.guild.id)
        if player.voice:
            await player.voice.disconnect(force=True)
            player.voice = None
        player.clear()
        music.engine.remove_player(interaction.guild.id)
        await interaction.followup.send("👋 Left the voice channel.", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(MusicCog(bot))
