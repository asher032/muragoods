"""MuraStream discovery commands: search, movie/tv/anime details, trending, watch links."""

import logging
from typing import Any

import discord
from discord import app_commands
from discord.ext import commands

import bridge
import config
import database
import tmdb
import utils

log = logging.getLogger("bot.murastream")


class MediaSelect(discord.ui.Select):
    """Select menu of search results; picking one shows a detail embed."""

    def __init__(self, items: list[dict[str, Any]], requester_id: int):
        self.items = items
        self.requester_id = requester_id
        options = []
        for i, item in enumerate(items[:25]):
            icon = "🎬" if item.get("type") == "movie" else "📺"
            desc = (item.get("overview") or "No description")[:80]
            options.append(discord.SelectOption(
                label=f"{icon} {item.get('title', 'Untitled')}"[:100],
                description=desc[:100],
                value=str(i),
            ))
        super().__init__(placeholder="Pick a title…", options=options, min_values=1, max_values=1)

    async def callback(self, interaction: discord.Interaction):
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message("This menu isn't yours — run your own search.", ephemeral=True)
            return
        item = self.items[int(self.values[0])]
        embed = utils.media_embed(item)
        view = discord.ui.View()
        view.add_item(utils.watch_link_button(item))
        url = bridge.details_url(item.get("type", "movie"), int(item.get("id", 0)))
        view.add_item(utils.site_link_button("ℹ️ Details on MuraStream", url, "🔗"))
        await interaction.response.edit_message(embed=embed, view=view)


class MediaSelectView(discord.ui.View):
    def __init__(self, items, requester_id, timeout=120):
        super().__init__(timeout=timeout)
        self.add_item(MediaSelect(items, requester_id))


class MurastreamCog(commands.GroupCog, name="murastream", group_name="murastream"):
    """MuraStream media discovery."""

    @app_commands.command(name="browse", description="Open MuraStream browse (movies, TV, anime, dramas).")
    async def browse(self, interaction: discord.Interaction):
        embed = utils.base_embed("🎬 MuraStream", "Browse the full library on the site.")
        embed.add_field(name="🍿 Movies", value=bridge.details_url("movie", 0).rsplit("/", 1)[0], inline=False)
        embed.add_field(name="📺 TV Series", value=f"{config.MURASTREAM_URL}/murastream", inline=False)
        view = discord.ui.View()
        view.add_item(utils.site_link_button("🍿 Open MuraStream", bridge.home_url(), "🎬"))
        await interaction.response.send_message(embed=embed, view=view)


class MediaCommands(commands.Cog):
    """Top-level media commands."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="help", description="Show everything the bot can do.")
    async def help_command(self, interaction: discord.Interaction):
        embed = utils.base_embed("📖 MuraStream Bot — Help")
        embed.add_field(name="🎬 Media", value=(
            "`/search <title>` — find movies & TV\n"
            "`/movie <title>` — movie details\n"
            "`/tv <title>` — TV series details\n"
            "`/anime <title>` — search anime\n"
            "`/trending` — what's hot this week\n"
            "`/popular` — popular movies & TV\n"
            "`/recommend <title>` — similar titles"
        ), inline=False)
        embed.add_field(name="👥 Watch Together", value=(
            "`/watchtogether <title>` — start a synced room\n"
            "`/watch <title>` — get a direct watch link"
        ), inline=False)
        embed.add_field(name="🎵 Music", value=(
            "`/play <song>` • `/skip` • `/pause` • `/resume`\n"
            "`/queue` • `/nowplaying` • `/volume` • `/leave`"
        ), inline=False)
        embed.add_field(name="🍔 Muragoods", value=(
            "`/food` • `/letters` • `/games` • `/points`\n"
            "`/rewards` • `/profile`"
        ), inline=False)
        embed.add_field(name="📋 Requests & Community", value=(
            "`/request <title>` — request a movie/TV/anime\n"
            "`/requests` — browse & vote requests\n"
            "`/comments <title>` — community chatter"
        ), inline=False)
        embed.add_field(name="🛡️ Moderation", value=(
            "`/warn` • `/warnings` • `/kick` • `/ban`\n"
            "`/mute` • `/clear` • `/lock` • `/setup`"
        ), inline=False)
        embed.add_field(name="ℹ️ Info", value="`/status` — bot health & links", inline=False)
        view = discord.ui.View()
        view.add_item(utils.site_link_button("🎬 Open MuraStream", bridge.home_url(), "▶️"))
        await interaction.response.send_message(embed=embed, view=view)

    @app_commands.command(name="status", description="Bot health and quick links.")
    async def status(self, interaction: discord.Interaction):
        latency = round(self.bot.latency * 1000)
        embed = utils.base_embed("🩺 Bot Status", color=0x2ECC40)
        embed.add_field(name="📡 Gateway", value=f"{latency} ms", inline=True)
        embed.add_field(name="🏠 Servers", value=str(len(self.bot.guilds)), inline=True)
        embed.add_field(name="🎬 Site", value="[muragoods.vercel.app](https://muragoods.vercel.app)", inline=True)
        if config.BRIDGE_SECRET:
            embed.add_field(name="🔗 Website bridge", value="Configured ✅", inline=True)
        else:
            embed.add_field(name="🔗 Website bridge", value="Not configured (media lookups still work)", inline=False)
        view = discord.ui.View()
        view.add_item(utils.site_link_button("🎬 MuraStream", bridge.home_url(), "▶️"))
        view.add_item(utils.site_link_button("📋 Requests", bridge.requests_url(), "📋"))
        await interaction.response.send_message(embed=embed, view=view)

    @app_commands.command(name="search", description="Search movies and TV shows.")
    @app_commands.describe(query="Title to search for")
    async def search(self, interaction: discord.Interaction, query: str):
        if not await utils.cooldown_check(interaction, "search"):
            return
        await interaction.response.defer()
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(
                embed=utils.base_embed("🔍 No results", f"Nothing found for **{query}**."))
            return
        embed = utils.base_embed(f"🔍 Results for “{query}”",
                                 "Pick a title below to see details.")
        await interaction.followup.send(embed=embed, view=MediaSelectView(items[:25], interaction.user.id))

    @app_commands.command(name="movie", description="Look up a movie.")
    @app_commands.describe(query="Movie title")
    async def movie(self, interaction: discord.Interaction, query: str):
        await self._detail(interaction, query, "movie")

    @app_commands.command(name="tv", description="Look up a TV series.")
    @app_commands.describe(query="TV series title")
    async def tv(self, interaction: discord.Interaction, query: str):
        await self._detail(interaction, query, "tv")

    @app_commands.command(name="anime", description="Search anime (animated TV & movies).")
    @app_commands.describe(query="Anime title")
    async def anime(self, interaction: discord.Interaction, query: str):
        if not await utils.cooldown_check(interaction, "anime"):
            return
        await interaction.response.defer()
        items = await tmdb.search(query)
        anime_items = [i for i in items if i.get("type") == "tv"]
        if not anime_items:
            await interaction.followup.send(
                embed=utils.base_embed("🍥 No results", f"No anime found for **{query}**."))
            return
        embed = utils.base_embed(f"🍥 Anime results for “{query}”", "Pick a title below.")
        await interaction.followup.send(embed=embed, view=MediaSelectView(anime_items[:25], interaction.user.id))

    async def _detail(self, interaction: discord.Interaction, query: str, want_type: str):
        if not await utils.cooldown_check(interaction, f"detail-{want_type}"):
            return
        await interaction.response.defer()
        items = await tmdb.search(query)
        typed = [i for i in items if i.get("type") == want_type] or items
        if not typed:
            icon = "🎬" if want_type == "movie" else "📺"
            await interaction.followup.send(
                embed=utils.base_embed(f"{icon} No results", f"Nothing found for **{query}**."))
            return
        item = typed[0]
        embed = utils.media_embed(item)
        view = discord.ui.View()
        view.add_item(utils.watch_link_button(item))
        view.add_item(utils.site_link_button("ℹ️ Details", bridge.details_url(item.get("type", "movie"), int(item.get("id", 0))), "🔗"))
        await interaction.followup.send(embed=embed, view=view)

    @app_commands.command(name="trending", description="What's trending this week.")
    @app_commands.choices(kind=[
        app_commands.Choice(name="All", value="all"),
        app_commands.Choice(name="Movies", value="movie"),
        app_commands.Choice(name="TV", value="tv"),
    ])
    async def trending(self, interaction: discord.Interaction, kind: app_commands.Choice[str] | None = None):
        if not await utils.cooldown_check(interaction, "trending"):
            return
        await interaction.response.defer()
        items = await tmdb.trending(kind.value if kind else "all")
        if not items:
            await interaction.followup.send(embed=utils.base_embed("🔥 Trending", "Trending data unavailable right now."))
            return
        lines = []
        for i, item in enumerate(items[:10], 1):
            icon = "🎬" if item.get("type") == "movie" else "📺"
            rating = item.get("rating") or 0
            lines.append(f"**{i}.** {icon} **{item.get('title')}** ({item.get('year')}) — ⭐ {float(rating):.1f}")
        embed = utils.base_embed("🔥 Trending This Week", "\n".join(lines))
        view = discord.ui.View()
        view.add_item(utils.site_link_button("▶ Watch on MuraStream", bridge.home_url(), "▶️"))
        await interaction.followup.send(embed=embed, view=view)

    @app_commands.command(name="popular", description="Popular movies or TV.")
    @app_commands.choices(kind=[
        app_commands.Choice(name="Movies", value="movie"),
        app_commands.Choice(name="TV", value="tv"),
    ])
    async def popular(self, interaction: discord.Interaction, kind: app_commands.Choice[str] | None = None):
        if not await utils.cooldown_check(interaction, "popular"):
            return
        await interaction.response.defer()
        kind_val = kind.value if kind else "movie"
        items = await tmdb.popular(kind_val)
        if not items:
            await interaction.followup.send(embed=utils.base_embed("📈 Popular", "Data unavailable right now."))
            return
        lines = []
        for i, item in enumerate(items[:10], 1):
            rating = item.get("rating") or 0
            lines.append(f"**{i}.** **{item.get('title')}** ({item.get('year')}) — ⭐ {float(rating):.1f}")
        icon = "🎬" if kind_val == "movie" else "📺"
        embed = utils.base_embed(f"{icon} Popular {'Movies' if kind_val == 'movie' else 'TV Series'}", "\n".join(lines))
        await interaction.followup.send(embed=embed)

    @app_commands.command(name="recommend", description="Recommendations similar to a title you like.")
    @app_commands.describe(query="A title you enjoyed")
    async def recommend(self, interaction: discord.Interaction, query: str):
        if not await utils.cooldown_check(interaction, "recommend"):
            return
        await interaction.response.defer()
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(embed=utils.base_embed("🤔 Not found", f"Nothing found for **{query}**."))
            return
        item = items[0]
        recs = await tmdb.recommendations(int(item.get("id", 0)), item.get("type", "movie"))
        if not recs:
            await interaction.followup.send(
                embed=utils.base_embed("🤔 No recommendations", f"No similar titles found for **{item.get('title')}**."))
            return
        lines = []
        for i, rec in enumerate(recs[:8], 1):
            icon = "🎬" if rec.get("type") == "movie" else "📺"
            rating = rec.get("rating") or 0
            lines.append(f"**{i}.** {icon} **{rec.get('title')}** ({rec.get('year')}) — ⭐ {float(rating):.1f}")
        embed = utils.base_embed(
            f"💡 Because you searched “{query}”", "\n".join(lines))
        embed.set_thumbnail(url=item.get("poster") or "")
        await interaction.followup.send(embed=embed)

    @app_commands.command(name="watch", description="Get a direct watch link for a title.")
    @app_commands.describe(query="Title to watch")
    async def watch(self, interaction: discord.Interaction, query: str):
        if not await utils.cooldown_check(interaction, "watch"):
            return
        await interaction.response.defer()
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(embed=utils.base_embed("🎬 Not found", f"Nothing found for **{query}**."))
            return
        item = items[0]
        embed = utils.media_embed(item)
        view = discord.ui.View()
        view.add_item(utils.watch_link_button(item))
        view.add_item(utils.site_link_button("👥 Watch Together", bridge.party_url("new", item.get("type", "movie"), int(item.get("id", 0))), "👥"))
        await interaction.followup.send(embed=embed, view=view)

    @app_commands.command(name="watchlist", description="Your MuraStream watchlist lives on the site.")
    async def watchlist(self, interaction: discord.Interaction):
        embed = utils.base_embed("🔖 Your Watchlist", "Watchlists are personal — manage them on MuraStream.")
        embed.add_field(name="How it works", value=(
            "Sign in on the site, open any title and press **Add to Watchlist**.\n"
            "Your list is saved to your MuraStream account."
        ), inline=False)
        view = discord.ui.View()
        view.add_item(utils.site_link_button("🔖 Open My Space", f"{config.MURASTREAM_URL}/account/my-space", "👤"))
        view.add_item(utils.site_link_button("🎬 Browse titles", bridge.home_url(), "🎬"))
        await interaction.response.send_message(embed=embed, view=view)

    @app_commands.command(name="profile", description="Your MuraStream profile.")
    async def profile(self, interaction: discord.Interaction):
        user = interaction.user
        embed = utils.base_embed("👤 Profile")
        embed.set_author(name=str(user), icon_url=user.display_avatar.url if user.display_avatar else None)
        embed.set_thumbnail(url=user.display_avatar.url if user.display_avatar else "")
        embed.add_field(name="Discord", value=f"{user.mention} ({user.id})", inline=False)
        embed.add_field(name="🔗 MuraStream", value=(
            "Link your account by signing in with the same display name, "
            "then view your dashboard on the site."
        ), inline=False)
        view = discord.ui.View()
        view.add_item(utils.site_link_button("👤 View Profile", bridge.profile_url(), "👤"))
        view.add_item(utils.site_link_button("⭐ My Space", f"{config.MURASTREAM_URL}/account/my-space", "⭐"))
        await interaction.response.send_message(embed=embed, view=view)


async def setup(bot: commands.Bot):
    await bot.add_cog(MurastreamCog(bot))
    await bot.add_cog(MediaCommands(bot))
