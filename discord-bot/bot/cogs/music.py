"""Music slash commands — full queue/controls, friendly errors, no crashes."""

import asyncio
import logging

import discord
from discord import app_commands
from discord.ext import commands

import music
import utils

log = logging.getLogger("bot.music_cmds")


def _fmt_duration(seconds: int) -> str:
    if seconds <= 0:
        return "live/unknown"
    mins, secs = divmod(seconds, 60)
    hours, mins = divmod(mins, 60)
    if hours:
        return f"{hours}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def now_playing_embed(track: music.Track) -> discord.Embed:
    embed = utils.base_embed("🎵 NOW PLAYING", color=0x9B59B6)
    embed.description = f"**{track.title}**\n{track.uploader}"
    if track.duration:
        embed.add_field(name="⏱ Duration", value=_fmt_duration(track.duration), inline=True)
    embed.add_field(name="🙋 Requested by", value=track.requester.mention if track.requester else "—", inline=True)
    if track.thumbnail:
        embed.set_thumbnail(url=track.thumbnail)
    return embed


class MusicView(discord.ui.View):
    """Buttons on the now-playing message."""

    def __init__(self, cog: "MusicCog", guild_id: int):
        super().__init__(timeout=600)
        self.cog = cog
        self.guild_id = guild_id

    async def _get_ctx(self, interaction: discord.Interaction):
        player = music.engine.get_player(self.guild_id)
        return player

    @discord.ui.button(label="Pause", style=discord.ButtonStyle.secondary, emoji="⏸")
    async def pause(self, interaction: discord.Interaction, button: discord.ui.Button):
        player = music.engine.get_player(self.guild_id)
        if player.voice and player.voice.is_playing():
            player.voice.pause()
            await interaction.response.send_message("⏸ Paused.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing is playing.", ephemeral=True)

    @discord.ui.button(label="Resume", style=discord.ButtonStyle.secondary, emoji="▶️")
    async def resume(self, interaction: discord.Interaction, button: discord.ui.Button):
        player = music.engine.get_player(self.guild_id)
        if player.voice and player.voice.is_paused():
            player.voice.resume()
            await interaction.response.send_message("▶️ Resumed.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing is paused.", ephemeral=True)

    @discord.ui.button(label="Skip", style=discord.ButtonStyle.primary, emoji="⏭")
    async def skip(self, interaction: discord.Interaction, button: discord.ui.Button):
        player = music.engine.get_player(self.guild_id)
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            player.voice.stop()  # triggers _after → next track
            await interaction.response.send_message("⏭ Skipped.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing to skip.", ephemeral=True)

    @discord.ui.button(label="Queue", style=discord.ButtonStyle.secondary, emoji="📜")
    async def queue_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        player = music.engine.get_player(self.guild_id)
        if not player.queue:
            await interaction.response.send_message("The queue is empty.", ephemeral=True)
            return
        lines = [f"**{i}.** {t}" for i, t in enumerate(list(player.queue)[:10], 1)]
        await interaction.response.send_message(
            embed=utils.base_embed("📜 Queue", "\n".join(lines)), ephemeral=True)

    @discord.ui.button(label="Loop", style=discord.ButtonStyle.secondary, emoji="🔁")
    async def loop_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        player = music.engine.get_player(self.guild_id)
        player.loop = not player.loop
        state = "on — current track repeats" if player.loop else "off"
        await interaction.response.send_message(f"🔁 Loop is {state}.", ephemeral=True)


class MusicCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        music.engine.bot_loop = asyncio.get_running_loop()

    @staticmethod
    def _user_in_voice(interaction: discord.Interaction) -> discord.VoiceChannel | None:
        if not interaction.user.voice or not interaction.user.voice.channel:
            return None
        return interaction.user.voice.channel

    async def _ensure_voice_perms(self, interaction: discord.Interaction, channel: discord.abc.GuildChannel) -> str | None:
        me = interaction.guild.me
        perms = channel.permissions_for(me)
        if not perms.connect:
            return "I need **Connect** permission in that voice channel."
        if not perms.speak:
            return "I need **Speak** permission in that voice channel."
        return None

    @app_commands.command(name="play", description="Play a song (search or URL).")
    @app_commands.describe(query="Song name or URL")
    async def play(self, interaction: discord.Interaction, query: str):
        channel = self._user_in_voice(interaction)
        if not channel:
            await interaction.response.send_message(
                "Join a voice channel first, then run `/play`.", ephemeral=True)
            return
        perm_error = await self._ensure_voice_perms(interaction, channel)
        if perm_error:
            await interaction.response.send_message(perm_error, ephemeral=True)
            return
        await interaction.response.defer()
        track = await music.engine.resolve(query)
        if not track:
            await interaction.followup.send(
                embed=utils.base_embed("🎵 No results", f"Couldn't find or play **{query}**. Try another search."))
            return
        track.requester = interaction.user
        player = music.engine.get_player(interaction.guild.id)
        position = player.enqueue(track)
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            await interaction.followup.send(
                embed=utils.base_embed("➕ Queued", f"**{track.title}** — position **{position}** in queue."))
            return
        await music.engine.play_now(player, track, channel)
        embed = now_playing_embed(track)
        view = MusicView(self, interaction.guild.id)
        msg = await interaction.followup.send(embed=embed, view=view)
        player.now_playing_message = msg

    @app_commands.command(name="searchmusic", description="Search YouTube for tracks to pick from.")
    @app_commands.describe(query="What to search for")
    async def searchmusic(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer()
        track = await music.engine.resolve(query)
        if not track:
            await interaction.followup.send(
                embed=utils.base_embed("🎵 No results", f"Nothing found for **{query}**."))
            return
        embed = utils.base_embed("🎵 Top result", f"**{track.title}**\n{track.uploader}")
        view = discord.ui.View()
        yt_link = track.url or f"https://www.youtube.com/results?search_query={query}"
        view.add_item(discord.ui.Button(label="🎧 Open track", url=yt_link))
        await interaction.followup.send(embed=embed, view=view)

    @app_commands.command(name="skip", description="Skip the current song.")
    async def skip(self, interaction: discord.Interaction):
        player = music.engine.get_player(interaction.guild.id)
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            player.voice.stop()
            await interaction.response.send_message("⏭ Skipped.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing is playing.", ephemeral=True)

    @app_commands.command(name="pause", description="Pause playback.")
    async def pause(self, interaction: discord.Interaction):
        player = music.engine.get_player(interaction.guild.id)
        if player.voice and player.voice.is_playing():
            player.voice.pause()
            await interaction.response.send_message("⏸ Paused.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing is playing.", ephemeral=True)

    @app_commands.command(name="resume", description="Resume playback.")
    async def resume(self, interaction: discord.Interaction):
        player = music.engine.get_player(interaction.guild.id)
        if player.voice and player.voice.is_paused():
            player.voice.resume()
            await interaction.response.send_message("▶️ Resumed.", ephemeral=True)
        else:
            await interaction.response.send_message("Nothing is paused.", ephemeral=True)

    @app_commands.command(name="stop", description="Stop playback and clear the queue.")
    async def stop(self, interaction: discord.Interaction):
        player = music.engine.get_player(interaction.guild.id)
        player.clear()
        if player.voice:
            player.voice.stop()
            player.playing = False
        await interaction.response.send_message("⏹ Stopped and cleared the queue.")

    @app_commands.command(name="queue", description="Show the current queue.")
    async def queue(self, interaction: discord.Interaction):
        player = music.engine.get_player(interaction.guild.id)
        if not player.queue:
            await interaction.response.send_message("The queue is empty — add something with `/play`.")
            return
        lines = [f"**{i}.** {t}" for i, t in enumerate(list(player.queue)[:10], 1)]
        if len(player.queue) > 10:
            lines.append(f"…and {len(player.queue) - 10} more")
        embed = utils.base_embed("📜 Queue", "\n".join(lines))
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="nowplaying", description="Show the currently playing track.")
    async def nowplaying(self, interaction: discord.Interaction):
        player = music.engine.get_player(interaction.guild.id)
        if not player.current:
            await interaction.response.send_message("Nothing is playing right now.")
            return
        embed = now_playing_embed(player.current)
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="loop", description="Toggle looping the current track.")
    async def loop(self, interaction: discord.Interaction):
        player = music.engine.get_player(interaction.guild.id)
        player.loop = not player.loop
        state = "on — current track repeats" if player.loop else "off"
        await interaction.response.send_message(f"🔁 Loop is {state}.")

    @app_commands.command(name="shuffle", description="Shuffle the queue.")
    async def shuffle(self, interaction: discord.Interaction):
        import random
        player = music.engine.get_player(interaction.guild.id)
        if len(player.queue) < 2:
            await interaction.response.send_message("Need at least 2 tracks to shuffle.", ephemeral=True)
            return
        items = list(player.queue)
        random.shuffle(items)
        player.queue.clear()
        player.queue.extend(items)
        await interaction.response.send_message(f"🔀 Shuffled {len(items)} tracks.")

    @app_commands.command(name="remove", description="Remove a track from the queue by position.")
    @app_commands.describe(position="Queue position to remove (1 = first)")
    async def remove(self, interaction: discord.Interaction, position: int):
        player = music.engine.get_player(interaction.guild.id)
        if position < 1 or position > len(player.queue):
            await interaction.response.send_message("That position isn't in the queue.", ephemeral=True)
            return
        track = player.queue[position - 1]
        del player.queue[position - 1]
        await interaction.response.send_message(f"🗑 Removed **{track.title}**.")

    @app_commands.command(name="clearqueue", description="Clear the music queue (moderation /clear is separate).")
    async def clear_queue(self, interaction: discord.Interaction):
        player = music.engine.get_player(interaction.guild.id)
        count = len(player.queue)
        player.clear()
        await interaction.response.send_message(f"🧹 Cleared {count} tracks.")

    @app_commands.command(name="volume", description="Set playback volume (1–150).")
    @app_commands.describe(level="Volume percent")
    async def volume(self, interaction: discord.Interaction, level: int):
        if not 1 <= level <= 150:
            await interaction.response.send_message("Volume must be between 1 and 150.", ephemeral=True)
            return
        player = music.engine.get_player(interaction.guild.id)
        player.volume = level / 100
        if player.voice and player.voice.source:
            if isinstance(player.voice.source, discord.PCMVolumeTransformer):
                player.voice.source.volume = player.volume
        await interaction.response.send_message(f"🔊 Volume set to {level}%.")

    @app_commands.command(name="join", description="Summon the bot to your voice channel.")
    async def join(self, interaction: discord.Interaction):
        channel = self._user_in_voice(interaction)
        if not channel:
            await interaction.response.send_message("Join a voice channel first.", ephemeral=True)
            return
        perm_error = await self._ensure_voice_perms(interaction, channel)
        if perm_error:
            await interaction.response.send_message(perm_error, ephemeral=True)
            return
        player = music.engine.get_player(interaction.guild.id)
        if player.voice:
            await player.voice.move_to(channel)
        else:
            player.voice = await channel.connect(self_deaf=True)
        await interaction.response.send_message(f"👋 Joined **{channel.name}**.")

    @app_commands.command(name="leave", description="Disconnect and clear the queue.")
    async def leave(self, interaction: discord.Interaction):
        player = music.engine.get_player(interaction.guild.id)
        if player.voice:
            await player.voice.disconnect(force=True)
            player.voice = None
        player.clear()
        music.engine.remove_player(interaction.guild.id)
        await interaction.response.send_message("👋 Left the voice channel.")


async def setup(bot: commands.Bot):
    await bot.add_cog(MusicCog(bot))
