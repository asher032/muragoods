"""`/profile` group — identity, progression, notifications, leaderboards.

Reads the same wallet/XP/achievement/inventory collections every other
surface uses. Leaderboards use indexed, paginated queries (never full-table
in-memory scans).
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import utils

log = logging.getLogger("bot.profile")


class ProfileGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    prof = app_commands.Group(name="identity", description="Identity, progression and leaderboards")

    @prof.command(name="view", description="Show a full profile.")
    @app_commands.describe(user="Whose profile (default: you)")
    async def view(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer()
        target = user or interaction.user
        gid = interaction.guild.id
        wallet = await eco.get_wallet(database._db, gid, target.id)
        xp_doc = await database._db.xp.find_one({"guildId": gid, "userId": target.id}) or {}
        xp = int(xp_doc.get("xp", 0))
        level = int((xp / 100) ** 0.5)
        prof = await database._db.economy_profile.find_one(
            {"guildId": gid, "userId": int(target.id)}) or {}
        badges = prof.get("badges", [])[:5]
        e = embeds.embed(f"👤 {getattr(target, 'display_name', target.name)}",
                         f"**{prof.get('title', 'Newcomer')}**", embeds.INFO)
        try:
            if target.display_avatar:
                e.set_thumbnail(url=target.display_avatar.url)
        except Exception:
            pass
        e.add_field(name="Level", value=f"**{level}** ({xp} XP)", inline=True)
        e.add_field(name="Coins", value=f"**{int(wallet.get('balance', 0)):,}** pocket", inline=True)
        e.add_field(name="Net worth", value=f"**{eco.net_worth(wallet):,}**", inline=True)
        e.add_field(name="Bank", value=f"**{int(wallet.get('bank', 0)):,}**", inline=True)
        e.add_field(name="Gems", value=f"💎 **{int(wallet.get('gems', 0))}**", inline=True)
        e.add_field(name="Prestige", value=f"🔥 **{int(wallet.get('prestige', 0))}**", inline=True)
        if badges:
            e.add_field(name="Badges", value=" ".join(badges), inline=False)
        await interaction.followup.send(embed=e)

    @prof.command(name="achievements", description="Achievement progress.")
    @app_commands.describe(user="Whose achievements (default: you)")
    async def achievements(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer(ephemeral=True)
        target = user or interaction.user
        gid = interaction.guild.id
        await eco.check_quests(database._db, gid, target.id)
        progress = await eco.quest_progress(database._db, gid, target.id)
        lines = []
        for qid, quest in eco.QUESTS.items():
            have = progress.get(quest["check"], 0)
            done = have >= quest["target"]
            lines.append(f"{'✅' if done else '🔒'} **{quest['name']}** "
                         f"{min(have, quest['target'])}/{quest['target']} — {quest['desc']}")
        try:
            keys = await database.get_achievements(gid, int(target.id))
        except Exception:
            keys = []
        pct = round(100 * sum(1 for q in eco.QUESTS if progress.get(eco.QUESTS[q]['check'], 0) >= eco.QUESTS[q]['target']) / max(1, len(eco.QUESTS)))
        await interaction.followup.send(embed=embeds.embed(
            f"🏆 Achievements ({pct}%)",
            "\n".join(lines) + (f"\n\nSite badges: {', '.join(keys[:5])}" if keys else ""),
            embeds.GOLD), ephemeral=True)

    @prof.command(name="badges", description="List badges and manage display.")
    @app_commands.describe(action="list or manage", badge="Badge emoji to toggle")
    @app_commands.choices(action=[
        app_commands.Choice(name="list", value="list"),
        app_commands.Choice(name="manage", value="manage"),
    ])
    async def badges(self, interaction: discord.Interaction, action: str = "list", badge: str = ""):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        await eco.check_quests(database._db, gid, uid)
        progress = await eco.quest_progress(database._db, gid, uid)
        earned = {qid: ("🏅" if progress.get(q['check'], 0) >= q['target'] else "🔒") + f" {q['name']}"
                  for qid, q in eco.QUESTS.items()}
        prof = await database._db.economy_profile.find_one(
            {"guildId": gid, "userId": int(uid)}) or {}
        shown = prof.get("badges", [])
        if action == "manage" and badge:
            badge = badge.strip()[:10]
            if badge in shown:
                shown = [b for b in shown if b != badge]
            elif len(shown) < 5:
                shown.append(badge)
            await database._db.economy_profile.update_one(
                {"guildId": gid, "userId": int(uid)},
                {"$set": {"badges": shown}}, upsert=True)
            await interaction.followup.send(f"Display badges: {' '.join(shown) or 'none'}.", ephemeral=True)
            return
        lines = [f"{mark}" for mark in earned.values()]
        lines.append(f"\nDisplaying: {' '.join(shown) or 'none'} (max 5, toggle via manage)")
        await interaction.followup.send(embed=embeds.embed(
            "🏅 Badges", "\n".join(lines), embeds.INFO), ephemeral=True)

    @prof.command(name="title", description="List titles or set your active title.")
    @app_commands.describe(action="list or set", title="Title key for set")
    @app_commands.choices(action=[
        app_commands.Choice(name="list", value="list"),
        app_commands.Choice(name="set", value="set"),
    ])
    async def title(self, interaction: discord.Interaction, action: str = "list", title: str = ""):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        wallet = await eco.get_wallet(database._db, gid, uid)
        progress = await eco.quest_progress(database._db, gid, uid)
        unlocked = {"newcomer"}
        if progress.get("net", 0) >= 10000:
            unlocked.add("wealthy")
        if int(wallet.get("prestige", 0)) >= 1:
            unlocked.add("legend")
        if int(wallet.get("omega", 0)) >= 1:
            unlocked.add("omega")
        if action == "set":
            key = (title or "").strip().lower()
            if key not in unlocked:
                await interaction.followup.send(
                    "Locked. Unlocked: " + ", ".join(sorted(unlocked)), ephemeral=True)
                return
            await database._db.economy_profile.update_one(
                {"guildId": gid, "userId": int(uid)},
                {"$set": {"title": eco.TITLES[key]["name"]}}, upsert=True)
            await interaction.followup.send(f"Title set: **{eco.TITLES[key]['name']}**.", ephemeral=True)
            return
        await interaction.followup.send(embed=embeds.embed(
            "⭐ Titles",
            "\n".join(f"{'✅' if k in unlocked else '🔒'} **{v['name']}** — {v['how']}"
                      for k, v in eco.TITLES.items()),
            embeds.INFO), ephemeral=True)

    @prof.command(name="notifications", description="Recent account notifications.")
    @app_commands.describe(search="Filter text")
    async def notifications(self, interaction: discord.Interaction, search: str = ""):
        await interaction.response.defer(ephemeral=True)
        try:
            cur = database._db.economy_notif.find(
                {"guildId": int(interaction.guild.id), "userId": interaction.user.id})
            notes = await cur.sort("at", -1).limit(15).to_list(15)
        except Exception:
            notes = []
        q = (search or "").strip().lower()
        rows = [n for n in notes if not q or q in str(n.get("text", "")).lower()][:10]
        if not rows:
            await interaction.followup.send("No notifications.", ephemeral=True)
            return
        await interaction.followup.send(embed=embeds.embed(
            "📜 Notifications",
            "\n".join(f"• *{n.get('kind', '')}* — {n.get('text', '')[:120]}" for n in rows),
            embeds.INFO), ephemeral=True)

    @prof.command(name="leaderboard", description="Top holders (indexed, paginated).")
    @app_commands.describe(by="Rank by net, balance, or gems", page="Page number")
    @app_commands.choices(by=[
        app_commands.Choice(name="net worth", value="net"),
        app_commands.Choice(name="pocket", value="balance"),
        app_commands.Choice(name="gems", value="gems"),
    ])
    async def leaderboard(self, interaction: discord.Interaction, by: str = "net", page: int = 1):
        await interaction.response.defer()
        page = max(1, int(page or 1))
        rows = await eco.top_wallets(database._db, interaction.guild.id, by, 10, (page - 1) * 10)
        if not rows:
            await interaction.followup.send("No holders yet.", ephemeral=True)
            return
        medals = ["🥇", "🥈", "🥉"]
        lines = []
        for i, row in enumerate(rows):
            rank = (page - 1) * 10 + i + 1
            medal = medals[i] if page == 1 and i < 3 else f"`{rank}.`"
            if by == "gems":
                val = f"💎 {int(row.get('gems', 0))}"
            elif by == "balance":
                val = f"**{int(row.get('balance', 0)):,}**"
            else:
                val = f"**{int(row.get('balance', 0)) + int(row.get('bank', 0)):,}**"
            lines.append(f"{medal} <@{row.get('userId')}> — {val}")
        await interaction.followup.send(embed=embeds.embed(
            f"🏆 Leaderboard · {by} · p{page}", "\n".join(lines), embeds.GOLD))


async def setup(bot: commands.Bot):
    await bot.add_cog(ProfileGroup(bot))
