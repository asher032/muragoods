"""mg! legacy prefix commands — a bridge to the same engines the slash commands use."""

import logging

import discord
from discord.ext import commands

import embeds
import music
import utils

log = logging.getLogger("bot.prefix")


def _music_guard(ctx: commands.Context) -> discord.VoiceChannel | None:
    if not ctx.author.voice or not ctx.author.voice.channel:
        return None
    return ctx.author.voice.channel


class PrefixCog(commands.Cog, name="Prefix"):
    """`mg!` prefix versions of the most-used commands."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(name="help")
    async def help_prefix(self, ctx: commands.Context):
        e = embeds.embed("🎬 MuraBot — Help",
                         "Use **slash commands** for the full set, or `mg!` for quick access:\n\n"
                         "`mg!play <song>` • `mg!queue` • `mg!skip` • `mg!pause`\n"
                         "`mg!resume` • `mg!stop` • `mg!nowplaying`\n\n"
                         "Everything else (`/movie`, `/request`, `/rank`, `/ticket`…) is slash-only.",
                         embeds.GOLD)
        await ctx.send(embed=e)

    @commands.command(name="play")
    async def play_prefix(self, ctx: commands.Context, *, query: str = ""):
        if not query:
            await ctx.send(embed=embeds.embed("🎵 Usage", "`mg!play <song name or URL>`", embeds.WARN))
            return
        channel = _music_guard(ctx)
        if not channel:
            await ctx.send(embed=embeds.music(
                "🎧 Voice Channel Detection",
                "You need to join a voice channel first — I play where **you** are."))
            return
        try:
            perm_check = music.check_voice_permissions(channel, ctx.guild.me)
        except Exception:
            perm_check = {"all_granted": False, "missing": ["connect", "speak"]}
        if not perm_check.get("all_granted"):
            missing = ", ".join(perm_check.get("missing") or ["Connect", "Speak"])
            await ctx.send(embed=embeds.embed(
                "🚫 Missing Permission",
                f"The bot does not have the required voice-channel permissions "
                f"(missing: **{missing}**). I need **View Channel**, **Connect** and **Speak**.",
                embeds.WARN))
            return
        async with ctx.typing():
            track = await music.engine.resolve(query)
            if not track:
                err_detail = music.engine.get_resolve_error()
                if err_detail:
                    await ctx.send(embed=embeds.embed(
                        "🔎 Track Not Found",
                        f"yt-dlp: {err_detail}\nTry a different search or a direct URL.", embeds.WARN))
                else:
                    await ctx.send(embed=embeds.embed(
                        "🔎 Track Not Found", "Try another search.", embeds.WARN))
                return
            track.requester = ctx.author
            player = music.engine.get_player(ctx.guild.id)
            position = player.enqueue(track)
            if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
                await ctx.send(embed=embeds.music(
                    "➕ Queued", f"**{track.title}** — position **{position}**"))
                return
            try:
                await music.engine.play_now(player, track, channel,
                                            requested_title=query)
            except music.PlaybackError as exc:
                log.warning("Prefix playback classified fail code=%s stage=%s",
                            exc.code, exc.stage)
                await ctx.send(embed=embeds.embed(
                    exc.user_title, exc.user_message, embeds.ERROR))
                return
            except Exception as exc:
                log.exception("Prefix playback failed")
                code = music.classify_playback_exception(exc)
                title, msg = music.PLAYBACK_USER_MESSAGES.get(
                    code, music.PLAYBACK_USER_MESSAGES[music.UNKNOWN_PLAYBACK_ERROR])
                await ctx.send(embed=embeds.embed(title, msg, embeds.ERROR))
                return
            e = embeds.music("🎵 NOW PLAYING", f"**{track.title}**\n{track.uploader}")
            if track.thumbnail:
                e.set_thumbnail(url=track.thumbnail)
            await ctx.send(embed=e)

    @commands.command(name="queue")
    async def queue_prefix(self, ctx: commands.Context):
        player = music.engine.get_player(ctx.guild.id)
        if not player.queue:
            await ctx.send(embed=embeds.music("📜 Queue", "Empty — add something with `mg!play`."))
            return
        lines = [f"**{i}.** {t}" for i, t in enumerate(list(player.queue)[:10], 1)]
        current = f"**Now:** {player.current}\n\n" if player.current else ""
        await ctx.send(embed=embeds.music("📜 Queue", current + "\n".join(lines)))

    @commands.command(name="skip")
    async def skip_prefix(self, ctx: commands.Context):
        player = music.engine.get_player(ctx.guild.id)
        if player.voice and (player.voice.is_playing() or player.voice.is_paused()):
            player.voice.stop()
            await ctx.send("⏭ Skipped.")
        else:
            await ctx.send("Nothing is playing.")

    @commands.command(name="pause")
    async def pause_prefix(self, ctx: commands.Context):
        player = music.engine.get_player(ctx.guild.id)
        if player.voice and player.voice.is_playing():
            player.voice.pause()
            await ctx.send("⏸ Paused.")
        else:
            await ctx.send("Nothing is playing.")

    @commands.command(name="resume")
    async def resume_prefix(self, ctx: commands.Context):
        player = music.engine.get_player(ctx.guild.id)
        if player.voice and player.voice.is_paused():
            player.voice.resume()
            await ctx.send("▶️ Resumed.")
        else:
            await ctx.send("Nothing is paused.")

    @commands.command(name="stop")
    async def stop_prefix(self, ctx: commands.Context):
        player = music.engine.get_player(ctx.guild.id)
        player.clear()
        if player.voice:
            player.voice.stop()
            player.playing = False
        await ctx.send(embed=embeds.music("⏹ Stopped", "Queue cleared."))

    @commands.command(name="nowplaying", aliases=["np"])
    async def nowplaying_prefix(self, ctx: commands.Context):
        player = music.engine.get_player(ctx.guild.id)
        if not player.current:
            await ctx.send("Nothing is playing right now.")
            return
        t = player.current
        e = embeds.music("🎵 NOW PLAYING", f"**{t.title}**\n{t.uploader}")
        if t.thumbnail:
            e.set_thumbnail(url=t.thumbnail)
        await ctx.send(embed=e)


async def setup(bot: commands.Bot):
    await bot.add_cog(PrefixCog(bot))
