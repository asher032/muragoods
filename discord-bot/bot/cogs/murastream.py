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

    # NOTE: /help lives in cogs/help.py now — an interactive registry-driven
    # browser (category dropdown, pagination, search, details). A second
    # top-level "help" here would kill this cog at load
    # (CommandAlreadyRegistered) and bust the 100-command budget.

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

    @app_commands.command(name="profile", description="Unified profile: economy, progression and MuraStream links.")
    @app_commands.describe(user="Whose profile (default: you)",
                           compare_with="Compare against another member (public stats only)")
    async def profile(self, interaction: discord.Interaction, user: discord.User | None = None,
                      compare_with: discord.Member | None = None):
        """Merged profile: Discord identity + full economy card + site links.

        The old site-only card and the economy profile now live here together —
        one `/profile`, no duplicates, nothing lost.
        """
        await interaction.response.defer()
        import database as db_mod
        import economy as eco_mod
        target = user or interaction.user
        gid = interaction.guild.id
        try:
            wallet = await eco_mod.get_wallet(db_mod._db, gid, target.id)
            cfg = await eco_mod.get_economy_config(db_mod._db, gid)
            sym = str(cfg.get("currencySymbol", "🪙"))
            inv = await eco_mod.get_inventory(db_mod._db, gid, target.id)
            progress = await eco_mod.quest_progress(db_mod._db, gid, target.id)
            try:
                await eco_mod.check_economy_achievements(db_mod._db, gid, target.id)
                achv = await db_mod._db.economy_achv.find_one(
                    {"guildId": int(gid), "userId": int(target.id)}) or {}
                achv_n = len(achv.get("done") or [])
            except Exception:
                achv_n = 0
            try:
                prof = await db_mod._db.economy_profile.find_one(
                    {"guildId": int(gid), "userId": int(target.id)}) or {}
                title = str(prof.get("title") or "Newcomer")
                badges = list(prof.get("badges") or [])[:5]
            except Exception:
                title, badges = "Newcomer", []
            try:
                showcase = await eco_mod.showcase_get(db_mod._db, gid, target.id)
            except Exception:
                showcase = {"slots": []}
            try:
                pets = await db_mod._db.economy_pets.find(
                    {"guildId": int(gid), "userId": int(target.id)}).to_list(5)
            except Exception:
                pets = []
            try:
                mult = await eco_mod.active_multipliers(db_mod._db, gid, target.id)
                mult_line = f"Coins x{mult['coins']} · XP x{mult['xp']} · Luck x{mult['luck']}"
            except Exception:
                mult_line = "Coins x1.0"
            e = embeds.embed(f"👤 {getattr(target, 'display_name', target.name)}",
                             f"**{title}** · {target.mention} (`{target.id}`)", embeds.GOLD)
            try:
                if target.display_avatar:
                    e.set_thumbnail(url=target.display_avatar.url)
            except Exception:
                pass
            e.add_field(name="Balance",
                        value=f"{sym} **{int(wallet.get('balance', 0)):,}** pocket\n"
                              f"🏦 **{int(wallet.get('bank', 0)):,}** bank\n"
                              f"📊 Net **{eco_mod.net_worth(wallet):,}** · "
                              f"💎 **{int(wallet.get('gems', 0))}**",
                        inline=True)
            e.add_field(name="Progression",
                        value=f"Level **{eco_mod.economy_level(wallet)}** · "
                              f"🔥 **{int(wallet.get('prestige', 0))}** · "
                              f"🌀 **{int(wallet.get('omega', 0))}**\n"
                              f"Streak **{int(wallet.get('streakDaily', 0))}** · "
                              f"Activities **{progress.get('activities', 0)}** · "
                              f"Items **{sum(1 for q in inv.values() if q > 0)}** · "
                              f"Achievements **{achv_n}/{len(eco_mod.ACHIEVEMENTS_FULL)}**",
                        inline=True)
            extra = []
            if badges:
                extra.append(f"Badges: {' '.join(badges)}")
            if showcase.get("slots"):
                names = [eco_mod.ITEMS.get(i, {}).get("name", i) for i in showcase["slots"][:9]]
                extra.append("🖼️ " + ", ".join(names))
            if pets:
                extra.append("🐾 " + ", ".join(
                    f"**{p.get('name')}** Lv{int(p.get('level', 1))}" for p in pets[:5]))
            extra.append("✨ " + mult_line)
            extra.append("🔗 MuraStream: sign in on the site to sync watchlist, points and comments.")
            e.add_field(name="Showcase & More", value="\n".join(extra)[:1024], inline=False)
            if compare_with is not None and int(compare_with.id) != int(target.id) \
                    and not getattr(compare_with, "bot", False):
                try:
                    data = await eco_mod.compare_users(
                        db_mod._db, gid, target.id, compare_with.id)
                    me = data[str(int(target.id))]
                    them = data[str(int(compare_with.id))]
                    rows = []
                    for label, key in [("Net worth", "net"), ("Level", "level"),
                                       ("Items", "items"), ("Streak", "streak")]:
                        a, b = me[key], them[key]
                        mark = "🟰" if a == b else ("🟩" if a > b else "🟥")
                        rows.append(f"{mark} **{label}**: **{a:,}** vs **{b:,}**")
                    e.add_field(name=f"⚖️ vs {getattr(compare_with, 'display_name', 'them')}",
                                value="\n".join(rows), inline=False)
                except Exception:
                    pass
        except Exception:
            log.exception("merged profile failed")
            e = embeds.embed("👤 Profile", color=embeds.GOLD)
            e.set_author(name=str(target),
                         icon_url=target.display_avatar.url if target.display_avatar else None)
            e.add_field(name="Discord", value=f"{target.mention} (`{target.id}`)", inline=False)
            e.add_field(name="🔗 MuraStream", value=(
                "Sign in on the site to sync your watchlist, points and comments."), inline=False)
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="👤 VIEW SITE PROFILE", url=bridge.profile_url(), emoji="👤"))
        view.add_item(discord.ui.Button(label="⭐ MY SPACE",
                                        url=f"{config.MURASTREAM_URL}/account/my-space", emoji="⭐"))
        await interaction.followup.send(embed=e, view=view)


async def setup(bot: commands.Bot):
    await bot.add_cog(MediaCommands(bot))
