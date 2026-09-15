"""Watch Together, requests, comments — community features tied to the website."""

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

log = logging.getLogger("bot.watchtogether")

STATUS_EMOJI = {
    "Requested": "📋", "Under Review": "🔍", "In Progress": "🛠️",
    "Added": "✅", "Unavailable": "🚫", "Rejected": "❌",
}


class RequestButtonView(discord.ui.View):
    def __init__(self, request_id: int, guild_id: int):
        super().__init__(timeout=None)
        self.request_id = request_id
        self.guild_id = guild_id

    @discord.ui.button(label="Vote", style=discord.ButtonStyle.primary, emoji="👍")
    async def vote(self, interaction: discord.Interaction, button: discord.ui.Button):
        ok, votes = await database.vote_request(self.guild_id, self.request_id, interaction.user.id)
        if not ok:
            await interaction.response.send_message("You already voted for this request!", ephemeral=True)
            return
        await interaction.response.send_message(f"👍 Vote counted — {votes} total.", ephemeral=True)

    @discord.ui.button(label="Status", style=discord.ButtonStyle.secondary, emoji="📊")
    async def show_status(self, interaction: discord.Interaction, button: discord.ui.Button):
        req = await database.find_request(self.guild_id, self.request_id)
        if not req:
            await interaction.response.send_message("Request not found.", ephemeral=True)
            return
        icon = STATUS_EMOJI.get(req["status"], "📋")
        await interaction.response.send_message(
            f"{icon} **{req['title']}** — status: **{req['status']}** ({req['votes']} votes)", ephemeral=True)


class WatchTogetherCog(commands.Cog):
    """Watch parties, requests, comments."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    # ── Watch Together ────────────────────────────────────────────────
    @app_commands.command(name="watchtogether", description="Start a synced Watch Together room on MuraStream.")
    @app_commands.describe(query="Title to watch together")
    async def watchtogether(self, interaction: discord.Interaction, query: str):
        if not await utils.cooldown_check(interaction, "watchtogether", 10):
            return
        await interaction.response.defer()
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(embed=utils.base_embed("👥 Not found", f"Nothing found for **{query}**."))
            return
        item = items[0]
        state = {"type": item.get("type", "movie"), "id": int(item.get("id", 0)), "positionSec": 0}
        code = await bridge.create_party(interaction.user.display_name, state)
        if not code:
            # Fall back to a direct watch link with the host's context.
            embed = utils.base_embed(
                "👥 Watch Together",
                "The website couldn't create a room right now — start one manually from the watch page instead.")
            view = discord.ui.View()
            view.add_item(utils.watch_link_button(item))
            await interaction.followup.send(embed=embed, view=view)
            return
        embed = utils.base_embed(
            "👥 Watch Together Room",
            f"**{item.get('title')}**\n\nHost: {interaction.user.mention}\n"
            f"Everyone joins the same room and the host controls playback for all viewers.")
        embed.set_thumbnail(url=item.get("poster") or "")
        embed.add_field(name="🔑 Room code", value=f"`{code}`", inline=True)
        url = bridge.party_url(code, item.get("type", "movie"), int(item.get("id", 0)))
        view = discord.ui.View()
        view.add_item(utils.site_link_button("👥 JOIN WATCH TOGETHER", url, "▶️"))
        view.add_item(utils.site_link_button("🎬 Open MuraStream", bridge.home_url(), "🎬"))
        await interaction.followup.send(
            content=f"{interaction.user.mention} started a Watch Together!", embed=embed, view=view)

    # ── Movie requests ────────────────────────────────────────────────
    @app_commands.command(name="request", description="Request a movie, TV show or anime.")
    @app_commands.describe(title="What should we add?", kind="Media type")
    @app_commands.choices(kind=[
        app_commands.Choice(name="Movie", value="movie"),
        app_commands.Choice(name="TV Series", value="tv"),
        app_commands.Choice(name="Anime", value="anime"),
    ])
    async def request_media(self, interaction: discord.Interaction, title: str,
                            kind: app_commands.Choice[str] | None = None):
        remaining = await database.check_cooldown(
            f"request:{interaction.guild.id}:{interaction.user.id}", config.REQUEST_COOLDOWN_SECONDS)
        if remaining:
            await interaction.response.send_message(
                embed=utils.base_embed("⏳ Slow down", f"You can request again in **{remaining}s**."), ephemeral=True)
            return
        title = title.strip()[:config.MAX_REQUEST_TITLE_LEN]
        if len(title) < 2:
            await interaction.response.send_message("Give me a real title 🙂", ephemeral=True)
            return
        kind_val = kind.value if kind else "movie"

        # Duplicate check against existing requests on this server.
        existing = [r for r in await database.top_requests(interaction.guild.id, limit=100)
                    if r["title_lc"] == title.casefold()]
        if existing:
            req = existing[0]
            ok, votes = await database.vote_request(interaction.guild.id, req["requestId"], interaction.user.id)
            msg = (f"**{req['title']}** already has a request — added your vote!\n"
                   f"**{votes}** supporters so far.") if ok else \
                  f"**{req['title']}** already has a request and you already voted."
            view = discord.ui.View()
            view.add_item(utils.site_link_button("📋 All requests", bridge.requests_url(), "📋"))
            await interaction.response.send_message(embed=utils.base_embed("📋 Duplicate request", msg), view=view)
            return

        # Resolve a TMDB id (best effort) and persist the request.
        tmdb_id = None
        try:
            hits = await tmdb.search(title)
            if hits:
                tmdb_id = int(hits[0].get("id") or 0) or None
        except Exception:
            pass
        request_id, created = await database.add_request(
            interaction.guild.id, interaction.user.id, str(interaction.user),
            title, kind_val, tmdb_id)
        # Mirror to the website (best effort — the site has its own list too).
        await bridge.create_site_request(
            str(interaction.user), title, kind_val, f"Discord request #{request_id}")
        await interaction.response.send_message(
            embed=utils.base_embed(
                "✅ Request submitted",
                f"**{title}** ({kind_val.capitalize()}) — request **#{request_id}**\n"
                f"Track it with `/requests` or on the website."),
            view=RequestButtonView(request_id, interaction.guild.id))

    @app_commands.command(name="requests", description="Browse and vote community requests.")
    @app_commands.describe(request_id="Optional: manage a specific request (admins only)", action="Admin action")
    @app_commands.choices(action=[
        app_commands.Choice(name="Under Review", value="Under Review"),
        app_commands.Choice(name="In Progress", value="In Progress"),
        app_commands.Choice(name="Added", value="Added"),
        app_commands.Choice(name="Rejected", value="Rejected"),
        app_commands.Choice(name="Unavailable", value="Unavailable"),
    ])
    async def requests_cmd(self, interaction: discord.Interaction,
                           request_id: int | None = None,
                           action: app_commands.Choice[str] | None = None):
        guild_id = interaction.guild.id
        if request_id is not None:
            # Admin-only status change.
            is_admin = (
                interaction.user.guild_permissions.manage_guild
                or interaction.user.id in config.BOT_ADMIN_IDS
            )
            if not is_admin:
                await interaction.response.send_message(
                    "Only moderators can change request status.", ephemeral=True)
                return
            if not action:
                await interaction.response.send_message("Pick an `action` to apply.", ephemeral=True)
                return
            ok = await database.set_request_status(guild_id, request_id, action.value)
            if not ok:
                await interaction.response.send_message(f"Request #{request_id} not found.", ephemeral=True)
                return
            await database.log_action(guild_id, interaction.user.id, request_id, "request_status", action.value)
            await interaction.response.send_message(
                embed=utils.base_embed("✅ Request updated", f"#{request_id} → **{action.value}**"))
            return

        top = await database.top_requests(guild_id, limit=10)
        if not top:
            embed = utils.base_embed("📋 Requests", "No requests yet — be the first with `/request`!")
            view = discord.ui.View()
            view.add_item(utils.site_link_button("📋 Site requests", bridge.requests_url(), "📋"))
            await interaction.response.send_message(embed=embed, view=view)
            return
        lines = []
        for req in top:
            icon = STATUS_EMOJI.get(req["status"], "📋")
            kind_icon = {"movie": "🎬", "tv": "📺", "anime": "🍥"}.get(req.get("type"), "🎬")
            lines.append(
                f"**#{req['requestId']}** {kind_icon} **{req['title']}** — 👍 {req['votes']} • {icon} {req['status']}")
        embed = utils.base_embed("📋 Top Requests", "\n".join(lines))
        embed.set_footer(text="Vote with the buttons on each request, or /request <title> to add yours.")
        view = discord.ui.View()
        view.add_item(utils.site_link_button("📋 Full list on MuraStream", bridge.requests_url(), "📋"))
        await interaction.response.send_message(embed=embed, view=view)

    # ── Comments ──────────────────────────────────────────────────────
    @app_commands.command(name="comments", description="Recent community comments for a title.")
    @app_commands.describe(query="Title to check comments for")
    async def comments(self, interaction: discord.Interaction, query: str):
        if not await utils.cooldown_check(interaction, "comments"):
            return
        await interaction.response.defer()
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(embed=utils.base_embed("💬 Not found", f"Nothing found for **{query}**."))
            return
        item = items[0]
        # The public comments API doesn't need the bridge secret.
        recent = await bridge.recent_comments(item.get("type", "movie"), int(item.get("id", 0)))
        if not recent:
            embed = utils.base_embed(
                f"💬 Comments — {item.get('title')}",
                "No comments yet. Start the conversation on the title's page!")
            view = discord.ui.View()
            view.add_item(utils.site_link_button("💬 Join the discussion", bridge.details_url(item.get("type", "movie"), int(item.get("id", 0))), "💬"))
            await interaction.followup.send(embed=embed, view=view)
            return
        lines = []
        for c in recent[:5]:
            name = str(c.get("name") or c.get("userName") or "Viewer")[:60]
            text = str(c.get("text") or c.get("comment") or "")[:150]
            lines.append(f"**{name}**: {text}")
        embed = utils.base_embed(f"💬 Comments — {item.get('title')}", "\n".join(lines))
        view = discord.ui.View()
        view.add_item(utils.site_link_button("💬 Read & reply", bridge.details_url(item.get("type", "movie"), int(item.get("id", 0))), "💬"))
        await interaction.followup.send(embed=embed, view=view)


async def setup(bot: commands.Bot):
    await bot.add_cog(WatchTogetherCog(bot))
