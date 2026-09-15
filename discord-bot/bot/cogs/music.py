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
