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
                         "`mg!resume` • `mg!stop` • `mg!nowplaying`\n"
                         "`mg!warn @user reason` • `mg!warnings @user` • `mg!kick` • `mg!ban`\n"
                         "`mg!timeout @user minutes` • `mg!unban <id>` • `mg!case <id>`\n\n"
                         "Everything else (`/movie`, `/request`, `/rank`, `/ticket`…) is slash-only.",
                         embeds.GOLD)
        await ctx.send(embed=e)

    # ── Moderation (same guards as the slash commands) ──────────────
    def _mod_perms(self, ctx: commands.Context, *required: str) -> str | None:
        perms = ctx.author.guild_permissions
        if not any(getattr(perms, r, False) for r in required):
            return "You don't have permission for that."
        return None

    def _mod_target(self, ctx: commands.Context, user) -> str | None:
        if user is None or isinstance(user, str) or not hasattr(user, "id"):
            return "Mention a server member: `mg!warn @user reason`."
        if user.id == ctx.author.id:
            return "You can't moderate yourself."
        if getattr(user, "bot", False):
            return "Bots can't be moderated this way."
        if user.id == ctx.guild.owner_id:
            return "You can't moderate the server owner."
        if ctx.author.id != ctx.guild.owner_id and user.top_role >= ctx.author.top_role:
            return "Their highest role is at or above yours."
        if user.top_role >= ctx.guild.me.top_role:
            return "Their highest role is at or above mine."
        return None

    @commands.command(name="warn")
    async def warn_prefix(self, ctx: commands.Context, user: discord.Member | None = None, *, reason: str = ""):
        if err := self._mod_perms(ctx, "manage_guild", "moderate_members", "kick_members", "ban_members"):
            await ctx.send(err)
            return
        if err := self._mod_target(ctx, user):
            await ctx.send(err)
            return
        if not reason.strip():
            await ctx.send("Give a reason: `mg!warn @user spamming`.")
            return
        import database
        assert user is not None
        count = await database.add_warning(ctx.guild.id, user.id, ctx.author.id, reason[:300])
        case_id = await database.add_case(ctx.guild.id, user.id, ctx.author.id, "warn", reason[:300])
        await ctx.send(embed=embeds.embed("⚠️ Warning issued",
                                          f"{user.mention} — warning **#{count}** (case **#{case_id}**)\nReason: {reason[:300]}"))

    @commands.command(name="warnings")
    async def warnings_prefix(self, ctx: commands.Context, user: discord.Member | None = None):
        if user is None or isinstance(user, str) or not hasattr(user, "id"):
            await ctx.send("Mention a member: `mg!warnings @user`.")
            return
        if user.id != ctx.author.id:
            if err := self._mod_perms(ctx, "manage_guild", "moderate_members", "kick_members", "ban_members"):
                await ctx.send("Moderators only — you can only check your own warnings.")
                return
        import database
        entries = await database.get_warnings(ctx.guild.id, user.id)
        if not entries:
            await ctx.send(f"{user.mention} has a clean record ✨")
            return
        lines = [f"**{i}.** {e['reason']} — <@{e['moderatorId']}>" for i, e in enumerate(entries, 1)]
        await ctx.send(embed=embeds.embed(f"⚠️ Warnings — {user.display_name}", "\n".join(lines)[:2000]))

    @commands.command(name="kick")
    async def kick_prefix(self, ctx: commands.Context, user: discord.Member | None = None, *, reason: str = "No reason given"):
        if err := self._mod_perms(ctx, "kick_members"):
            await ctx.send(err)
            return
        if err := self._mod_target(ctx, user):
            await ctx.send(err)
            return
        import database
        assert user is not None
        try:
            await user.kick(reason=f"By {ctx.author}: {reason[:150]}")
        except discord.Forbidden:
            await ctx.send("I lack permission to kick that member.")
            return
        case_id = await database.add_case(ctx.guild.id, user.id, ctx.author.id, "kick", reason[:300])
        await ctx.send(embed=embeds.embed("👢 Kicked", f"{user.mention} — {reason[:300]} (case **#{case_id}**)"))

    @commands.command(name="ban")
    async def ban_prefix(self, ctx: commands.Context, user: discord.Member | None = None, *, reason: str = "No reason given"):
        if err := self._mod_perms(ctx, "ban_members"):
            await ctx.send(err)
            return
        if err := self._mod_target(ctx, user):
            await ctx.send(err)
            return
        import database
        assert user is not None
        try:
            await user.ban(reason=f"By {ctx.author}: {reason[:150]}", delete_message_days=0)
        except discord.Forbidden:
            await ctx.send("I lack permission to ban that member.")
            return
        case_id = await database.add_case(ctx.guild.id, user.id, ctx.author.id, "ban", reason[:300])
        await ctx.send(embed=embeds.embed("🔨 Banned", f"{user.mention} — {reason[:300]} (case **#{case_id}**)"))

    @commands.command(name="unban")
    async def unban_prefix(self, ctx: commands.Context, user_id: str = ""):
        if err := self._mod_perms(ctx, "ban_members"):
            await ctx.send(err)
            return
        import database
        try:
            user = await self.bot.fetch_user(int(user_id))
            await ctx.guild.unban(user)
        except (ValueError, discord.NotFound):
            await ctx.send("User not found in the ban list.")
            return
        except discord.Forbidden:
            await ctx.send("I lack permission to unban.")
            return
        case_id = await database.add_case(ctx.guild.id, user.id, ctx.author.id, "unban",
                                          f"Unbanned by {ctx.author}")
        await ctx.send(embed=embeds.embed("✅ Unbanned", f"{user.mention} can rejoin. (case **#{case_id}**)"))

    @commands.command(name="timeout")
    async def timeout_prefix(self, ctx: commands.Context, user: discord.Member | None = None, minutes: int = 10):
        if err := self._mod_perms(ctx, "moderate_members"):
            await ctx.send(err)
            return
        if err := self._mod_target(ctx, user):
            await ctx.send(err)
            return
        from datetime import timedelta as _td
        minutes = max(1, min(int(minutes), 40320))
        import database
        assert user is not None
        try:
            await user.timeout(discord.utils.utcnow() + _td(minutes=minutes),
                               reason=f"By {ctx.author}")
        except discord.Forbidden:
            await ctx.send("I lack permission to timeout that member.")
            return
        case_id = await database.add_case(ctx.guild.id, user.id, ctx.author.id, "timeout",
                                          f"By {ctx.author}", f"{minutes}m")
        await ctx.send(embed=embeds.embed("🔇 Timed out", f"{user.mention} for **{minutes}** minutes. (case **#{case_id}**)"))

    @commands.command(name="case")
    async def case_prefix(self, ctx: commands.Context, case_id: int = 0):
        import database
        doc = await database.get_case(ctx.guild.id, case_id) if case_id > 0 else None
        if not doc:
            await ctx.send(f"No case **#{case_id}** in this server.")
            return
        await ctx.send(embed=embeds.embed(
            f"📋 Case #{doc.get('caseId')}",
            f"**Action:** {str(doc.get('action', '?')).upper()}\n"
            f"**Target:** <@{doc.get('targetId')}>\n**Reason:** {str(doc.get('reason') or '')[:300]}"))

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
