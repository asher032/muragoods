"""Work & activities — short commands for earning, social and events.

`/work` hosts shift/stars plus every free-reward activity (beg, tidy,
postmemes, stream, adventure), the earning session tracker,
vacation protection and server events. `/friends` hosts the friendship
system plus partnerships. All rewards are server-side via bot/economy.py.
"""

import logging
import random

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import jobs as jb

log = logging.getLogger("bot.work")


async def _cfg(guild_id: int) -> dict:
    return await eco.get_economy_config(database._db, guild_id)


class WorkCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    work = app_commands.Group(name="work", description="Work shifts, odd jobs and events")
    friends = app_commands.Group(name="friends", description="In-game friendship system")

    # ── shift / stars ──
    @work.command(name="shift", description="Work a shift for coins (hourly).")
    async def work_shift(self, interaction: discord.Interaction):
        await interaction.response.defer()
        # Employment gate: working (in ANY form) requires an approved job
        # application first — checked server-side, not in the UI.
        emp = await jb.get_employment(database._db, interaction.guild.id,
                                      interaction.user.id)
        if not emp:
            await interaction.followup.send(
                "❌ You don't have a job!\n"
                "> Apply for a job first before you can start a shift.\n"
                "Browse jobs and apply with `/jobs shift`.", ephemeral=True)
            return
        cfg = await _cfg(interaction.guild.id)
        granted, remaining = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "lastWork", int(cfg.get("workCooldownSec", 3600)))
        if not granted:
            await interaction.followup.send(
                f"Shift over — rest for {remaining // 60}m.", ephemeral=True)
            return
        amount = random.randint(int(cfg.get("workMin", 50)), int(cfg.get("workMax", 300)))
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id, amount, "work", "discord")
        try:
            await database._db.economy.update_one(
                {"guildId": int(interaction.guild.id), "userId": interaction.user.id},
                {"$inc": {"shiftsWorked": 1}})
        except Exception:
            pass
        gig = random.choice(["barista", "courier", "lifeguard", "debugger", "bard"])
        await interaction.followup.send(f"💼 You worked as a {gig} and earned **{final}** coins.")

    @work.command(name="stars", description="View collected work achievements/stars.")
    async def work_stars(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        shifts = int(wallet.get("shiftsWorked", 0))
        stars = min(5, shifts // 5)
        await interaction.followup.send(
            f"⭐ Shifts **{shifts}** · Stars **{'★' * stars}{'☆' * (5 - stars)}** "
            "(1 star per 5 shifts).", ephemeral=True)

    # ── shared activity helper ──
    async def _activity(self, interaction: discord.Interaction, kind: str,
                        low: int, high: int, verbs: list[str]):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            f"last_{kind}", int(cfg.get("activityCooldownSec", 600)))
        if not granted:
            await interaction.followup.send("That spot is empty for now — try again later.", ephemeral=True)
            return
        if random.random() < 0.2:
            await interaction.followup.send(f"You {verbs[0]} but found nothing this time.")
            return
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id,
            random.randint(low, high), "activity", "discord")
        await eco.check_quests(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send(f"{random.choice(verbs[1:])} **+{final}** coins.")

    @work.command(name="beg", description="Beg for a few coins (short cooldown).")
    async def work_beg(self, interaction: discord.Interaction):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "lastBeg", int(cfg.get("begCooldownSec", 300)))
        if not granted:
            await interaction.followup.send("Not now — begging has a short cooldown.", ephemeral=True)
            return
        amount = random.randint(int(cfg.get("begMin", 5)), int(cfg.get("begMax", 100)))
        if random.random() < 0.15:
            await interaction.followup.send(random.choice([
                "Nobody spared a coin. The streets are cold today.",
                "A pigeon judged you and flew away.",
            ]))
            return
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id, amount, "beg", "discord")
        await interaction.followup.send(f"🪙 A kind soul gave you **{final}** coins.")

    @work.command(name="tidy", description="Tidy up for a small reward.")
    async def work_tidy(self, interaction: discord.Interaction):
        await self._activity(interaction, "tidy", 10, 60,
                             ["tidied", "🧹 Sparkling clean:", "🧹 You organized the guild hall:"])

    @work.command(name="postmemes", description="Post a fictional meme for rewards.")
    async def work_postmemes(self, interaction: discord.Interaction):
        await self._activity(interaction, "postmemes", 15, 120,
                             ["posted", "📯 Your meme went semi-viral:", "📯 Fresh meme energy:"])

    @work.command(name="stream", description="Run a fictional stream session.")
    async def work_stream(self, interaction: discord.Interaction):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "last_stream", int(cfg.get("activityCooldownSec", 600)))
        if not granted:
            await interaction.followup.send("You need rest before the next stream.", ephemeral=True)
            return
        viewers = random.randint(5, 200)
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id,
            viewers * 2, "activity", "discord")
        await interaction.followup.send(
            f"🎥 You streamed to **{viewers}** viewers and earned **{final}** coins.")

    @work.command(name="adventure", description="Spend a ticket on a randomized adventure.")
    async def work_adventure(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not await eco.remove_item(database._db, interaction.guild.id,
                                     interaction.user.id, "adventure_ticket", 1):
            await interaction.followup.send(
                "You need an Adventure Ticket — check `/shop view`.", ephemeral=True)
            return
        roll = random.random()
        if roll < 0.55:
            final, _ = await eco.grant_coins(
                database._db, interaction.guild.id, interaction.user.id,
                random.randint(100, 400), "activity", "discord")
            await interaction.followup.send(f"🗺️ Adventure complete! Loot: **{final}** coins.")
        elif roll < 0.8:
            item = random.choice(["bread", "gem_shard", "speed_fertilizer"])
            await eco.add_item(database._db, interaction.guild.id, interaction.user.id, item, 1)
            await interaction.followup.send(f"🗺️ Adventure complete! Found: **{eco.ITEMS[item]['name']}**.")
        else:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "gems", 1, "activity", "discord")
            await interaction.followup.send("🗺️ Legendary adventure! Earned **1 gem** 💎.")

    @work.command(name="session", description="Start or summarize your earning session.")
    @app_commands.describe(action="start or summary")
    @app_commands.choices(action=[
        app_commands.Choice(name="start", value="start"),
        app_commands.Choice(name="summary", value="summary"),
    ])
    async def work_session(self, interaction: discord.Interaction, action: str = "start"):
        await interaction.response.defer(ephemeral=True)
        if action == "summary":
            doc = await eco.session_end(database._db, interaction.guild.id, interaction.user.id)
            if not doc:
                await interaction.followup.send("No active session — start one first.", ephemeral=True)
                return
            await interaction.followup.send(embed=embeds.embed(
                "📈 Session summary",
                f"Earned **{doc.get('earned', 0)}** · Spent **{doc.get('spent', 0)}** · "
                f"Items **{doc.get('items', 0)}** · Activities **{doc.get('activities', 0)}**.",
                embeds.INFO), ephemeral=True)
            return
        await eco.session_start(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send("Session tracking started.", ephemeral=True)

    @work.command(name="vacation", description="Vacation / protection mode (freezes streaks).")
    @app_commands.describe(days="Start vacation for N days (1-14, empty = status)")
    async def work_vacation(self, interaction: discord.Interaction, days: int = 0):
        await interaction.response.defer(ephemeral=True)
        if days:
            ok, msg = await eco.vacation_set(
                database._db, interaction.guild.id, interaction.user.id, int(days))
            await interaction.followup.send(
                f"🏖️ Vacation active for **{min(max(int(days), 1), 14)}** days — "
                "daily streaks are protected while away." if ok else f"⚠️ {msg}",
                ephemeral=True)
            return
        cur = await eco.vacation_get(database._db, interaction.guild.id, interaction.user.id)
        if cur["active"]:
            await interaction.followup.send(
                f"🏖️ Vacation active until <t:{int(cur['until'].timestamp())}:R>.", ephemeral=True)
        else:
            await interaction.followup.send(
                "No vacation active — start with `/work vacation days:3` (1–14).", ephemeral=True)

    @work.command(name="event", description="Server event: status, donate, pool.")
    @app_commands.describe(action="status, donate or pool", quantity="Coins to donate",
                           gems="Gems to donate")
    @app_commands.choices(action=[
        app_commands.Choice(name="status", value="status"),
        app_commands.Choice(name="donate", value="donate"),
        app_commands.Choice(name="pool", value="pool"),
    ])
    async def work_event(self, interaction: discord.Interaction, action: str = "status",
                         quantity: int = 100, gems: int = 0):
        await interaction.response.defer()
        if action == "donate":
            ok, msg = await eco.serverevent_donate(
                database._db, interaction.guild.id, interaction.user.id,
                int(quantity or 0), int(gems or 0))
            await interaction.followup.send(
                f"🎉 Donated **{int(quantity or 0)}** (+{int(gems or 0)} gems)! {msg}"
                if ok and msg != "ok" else ("🎉 Donated!" if ok else f"⚠️ {msg}"))
            return
        state = await eco.serverevent_get(database._db, interaction.guild.id)
        if not state["open"]:
            await interaction.followup.send(
                "No active event — donate with `/work event action:donate` to start the Server Festival!")
            return
        pct = min(100, round(100 * state["pool"] / max(1, state["goal"])))
        await interaction.followup.send(embed=embeds.embed(
            f"🎉 {state.get('name', 'Server Festival')}",
            f"Pool **{state['pool']:,}** / **{state['goal']:,}** ({pct}%) · "
            f"**{state['donors']}** donors.\nContribute: `/work event action:donate`.",
            embeds.GOLD))

    # ── Friends + partnerships ──
    @friends.command(name="add", description="Send a friend request.")
    @app_commands.describe(user="Who to befriend")
    async def friends_add(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.friend_request(database._db, interaction.guild.id,
                                           interaction.user.id, user.id)
        await interaction.followup.send("💌 Request sent!" if ok else f"⚠️ {msg}", ephemeral=True)

    @friends.command(name="remove", description="Remove a friend.")
    @app_commands.describe(user="Who to remove")
    async def friends_remove(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        try:
            await database._db.economy_social.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)},
                {"$pull": {"friends": int(user.id)}})
            await database._db.economy_social.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(user.id)},
                {"$pull": {"friends": int(interaction.user.id)}})
        except Exception:
            pass
        await interaction.followup.send("Removed.", ephemeral=True)

    @friends.command(name="list", description="Show your friends.")
    async def friends_list(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        doc = await eco.social_doc(database._db, interaction.guild.id, interaction.user.id)
        friends = doc.get("friends", [])[:20]
        await interaction.followup.send(
            "Friends: " + (", ".join(f"<@{f}>" for f in friends) if friends else "none yet — `/friends add`!"),
            ephemeral=True)

    @friends.command(name="requests", description="Show pending requests.")
    async def friends_requests(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        doc = await eco.social_doc(database._db, interaction.guild.id, interaction.user.id)
        reqs = doc.get("requests", [])[:10]
        await interaction.followup.send(
            "Pending: " + (", ".join(f"<@{r}>" for r in reqs) if reqs else "none"),
            ephemeral=True)

    @friends.command(name="accept", description="Accept a friend request.")
    @app_commands.describe(user="The requester")
    async def friends_accept(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.friend_answer(database._db, interaction.guild.id,
                                          interaction.user.id, user.id, True)
        await interaction.followup.send("Friends! 🎉" if ok else f"⚠️ {msg}", ephemeral=True)

    @friends.command(name="decline", description="Decline a friend request.")
    @app_commands.describe(user="The requester")
    async def friends_decline(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.friend_answer(database._db, interaction.guild.id,
                                          interaction.user.id, user.id, False)
        await interaction.followup.send("Declined." if ok else f"⚠️ {msg}", ephemeral=True)

    @friends.command(name="marry", description="Fictional partnership: status, propose, leave.")
    @app_commands.describe(action="status, propose or leave", user="Partner for propose")
    @app_commands.choices(action=[
        app_commands.Choice(name="status", value="status"),
        app_commands.Choice(name="propose", value="propose"),
        app_commands.Choice(name="leave", value="leave"),
    ])
    async def friends_marry(self, interaction: discord.Interaction, action: str = "status",
                            user: discord.Member | None = None):
        await interaction.response.defer(ephemeral=True)
        gid, me = interaction.guild.id, interaction.user.id
        if action == "propose":
            if not user or user.id == me or user.bot:
                await interaction.followup.send("Pick another member.", ephemeral=True)
                return
            ok, msg = await eco.marry(database._db, gid, me, user.id)
            await interaction.followup.send(
                f"💍 {interaction.user.mention} ❤ {user.mention} — partnered! "
                "Shared perk: matching profile titles." if ok else msg, ephemeral=True)
            return
        if action == "leave":
            try:
                doc = await eco.social_doc(database._db, gid, me)
                partner = doc.get("partner")
                await database._db.economy_social.update_one(
                    {"guildId": int(gid), "userId": int(me)}, {"$set": {"partner": None}})
                if partner:
                    await database._db.economy_social.update_one(
                        {"guildId": int(gid), "userId": int(partner)}, {"$set": {"partner": None}})
            except Exception:
                pass
            await interaction.followup.send("Partnership ended.", ephemeral=True)
            return
        doc = await eco.social_doc(database._db, gid, me)
        partner = doc.get("partner")
        await interaction.followup.send(
            f"💍 Partnered with <@{partner}> — milestones unlock shared titles." if partner
            else "No partner — propose with `/friends marry action:propose`.", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(WorkCog(bot))
