"""Identity extras — short commands for progression display.

`/achievements` (merged site + economy tracks), `/notifications`
(paginated list + search), `/badges` (list/manage), `/title` (list/set).
The full profile card lives at `/profile` (merged in murastream).
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds

log = logging.getLogger("bot.profile")


class PageView(discord.ui.View):
    """Prev/Next pagination with owner check + timeout disable."""

    def __init__(self, owner_id: int, page: int, total: int, render):
        super().__init__(timeout=180.0)
        self.owner_id = owner_id
        self.page = page
        self.total = max(1, total)
        self._render = render

    async def on_timeout(self) -> None:
        for child in self.children:
            try:
                child.disabled = True
            except Exception:
                pass
        try:
            if hasattr(self, "message") and self.message is not None:
                await self.message.edit(view=self)
        except Exception:
            pass

    async def _move(self, interaction: discord.Interaction, delta: int):
        if interaction.user.id != self.owner_id:
            try:
                await interaction.response.send_message(
                    "This menu belongs to another user.", ephemeral=True)
            except Exception:
                pass
            return
        self.page = max(0, min(self.total - 1, self.page + delta))
        embed = await self._render(self.page)
        try:
            if not interaction.response.is_done():
                await interaction.response.edit_message(embed=embed, view=self)
            else:
                await interaction.edit_original_response(embed=embed, view=self)
        except discord.HTTPException:
            pass

    @discord.ui.button(label="◀ Previous", style=discord.ButtonStyle.secondary,
                       custom_id="profile:page:prev")
    async def prev(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._move(interaction, -1)

    @discord.ui.button(label="Next ▶", style=discord.ButtonStyle.secondary,
                       custom_id="profile:page:next")
    async def next(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._move(interaction, 1)


class ProfileGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    notifications = app_commands.Group(name="notifications", description="Economy notifications")
    badges = app_commands.Group(name="badges", description="Unlockable profile badges")
    title = app_commands.Group(name="title", description="Profile titles")

    @app_commands.command(name="achievements", description="Achievements: site badges + economy track.")
    @app_commands.describe(user="Whose achievements (default: you)")
    async def achievements(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer()
        target = user or interaction.user
        gid = interaction.guild.id
        try:
            site_keys = await database.get_achievements(gid, int(target.id))
        except Exception:
            site_keys = []
        try:
            newly = await eco.check_economy_achievements(database._db, gid, target.id)
            doc = await database._db.economy_achv.find_one(
                {"guildId": int(gid), "userId": int(target.id)}) or {}
            eco_done = set(doc.get("done") or [])
        except Exception:
            newly, eco_done = [], set()
        site_lines = [f"{'✅' if k in site_keys else '⬜'} **{name}** — {desc}"
                      for k, (name, desc) in database.ACHIEVEMENTS.items()]
        eco_lines = [f"{'✅' if k in eco_done else '🔒'} **{v['name']}** — {v['desc']} (+{v['reward']})"
                     for k, v in eco.ACHIEVEMENTS_FULL.items()]
        e = embeds.embed(f"🏆 Achievements — {getattr(target, 'display_name', target.name)}",
                         "**Site**\n" + "\n".join(site_lines) +
                         "\n\n**Economy**\n" + "\n".join(eco_lines) +
                         (f"\n\n🎉 New: {', '.join(newly)}" if newly else ""),
                         embeds.GOLD)
        e.add_field(name="Unlocked",
                    value=f"Site {len(site_keys)}/{len(database.ACHIEVEMENTS)} · "
                          f"Economy {len(eco_done)}/{len(eco.ACHIEVEMENTS_FULL)}", inline=False)
        try:
            if target.display_avatar:
                e.set_thumbnail(url=target.display_avatar.url)
        except Exception:
            pass
        await interaction.followup.send(embed=e)

    @notifications.command(name="list", description="Display economy notifications.")
    @app_commands.describe(page="Page number")
    async def notif_list(self, interaction: discord.Interaction, page: int = 1):
        await interaction.response.defer(ephemeral=True)
        page = max(1, int(page or 1))

        async def render(p: int) -> discord.Embed:
            try:
                notes = await database._db.economy_notif.find(
                    {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)}
                ).sort("at", -1).skip(p * 10).limit(10).to_list(10)
            except Exception:
                notes = []
            if not notes:
                return embeds.embed("📜 Notifications", "No notifications on this page.", embeds.INFO)
            lines = [f"• *{n.get('kind', '')}* — {str(n.get('text', ''))[:120]}" for n in notes]
            return embeds.embed(f"📜 Notifications · p{p + 1}", "\n".join(lines), embeds.INFO)

        try:
            total_docs = await database._db.economy_notif.count_documents(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)})
        except Exception:
            total_docs = 10
        total = max(1, (total_docs + 9) // 10)
        view = PageView(interaction.user.id, min(page - 1, total - 1), total, render)
        embed = await render(view.page)
        msg = await interaction.followup.send(embed=embed, view=view, ephemeral=True)
        try:
            view.message = msg
        except Exception:
            pass

    @notifications.command(name="search", description="Search notifications.")
    @app_commands.describe(query="Search text")
    async def notif_search(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer(ephemeral=True)
        q = (query or "").strip().lower()[:60]
        try:
            notes = await database._db.economy_notif.find(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)}
            ).sort("at", -1).limit(50).to_list(50)
        except Exception:
            notes = []
        rows = [n for n in notes if q in str(n.get("text", "")).lower()
                or q in str(n.get("kind", "")).lower()][:10]
        if not rows:
            await interaction.followup.send("No matches.", ephemeral=True)
            return
        await interaction.followup.send(embed=embeds.embed(
            f"🔎 {query[:40]}",
            "\n".join(f"• *{n.get('kind', '')}* — {str(n.get('text', ''))[:120]}" for n in rows),
            embeds.INFO), ephemeral=True)

    @badges.command(name="list", description="Show unlockable badges and progress.")
    async def badges_list(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        progress = await eco.quest_progress(database._db, gid, uid)
        wallet = await eco.get_wallet(database._db, gid, uid)
        unlocked = {"newcomer"}
        if progress.get("net", 0) >= 5000:
            unlocked.add("earner")
        if progress.get("activities", 0) >= 25:
            unlocked.add("grinder")
        if progress.get("items", 0) >= 10:
            unlocked.add("collector")
        if int(wallet.get("streakDaily", 0)) >= 7:
            unlocked.add("loyal")
        if int(wallet.get("prestige", 0)) >= 1:
            unlocked.add("reborn")
        if int(wallet.get("omega", 0)) >= 1:
            unlocked.add("omega")
        lines = [f"{'✅' if k in unlocked else '🔒'} {v['emoji']} **{v['name']}** — {v['how']}"
                 for k, v in eco.BADGES_CATALOG.items()]
        await interaction.followup.send(embed=embeds.embed(
            "🏅 Badges", "\n".join(lines), embeds.INFO), ephemeral=True)

    @badges.command(name="manage", description="Choose which badges show on your profile.")
    @app_commands.describe(badge="Badge emoji to toggle")
    async def badges_manage(self, interaction: discord.Interaction, badge: str):
        await interaction.response.defer(ephemeral=True)
        badge = (badge or "").strip()[:10]
        if not badge:
            await interaction.followup.send("Give a badge emoji.", ephemeral=True)
            return
        try:
            prof = await database._db.economy_profile.find_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)}) or {}
            shown = list(prof.get("badges") or [])
            if badge in shown:
                shown = [b for b in shown if b != badge]
            elif len(shown) < 5:
                shown.append(badge)
            else:
                await interaction.followup.send("Max 5 displayed.", ephemeral=True)
                return
            await database._db.economy_profile.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)},
                {"$set": {"badges": shown}}, upsert=True)
            await interaction.followup.send(
                f"Displaying: {' '.join(shown) or 'none'}.", ephemeral=True)
        except Exception:
            await interaction.followup.send("Could not save.", ephemeral=True)

    @title.command(name="list", description="Show unlocked titles.")
    async def title_list(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        progress = await eco.quest_progress(database._db, interaction.guild.id, interaction.user.id)
        unlocked = {"newcomer"}
        if progress.get("net", 0) >= 10000:
            unlocked.add("wealthy")
        if int(wallet.get("prestige", 0)) >= 1:
            unlocked.add("legend")
        if int(wallet.get("omega", 0)) >= 1:
            unlocked.add("omega")
        await interaction.followup.send(embed=embeds.embed(
            "⭐ Titles",
            "\n".join(f"{'✅' if k in unlocked else '🔒'} **{v['name']}** — {v['how']}"
                      for k, v in eco.TITLES.items()), embeds.INFO), ephemeral=True)

    @title.command(name="set", description="Set your active profile title.")
    @app_commands.describe(title="Title key (see /title list)")
    async def title_set(self, interaction: discord.Interaction, title: str):
        await interaction.response.defer(ephemeral=True)
        key = (title or "").strip().lower()
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        progress = await eco.quest_progress(database._db, interaction.guild.id, interaction.user.id)
        unlocked = {"newcomer"}
        if progress.get("net", 0) >= 10000:
            unlocked.add("wealthy")
        if int(wallet.get("prestige", 0)) >= 1:
            unlocked.add("legend")
        if int(wallet.get("omega", 0)) >= 1:
            unlocked.add("omega")
        if key not in unlocked:
            await interaction.followup.send(
                "Locked. Unlocked: " + ", ".join(sorted(unlocked)), ephemeral=True)
            return
        try:
            await database._db.economy_profile.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)},
                {"$set": {"title": eco.TITLES[key]["name"]}}, upsert=True)
        except Exception:
            pass
        await interaction.followup.send(f"Title → **{eco.TITLES[key]['name']}**.", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(ProfileGroup(bot))
