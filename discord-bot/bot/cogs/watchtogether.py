"""Watch Together, requests, comments — ack-first lifecycle throughout."""

import logging
from typing import Any

import discord
from discord import app_commands
from discord.ext import commands

import bridge
import config
import database
import embeds
import tmdb
import utils

log = logging.getLogger("bot.watchtogether")

STATUS_EMOJI = {
    "Requested": "📋", "Under Review": "🔍", "In Progress": "🛠️",
    "Added": "✅", "Unavailable": "🚫", "Rejected": "❌",
}


class RequestButtons(utils.SafeView):
    """Vote/status buttons attached to a request message (15-min window)."""

    def __init__(self, request_id: int, guild_id: int):
        super().__init__(timeout=900)
        self.request_id = request_id
        self.guild_id = guild_id

    @discord.ui.button(label="Vote", style=discord.ButtonStyle.primary, emoji="👍")
    async def vote(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        ok, votes = await database.vote_request(self.guild_id, self.request_id, interaction.user.id)
        if not ok:
            await interaction.followup.send("You already voted for this request!", ephemeral=True)
        else:
            await interaction.followup.send(f"👍 Vote counted — **{votes}** total.", ephemeral=True)

    @discord.ui.button(label="Status", style=discord.ButtonStyle.secondary, emoji="📊")
    async def show_status(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        req = await database.find_request(self.guild_id, self.request_id)
        if not req:
            await interaction.followup.send("Request not found.", ephemeral=True)
            return
        icon = STATUS_EMOJI.get(req["status"], "📋")
        await interaction.followup.send(
            f"{icon} **{req['title']}** — status: **{req['status']}** ({req['votes']} votes)",
            ephemeral=True)


class WatchTogetherButton(discord.ui.Button):
    """Persistent-style button that creates a real room on click."""

    def __init__(self, media_type: str, media_id: int, title: str):
        super().__init__(label="👥 CREATE ROOM", style=discord.ButtonStyle.primary)
        self.media_type = media_type
        self.media_id = media_id
        self.title = title

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.defer()
        code = await bridge.create_party(
            interaction.user.display_name,
            {"type": self.media_type, "id": self.media_id, "season": 1, "episode": 1})
        if not code:
            await interaction.followup.send(embed=embeds.embed(
                "👥 Room unavailable",
                "The website couldn't create a room right now — start one from the watch page.",
                embeds.WARN))
            return
        url = bridge.party_url(code, self.media_type, self.media_id)
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="▶ JOIN ROOM", url=url, emoji="👥"))
        await interaction.followup.send(
            embed=embeds.embed("👥 Room ready!", f"Code `{code}` — everyone watches the same timeline."),
            view=view)


class WatchTogetherCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="watchtogether", description="Start a synced Watch Together room on MuraStream.")
    @app_commands.describe(query="Title to watch together")
    async def watchtogether(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer()
        if utils.on_cooldown(interaction.user.id, "watchtogether", 10):
            await interaction.followup.send(
                embed=embeds.embed("⏳ Slow down", "Please try again in a few seconds.", embeds.WARN),
                ephemeral=True)
            return
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(embed=embeds.embed(
                "👥 Not found", f"Nothing found for **{query}**.", embeds.WARN))
            return
        item = items[0]
        e = embeds.embed("👥 Watch Together",
                         f"**{item.get('title')}**\n\n"
                         f"Everyone joins the same room — the host controls playback for all viewers.",
                         color=embeds.INFO)
        if item.get("poster"):
            e.set_thumbnail(url=item["poster"])
        # Attempt room creation up-front (fast fail if bridge is down).
        state = {"type": item.get("type", "movie"), "id": int(item.get("id", 0)),
                 "season": 1, "episode": 1}
        code = await bridge.create_party(interaction.user.display_name, state)
        view = discord.ui.View(timeout=900)
        if code:
            url = bridge.party_url(code, item.get("type", "movie"), int(item.get("id", 0)))
            view.add_item(discord.ui.Button(label="▶ JOIN ROOM", url=url, emoji="👥"))
            e.add_field(name="🔑 Room code", value=f"`{code}`", inline=True)
        else:
            # Bridge down — offer a click-to-create button (retries live).
            view.add_item(WatchTogetherButton(
                item.get("type", "movie"), int(item.get("id", 0)), str(item.get("title", ""))))
            e.set_footer(text="Room will be created when someone presses the button • MuraStream")
        await interaction.followup.send(
            content=f"{interaction.user.mention} started a Watch Together!", embed=e, view=view)

    @app_commands.command(name="request", description="Request a movie, TV show or anime.")
    @app_commands.describe(title="What should we add?", kind="Media type")
    @app_commands.choices(kind=[
        app_commands.Choice(name="Movie", value="movie"),
        app_commands.Choice(name="TV Series", value="tv"),
        app_commands.Choice(name="Anime", value="anime"),
    ])
    async def request_media(self, interaction: discord.Interaction, title: str,
                            kind: app_commands.Choice[str] | None = None):
        await interaction.response.defer(ephemeral=False)
        if utils.on_cooldown(interaction.user.id, "request", config.REQUEST_COOLDOWN_SECONDS):
            await interaction.followup.send(
                embed=embeds.embed("⏳ Slow down",
                                   f"You can request again in a minute.", embeds.WARN),
                ephemeral=True)
            return
        title = title.strip()[:config.MAX_REQUEST_TITLE_LEN]
        if len(title) < 2:
            await interaction.followup.send("Give me a real title 🙂", ephemeral=True)
            return
        kind_val = kind.value if kind else "movie"

        # Duplicate check.
        existing = [r for r in await database.top_requests(interaction.guild.id, limit=100)
                    if r["title_lc"] == title.casefold()]
        if existing:
            req = existing[0]
            ok, votes = await database.vote_request(interaction.guild.id, req["requestId"], interaction.user.id)
            msg = (f"**{req['title']}** already has a request — added your vote!\n"
                   f"**{votes}** supporters so far.") if ok else \
                  f"**{req['title']}** already has a request and you already voted."
            view = discord.ui.View()
            view.add_item(discord.ui.Button(label="📋 All requests", url=bridge.requests_url(), emoji="📋"))
            await interaction.followup.send(embed=embeds.embed("📋 Duplicate request", msg), view=view)
            return

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
        await bridge.create_site_request(str(interaction.user), title, kind_val,
                                         f"Discord request #{request_id}")
        e = embeds.embed("🎬 Movie Request",
                         f"**Title:** {title}\n"
                         f"**Type:** {kind_val.capitalize()}\n"
                         f"**Requested by:** {interaction.user.mention}\n"
                         f"**Status:** 📋 Requested\n"
                         f"**Request #:** {request_id}",
                         color=embeds.GOLD)
        await interaction.followup.send(embed=e, view=RequestButtons(request_id, interaction.guild.id))

    @app_commands.command(name="requests", description="Browse and vote community requests.")
    @app_commands.describe(request_id="Optional: change a request's status (mods only)", action="Admin action")
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
        await interaction.response.defer()
        guild_id = interaction.guild.id
        if request_id is not None:
            is_admin = (interaction.user.guild_permissions.manage_guild
                        or interaction.user.id in config.BOT_ADMIN_IDS)
            if not is_admin:
                await interaction.followup.send("Only moderators can change request status.", ephemeral=True)
                return
            if not action:
                await interaction.followup.send("Pick an `action` to apply.", ephemeral=True)
                return
            ok = await database.set_request_status(guild_id, request_id, action.value)
            if not ok:
                await interaction.followup.send(f"Request #{request_id} not found.", ephemeral=True)
                return
            await database.log_action(guild_id, interaction.user.id, request_id, "request_status", action.value)
            await interaction.followup.send(
                embed=embeds.ok("✅ Request updated", f"#{request_id} → **{action.value}**"))
            return

        top = await database.top_requests(guild_id, limit=10)
        if not top:
            e = embeds.embed("📋 Requests", "No requests yet — be the first with `/request`!")
            view = discord.ui.View()
            view.add_item(discord.ui.Button(label="📋 Site requests", url=bridge.requests_url(), emoji="📋"))
            await interaction.followup.send(embed=e, view=view)
            return
        lines = []
        for req in top:
            icon = STATUS_EMOJI.get(req["status"], "📋")
            kind_icon = {"movie": "🎬", "tv": "📺", "anime": "🍥"}.get(req.get("type"), "🎬")
            lines.append(f"**#{req['requestId']}** {kind_icon} **{req['title']}** — 👍 {req['votes']} • {icon} {req['status']}")
        e = embeds.embed("📋 Top Requests", "\n".join(lines))
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="📋 Full list on MuraStream", url=bridge.requests_url(), emoji="📋"))
        await interaction.followup.send(embed=e, view=view)

    @app_commands.command(name="comments", description="Recent community comments for a title.")
    @app_commands.describe(query="Title to check comments for")
    async def comments(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer()
        if utils.on_cooldown(interaction.user.id, "comments"):
            await interaction.followup.send(
                embed=embeds.embed("⏳ Slow down", "Please try again in a few seconds.", embeds.WARN),
                ephemeral=True)
            return
        items = await tmdb.search(query)
        if not items:
            await interaction.followup.send(embed=embeds.embed(
                "💬 Not found", f"Nothing found for **{query}**.", embeds.WARN))
            return
        item = items[0]
        recent = await bridge.recent_comments(item.get("type", "movie"), int(item.get("id", 0)))
        if not recent:
            e = embeds.embed(f"💬 Comments — {item.get('title')}",
                             "No comments yet. Start the conversation on the title's page!")
            view = discord.ui.View()
            view.add_item(discord.ui.Button(label="💬 Join the discussion",
                                            url=bridge.details_url(item.get("type", "movie"), int(item.get("id", 0))),
                                            emoji="💬"))
            await interaction.followup.send(embed=e, view=view)
            return
        lines = []
        for c in recent[:5]:
            name = str(c.get("name") or "Viewer")[:60]
            text = str(c.get("text") or "")[:150]
            lines.append(f"**{name}**: {text}")
        e = embeds.embed(f"💬 Comments — {item.get('title')}", "\n".join(lines))
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="💬 Read & reply",
                                        url=bridge.details_url(item.get("type", "movie"), int(item.get("id", 0))),
                                        emoji="💬"))
        await interaction.followup.send(embed=e, view=view)


async def setup(bot: commands.Bot):
    await bot.add_cog(WatchTogetherCog(bot))
