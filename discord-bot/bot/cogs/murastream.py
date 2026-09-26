"""MuraStream media commands — ack-first lifecycle, embed design system."""

import logging
from typing import Any

import discord
from discord import app_commands
from discord.ext import commands

import bridge
import config
import embeds
from gateway_util import gateway_latency_ms
import tmdb
import ui
import utils

log = logging.getLogger("bot.murastream")


class MediaCommands(commands.Cog):
    """Top-level media commands."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    # ── internal helper: always-defer-then-work ──────────────────────
    @staticmethod
    async def _guarded(interaction: discord.Interaction, bucket: str) -> bool:
        """Defer first (ack within ms), then apply the rate limit."""
        await interaction.response.defer()
        if interaction.user.id not in config.BOT_ADMIN_IDS and utils.on_cooldown(interaction.user.id, bucket):
            await interaction.followup.send(
                embed=embeds.embed("⏳ Slow down", "Please try again in a few seconds.", embeds.WARN),
                ephemeral=True)
            return False
        return True

    @app_commands.command(name="help", description="Show everything MuraBot can do.")
    async def help_command(self, interaction: discord.Interaction):
        e = embeds.embed("🎬 MuraBot — Help",
                         "Your all-in-one MuraStream companion.", embeds.GOLD)
        e.add_field(name="🎬 MuraStream", value=(
            "`/search` `/movie` `/tv` `/anime` `/trending` `/popular`\n"
            "`/recommend` `/watch` `/watchlist` `/request` `/requests`\n"
            "`/watchtogether` `/comments`"), inline=False)
        e.add_field(name="🎵 Music", value=(
            "`/play` `/searchmusic` `/skip` `/pause` `/resume` `/stop`\n"
            "`/queue` `/nowplaying` `/loop` `/shuffle` `/remove`\n"
            "`/clearqueue` `/volume` `/join` `/leave`"), inline=False)
        e.add_field(name="🛡️ Moderation", value=(
            "`/warn` `/warnings` `/clearwarnings` `/kick` `/ban` `/unban`\n"
            "`/mute` `/unmute` `/clear` `/lock` `/unlock` `/case` `/cases`"), inline=False)
        e.add_field(name="🔐 Security", value=(
            "`/security raidmode` `/security lockdown` `/security unlock`\n"
            "`/security status` — anti-raid & anti-nuke"), inline=False)
        e.add_field(name="🎁 Community", value=(
            "`/giveaway` `/reroll` `/suggest` `/suggestions` `/report`\n"
            "`/remind` `/rep` `/repleaderboard` `/achievements`"), inline=False)
        e.add_field(name="🎵 Music — advanced", value=(
            "`/previous` `/replay` `/seek` `/history` `/autoplay` `/queueloop`\n"
            "`/savequeue` `/loadqueue` `/savedqueues` `/queuepage` `/radio`"), inline=False)
        e.add_field(name="📊 Leveling & Economy", value=(
            "`/rank` `/leaderboard` `/balance` `/daily` `/pay` `/shop`"), inline=False)
        e.add_field(name="🎮 Fun", value=(
            "`/8ball` `/coinflip` `/roll` `/poll` `/choose` `/avatar`\n"
            "`/userinfo` `/serverinfo`"), inline=False)
        e.add_field(name="🎟️ Tickets", value="`/ticket` — open a support ticket", inline=False)
        e.add_field(name="ℹ️ Utility", value="`/status` `/ping` `/dashboard` — health & web dashboard", inline=False)
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="🎬 Open MuraStream", url=bridge.home_url(), emoji="▶️"))
        view.add_item(discord.ui.Button(label="📜 Terms", url=f"{config.MURASTREAM_URL}/terms", emoji="📄"))
        view.add_item(discord.ui.Button(label="🔐 Privacy", url=f"{config.MURASTREAM_URL}/privacy", emoji="🔐"))
        await interaction.response.send_message(embed=e, view=view)

    @app_commands.command(name="status", description="MuraBot health dashboard.")
    async def status(self, interaction: discord.Interaction):
        await interaction.response.defer()
        import database
        import net as http_mod
        import music as music_mod

        lines: list[str] = []
        # NaN-safe: gateway latency is NaN mid-(re)connect (see gateway_util).
        latency = gateway_latency_ms(self.bot, 0)
        lines.append(f"{'🟢' if latency < 250 else '🟡'} **Discord** — {latency} ms")

        try:
            await database._db.command("ping")
            lines.append("🟢 **Database** — online")
        except Exception:
            lines.append("🔴 **Database** — offline")

        data = await tmdb.search("test")  # cached ping
        lines.append("🟢 **Movie API** — online" if data else "🔴 **Movie API** — unreachable")

        bridge_status = http_mod.get_status().get("site_bridge", "unknown")
        icon = {"online": "🟢", "auth-missing": "🟡"}.get(bridge_status, "🔴")
        label = {"online": "online", "auth-missing": "no secret (partially working)"}.get(
            bridge_status, bridge_status)
        lines.append(f"{icon} **Site bridge** — {label}")

        ffmpeg_ok = False
        try:
            import music as music_mod2
            import asyncio as _aio
            proc = await _aio.create_subprocess_exec(
                music_mod2.FFMPEG_EXE, "-version",
                stdout=_aio.DEVNULL, stderr=_aio.DEVNULL)
            await asyncio.wait_for(proc.wait(), timeout=5)
            ffmpeg_ok = proc.returncode == 0
        except Exception:
            ffmpeg_ok = False
        lines.append(f"{'🟢' if ffmpeg_ok else '🔴'} **Music** — {'ready' if ffmpeg_ok else 'FFmpeg unavailable'}")

        e = embeds.embed("🩺 MuraBot Status", "\n".join(lines), embeds.OK if ffmpeg_ok else embeds.WARN)
        e.add_field(name="🏠 Servers", value=str(len(self.bot.guilds)), inline=True)
        e.add_field(name="📚 Commands", value=str(len(self.bot.tree.get_commands())), inline=True)
        await interaction.followup.send(embed=e)

    @app_commands.command(name="ping", description="Bot latency.")
    async def ping(self, interaction: discord.Interaction):
        # NaN-safe: gateway latency can be NaN during (re)connect.
        ms = gateway_latency_ms(self.bot, 0)
        await interaction.response.send_message(
            embed=embeds.embed("🏓 Pong!", f"Latency: **{ms} ms**", embeds.INFO))

    @app_commands.command(name="dashboard", description="Open the MuraBot web dashboard.")
    async def dashboard(self, interaction: discord.Interaction):
        e = embeds.embed(
            "🌐 MuraBot Dashboard",
            "Configure the bot for **your** server — no code, no IDs to guess:\n\n"
            "• Toggle modules (music, moderation, leveling…)\n"
            "• Set DJ role, music channel & control mode\n"
            "• AutoMod thresholds & log channels\n"
            "• Welcome messages with variables\n\n"
            "Sign in with Discord — only servers where you have **Manage Server** appear.",
            embeds.GOLD)
        view = discord.ui.View()
        view.add_item(discord.ui.Button(
            label="🌐 OPEN DASHBOARD", url=f"{config.MURASTREAM_URL}/dashboard", emoji="⚙️"))
        view.add_item(discord.ui.Button(
            label="➕ Invite MuraBot",
            url=f"https://discord.com/oauth2/authorize?client_id={config.DISCORD_CLIENT_ID}&permissions=271698944&scope=bot%20applications.commands",
            emoji="➕"))
        await interaction.response.send_message(embed=e, view=view)

    @app_commands.command(name="search", description="Search movies and TV shows.")
    @app_commands.describe(query="Title to search for")
    async def search(self, interaction: discord.Interaction, query: str):
        if not await self._guarded(interaction, "search"):
            return
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(embed=embeds.embed(
                "🔎 No results found",
                f"We couldn't find **{query}**.\nTry another movie, TV show, or anime title.",
                embeds.WARN))
            return
        first = items[0]
        e = embeds.embed(f"🔎 Search — {first.get('title')}",
                         (first.get("overview") or "No description available.")[:350])
        embeds.media_item_fields(e, first)
        if first.get("poster"):
            e.set_thumbnail(url=first["poster"])
        view = ui.MediaSelectView(items[:25], interaction.user.id)
        view.add_item(discord.ui.Button(label="▶ Watch", url=bridge.watch_url(
            first.get("type", "movie"), int(first.get("id", 0)))))
        await interaction.followup.send(embed=e, view=view)

    @app_commands.command(name="movie", description="Look up a movie.")
    @app_commands.describe(query="Movie title")
    async def movie(self, interaction: discord.Interaction, query: str):
        await self._detail(interaction, query, "movie")

    @app_commands.command(name="tv", description="Look up a TV series.")
    @app_commands.describe(query="TV series title")
    async def tv(self, interaction: discord.Interaction, query: str):
        await self._detail(interaction, query, "tv")

    @app_commands.command(name="anime", description="Search anime.")
    @app_commands.describe(query="Anime title")
    async def anime(self, interaction: discord.Interaction, query: str):
        await self._detail(interaction, query, "tv", icon="🍥", label="anime")

    async def _detail(self, interaction: discord.Interaction, query: str,
                      want_type: str, icon: str = "🎬", label: str = "movie"):
        if not await self._guarded(interaction, f"detail-{want_type}"):
            return
        items = await tmdb.search(query)
        typed = [i for i in items if i.get("type") == want_type] or items
        if not typed:
            await interaction.followup.send(embed=embeds.embed(
                f"{icon} No results found",
                f"We couldn't find **{query}**.\nTry another title.",
                embeds.WARN))
            return
        item = typed[0]
        e = embeds.embed(f"{icon} {item.get('title')}",
                         (item.get("overview") or "No description available.")[:400])
        embeds.media_item_fields(e, item)
        if item.get("poster"):
            e.set_thumbnail(url=item["poster"])
        if item.get("backdrop"):
            e.set_image(url=item["backdrop"])
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="▶ WATCH", url=bridge.watch_url(
            item.get("type", "movie"), int(item.get("id", 0))), emoji="▶️"))
        view.add_item(discord.ui.Button(label="🔗 OPEN MURASTREAM", url=bridge.details_url(
            item.get("type", "movie"), int(item.get("id", 0))), emoji="🔗"))
        view.add_item(discord.ui.Button(label="👥 WATCH TOGETHER",
                                        style=discord.ButtonStyle.primary, emoji="👥",
                                        custom_id=f"wt:{item.get('type')}:{item.get('id')}:{item.get('title', '')[:60]}"))
        await interaction.followup.send(embed=e, view=view)

    @app_commands.command(name="trending", description="What's trending this week.")
    @app_commands.choices(kind=[
        app_commands.Choice(name="All", value="all"),
        app_commands.Choice(name="Movies", value="movie"),
        app_commands.Choice(name="TV", value="tv"),
    ])
    async def trending(self, interaction: discord.Interaction, kind: app_commands.Choice[str] | None = None):
        if not await self._guarded(interaction, "trending"):
            return
        items = await tmdb.trending(kind.value if kind else "all")
        if not items:
            await interaction.followup.send(embed=embeds.embed(
                "🔥 Trending", "Trending data unavailable right now.", embeds.WARN))
            return
        lines = []
        for i, item in enumerate(items[:10], 1):
            icon = "🎬" if item.get("type") == "movie" else "📺"
            rating = item.get("rating") or 0
            lines.append(f"**{i}.** {icon} **{item.get('title')}** ({item.get('year')}) — ⭐ {float(rating):.1f}")
        e = embeds.embed("🔥 Trending This Week", "\n".join(lines))
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="▶ Watch on MuraStream", url=bridge.home_url(), emoji="▶️"))
        await interaction.followup.send(embed=e, view=view)

    @app_commands.command(name="popular", description="Popular movies or TV.")
    @app_commands.choices(kind=[
        app_commands.Choice(name="Movies", value="movie"),
        app_commands.Choice(name="TV", value="tv"),
    ])
    async def popular(self, interaction: discord.Interaction, kind: app_commands.Choice[str] | None = None):
        if not await self._guarded(interaction, "popular"):
            return
        kind_val = kind.value if kind else "movie"
        items = await tmdb.popular(kind_val)
        if not items:
            await interaction.followup.send(embed=embeds.embed(
                "📈 Popular", "Data unavailable right now.", embeds.WARN))
            return
        lines = []
        for i, item in enumerate(items[:10], 1):
            rating = item.get("rating") or 0
            lines.append(f"**{i}.** **{item.get('title')}** ({item.get('year')}) — ⭐ {float(rating):.1f}")
        icon = "🎬" if kind_val == "movie" else "📺"
        await interaction.followup.send(embed=embeds.embed(
            f"{icon} Popular {'Movies' if kind_val == 'movie' else 'TV Series'}", "\n".join(lines)))

    @app_commands.command(name="recommend", description="Recommendations similar to a title you like.")
    @app_commands.describe(query="A title you enjoyed")
    async def recommend(self, interaction: discord.Interaction, query: str):
        if not await self._guarded(interaction, "recommend"):
            return
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(embed=embeds.embed(
                "🤔 Not found", f"Nothing found for **{query}**.", embeds.WARN))
            return
        item = items[0]
        recs = await tmdb.recommendations(int(item.get("id", 0)), item.get("type", "movie"))
        if not recs:
            await interaction.followup.send(embed=embeds.embed(
                "🤔 No recommendations", f"No similar titles for **{item.get('title')}**.", embeds.WARN))
            return
        lines = []
        for i, rec in enumerate(recs[:8], 1):
            icon = "🎬" if rec.get("type") == "movie" else "📺"
            rating = rec.get("rating") or 0
            lines.append(f"**{i}.** {icon} **{rec.get('title')}** ({rec.get('year')}) — ⭐ {float(rating):.1f}")
        e = embeds.embed(f"💡 Because you searched “{query}”", "\n".join(lines))
        if item.get("poster"):
            e.set_thumbnail(url=item["poster"])
        await interaction.followup.send(embed=e)

    @app_commands.command(name="watch", description="Get a direct watch link for a title.")
    @app_commands.describe(query="Title to watch")
    async def watch(self, interaction: discord.Interaction, query: str):
        if not await self._guarded(interaction, "watch"):
            return
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(embed=embeds.embed(
                "🎬 Not found", f"Nothing found for **{query}**.", embeds.WARN))
            return
        item = items[0]
        e = embeds.embed(f"▶ {item.get('title')}",
                         (item.get("overview") or "")[:300])
        embeds.media_item_fields(e, item)
        if item.get("poster"):
            e.set_thumbnail(url=item["poster"])
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="▶ WATCH NOW", url=bridge.watch_url(
            item.get("type", "movie"), int(item.get("id", 0)))))
        await interaction.followup.send(embed=e, view=view)

    @app_commands.command(name="watchlist", description="Your MuraStream watchlist lives on the site.")
    async def watchlist(self, interaction: discord.Interaction):
        e = embeds.embed("🔖 Your Watchlist",
                         "Watchlists are personal — manage them on MuraStream.\n\n"
                         "Sign in, open any title and press **Add to Watchlist**.")
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="🔖 Open My Space",
                                        url=f"{config.MURASTREAM_URL}/account/my-space", emoji="👤"))
        await interaction.response.send_message(embed=e, view=view)

    @app_commands.command(name="profile", description="Your MuraStream profile.")
    async def profile(self, interaction: discord.Interaction):
        user = interaction.user
        e = embeds.embed("👤 Profile", color=embeds.GOLD)
        e.set_author(name=str(user), icon_url=user.display_avatar.url if user.display_avatar else None)
        e.set_thumbnail(url=user.display_avatar.url if user.display_avatar else "")
        e.add_field(name="Discord", value=f"{user.mention} (`{user.id}`)", inline=False)
        e.add_field(name="🔗 MuraStream", value=(
            "Sign in on the site to sync your watchlist, points and comments."), inline=False)
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="👤 VIEW PROFILE", url=bridge.profile_url(), emoji="👤"))
        view.add_item(discord.ui.Button(label="⭐ MY SPACE",
                                        url=f"{config.MURASTREAM_URL}/account/my-space", emoji="⭐"))
        await interaction.response.send_message(embed=e, view=view)


async def setup(bot: commands.Bot):
    await bot.add_cog(MediaCommands(bot))
