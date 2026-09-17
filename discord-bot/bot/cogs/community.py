"""Community systems: giveaways, suggestions, reports, reminders, reputation.

All interactions follow the ack-first pattern; all state is per-guild in Mongo.
"""

import asyncio
import logging
import random
from datetime import timedelta

import discord
from discord import app_commands
from discord.ext import commands

import database
import embeds
import utils

log = logging.getLogger("bot.community")


class GiveawayEntryView(utils.SafeView):
    """Persistent-style Join button attached to giveaway messages."""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Join Giveaway", style=discord.ButtonStyle.success, emoji="🎁")
    async def join(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        result = await database.enter_giveaway(interaction.message.id, interaction.user.id)
        if result is None:
            await interaction.followup.send("This giveaway has ended.", ephemeral=True)
            return
        joined, total = result
        if joined:
            await interaction.followup.send(
                f"🎁 You're in! **{total}** entr{'y' if total == 1 else 'ies'} so far.", ephemeral=True)
        else:
            await interaction.followup.send(
                f"You already joined — **{total}** total entries.", ephemeral=True)


class SuggestionVoteView(utils.SafeView):
    """Vote buttons persist real tallies in the suggestions collection."""

    def __init__(self, sugg_id: int):
        super().__init__(timeout=None)
        self.sugg_id = sugg_id

    @discord.ui.button(emoji="👍", style=discord.ButtonStyle.success)
    async def up(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            up, down = await database.vote_suggestion(interaction.guild.id, self.sugg_id,
                                                      interaction.user.id, up=True)
            await interaction.response.send_message(
                f"👍 Counted — **{up}** up / **{down}** down.", ephemeral=True)
        except Exception:
            log.exception("Suggestion vote failed")
            await interaction.response.send_message("Vote failed — try again.", ephemeral=True)

    @discord.ui.button(emoji="👎", style=discord.ButtonStyle.danger)
    async def down(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            up, down = await database.vote_suggestion(interaction.guild.id, self.sugg_id,
                                                      interaction.user.id, up=False)
            await interaction.response.send_message(
                f"👎 Counted — **{up}** up / **{down}** down.", ephemeral=True)
        except Exception:
            log.exception("Suggestion vote failed")
            await interaction.response.send_message("Vote failed — try again.", ephemeral=True)


class CommunityCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    # ── Giveaways ─────────────────────────────────────────────────────
    @app_commands.command(name="giveaway", description="Start a giveaway (Manage Server).")
    @app_commands.describe(prize="What are you giving away?", minutes="Duration in minutes",
                           winners="Number of winners")
    async def giveaway(self, interaction: discord.Interaction, prize: str,
                       minutes: int, winners: int = 1):
        await interaction.response.defer()
        if not interaction.user.guild_permissions.manage_guild:
            await interaction.followup.send("You need **Manage Server** permission.", ephemeral=True)
            return
        minutes = max(1, min(minutes, 60 * 24 * 14))
        ends_at = discord.utils.utcnow() + timedelta(minutes=minutes)
        e = embeds.embed("🎁 GIVEAWAY", f"**{prize[:150]}**", embeds.GOLD)
        e.add_field(name="⏰ Ends", value=f"<t:{int(ends_at.timestamp())}:R>", inline=True)
        e.add_field(name="🏆 Winners", value=str(max(1, min(winners, 20))), inline=True)
        e.add_field(name="🎉 Host", value=interaction.user.mention, inline=True)
        e.set_footer(text="Press the button to enter • MuraStream")
        msg = await interaction.followup.send(embed=e, view=GiveawayEntryView())
        await database.create_giveaway(
            interaction.guild.id, interaction.channel.id, msg.id,
            prize, interaction.user.id, ends_at, winners)

    @app_commands.command(name="reroll", description="Reroll a giveaway winner (Manage Server).")
    @app_commands.describe(channel="Channel the giveaway ended in")
    async def reroll(self, interaction: discord.Interaction, channel: discord.TextChannel):
        await interaction.response.defer(ephemeral=True)
        if not interaction.user.guild_permissions.manage_guild:
            await interaction.followup.send("You need **Manage Server** permission.", ephemeral=True)
            return
        doc = await database.last_ended_giveaway(channel.id)
        if not doc or not doc.get("entries"):
            await interaction.followup.send(
                "No ended giveaway with entries found in that channel.", ephemeral=True)
            return
        winners_n = min(int(doc.get("winners") or 1), len(doc["entries"]))
        winners = random.sample(doc["entries"], winners_n)
        mentions = " ".join(f"<@{w}>" for w in winners)
        try:
            await channel.send(
                content=f"🎉 Reroll! {mentions} — you won **{doc['prize']}**!",
                embed=embeds.ok("🎁 Giveaway Rerolled", f"**{doc['prize']}**\nNew winner(s): {mentions}"))
            await interaction.followup.send("Reroll sent ✅", ephemeral=True)
        except discord.HTTPException as exc:
            await interaction.followup.send(f"Discord rejected the reroll: {exc.status}", ephemeral=True)

    # ── Suggestions ───────────────────────────────────────────────────
    @app_commands.command(name="suggest", description="Submit a server suggestion.")
    @app_commands.describe(text="Your suggestion")
    async def suggest(self, interaction: discord.Interaction, text: str):
        await interaction.response.defer()
        if len(text.strip()) < 5:
            await interaction.followup.send("Give us a bit more detail 🙂", ephemeral=True)
            return
        sugg_id = await database.add_suggestion(interaction.guild.id, interaction.user.id, text)
        e = embeds.embed(f"💡 Suggestion #{sugg_id}", text[:450], embeds.INFO)
        e.add_field(name="Submitted by", value=interaction.user.mention, inline=True)
        e.add_field(name="Status", value="🗳️ Open", inline=True)
        e.set_footer(text="Staff: /suggestions <id> approve|deny|review • MuraStream")
        # Post to the configured suggestion channel when one is set.
        target: discord.abc.Messageable = interaction.channel
        try:
            cfg = await database.get_guild_config(interaction.guild.id)
            sugg_ch = (cfg.get("community") or {}).get("suggestionChannelId")
            if sugg_ch:
                ch = interaction.guild.get_channel(int(sugg_ch))
                if isinstance(ch, discord.TextChannel):
                    target = ch
        except Exception:
            log.warning("Suggestion channel lookup failed — posting inline")
        await target.send(embed=e, view=SuggestionVoteView(sugg_id))
        if target is not interaction.channel:
            await interaction.followup.send(
                embed=embeds.ok("💡 Suggestion posted", f"Sent to {target.mention} as **#{sugg_id}"),
                ephemeral=True)

    @app_commands.command(name="suggestions", description="Manage a suggestion (Manage Messages).")
    @app_commands.describe(sugg_id="Suggestion number", status="New status")
    @app_commands.choices(status=[
        app_commands.Choice(name="Approved", value="Approved"),
        app_commands.Choice(name="Denied", value="Denied"),
        app_commands.Choice(name="Under Review", value="Under Review"),
    ])
    async def suggestions(self, interaction: discord.Interaction, sugg_id: int,
                          status: app_commands.Choice[str]):
        await interaction.response.defer()
        if not interaction.user.guild_permissions.manage_messages:
            await interaction.followup.send("You need **Manage Messages** permission.", ephemeral=True)
            return
        ok = await database.set_suggestion_status(interaction.guild.id, sugg_id, status.value)
        if not ok:
            await interaction.followup.send(f"Suggestion #{sugg_id} not found.", ephemeral=True)
            return
        await interaction.followup.send(embed=embeds.ok(
            "✅ Suggestion updated", f"#{sugg_id} → **{status.value}** (by {interaction.user.mention})"))

    # ── Reports ───────────────────────────────────────────────────────
    @app_commands.command(name="report", description="Report a user or message to the staff.")
    @app_commands.describe(user="Who are you reporting?", reason="What happened?")
    async def report(self, interaction: discord.Interaction, user: discord.Member, reason: str):
        await interaction.response.defer(ephemeral=True)
        if user.id == interaction.user.id:
            await interaction.followup.send("You can't report yourself.", ephemeral=True)
            return
        case_id = await database.add_case(
            interaction.guild.id, user.id, interaction.user.id, "report", reason)
        # Private staff notification: find members with Manage Messages.
        staff_mentions = []
        for member in interaction.guild.members[:200]:
            if member.guild_permissions.manage_messages and not member.bot:
                staff_mentions.append(member.mention)
            if len(staff_mentions) >= 5:
                break
        e = embeds.embed(
            "📝 New Report",
            f"**Reported:** {user.mention} (`{user.id}`)\n"
            f"**By:** {interaction.user.mention}\n**Reason:** {reason[:300]}\n"
            f"**Case:** #{case_id}",
            embeds.WARN)
        ping = " ".join(staff_mentions[:5])
        await interaction.followup.send(
            content=f"{ping} — new report needs review." if ping else None,
            embed=e, ephemeral=False)
        await interaction.followup.send(
            embed=embeds.ok("✅ Report filed", f"Case #{case_id} — staff have been notified."),
            ephemeral=True)

    # ── Reminders ─────────────────────────────────────────────────────
    @app_commands.command(name="remind", description="Set a personal reminder.")
    @app_commands.describe(text="What to remind you about", minutes="In how many minutes",
                           repeat_hours="Optional: repeat every N hours")
    async def remind(self, interaction: discord.Interaction, text: str,
                     minutes: int, repeat_hours: int = 0):
        await interaction.response.defer(ephemeral=True)
        minutes = max(1, min(minutes, 60 * 24 * 30))
        due = discord.utils.utcnow() + timedelta(minutes=minutes)
        await database.add_reminder(
            interaction.user.id, interaction.channel.id, text, due,
            max(0, min(repeat_hours, 24 * 7)))
        e = embeds.ok("⏰ Reminder set",
                      f"I'll remind you **{text[:120]}** <t:{int(due.timestamp())}:R>"
                      + (f" (repeats every {repeat_hours}h)" if repeat_hours else ""))
        await interaction.followup.send(embed=e, ephemeral=True)

    # ── Reputation ────────────────────────────────────────────────────
    @app_commands.command(name="rep", description="Give reputation to a member.")
    @app_commands.describe(user="Who deserves it?")
    async def rep(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer()
        if isinstance(user, str) or not hasattr(user, "id"):
            await interaction.followup.send("That user couldn't be resolved.", ephemeral=True)
            return
        if user.id == interaction.user.id:
            await interaction.followup.send("No self-rep 😄", ephemeral=True)
            return
        ok, score = await database.give_rep(interaction.guild.id, interaction.user.id, user.id)
        if not ok:
            await interaction.followup.send(
                f"You already gave {user.mention} rep today — they have **{score}** ⭐.", ephemeral=True)
            return
        await interaction.followup.send(embed=embeds.ok(
            "⭐ Reputation given", f"{user.mention} now has **{score}** rep."))

    @app_commands.command(name="repleaderboard", description="Most-repped members.")
    async def repleaderboard(self, interaction: discord.Interaction):
        await interaction.response.defer()
        top = await database.top_rep(interaction.guild.id)
        if not top:
            await interaction.followup.send("No reputation given yet — use `/rep`!")
            return
        medals = ["🥇", "🥈", "🥉"] + ["▫️"] * 7
        lines = [f"{medals[i]} <@{d['userId']}> — **{d['score']}** ⭐" for i, d in enumerate(top[:10])]
        await interaction.followup.send(embed=embeds.embed(
            "⭐ Reputation Leaderboard", "\n".join(lines), embeds.GOLD))

    # ── Cases ─────────────────────────────────────────────────────────
    @app_commands.command(name="case", description="Look up a moderation case.")
    @app_commands.describe(case_id="Case number")
    async def case(self, interaction: discord.Interaction, case_id: int):
        await interaction.response.defer(ephemeral=True)
        if not interaction.user.guild_permissions.manage_messages:
            await interaction.followup.send("Staff only.", ephemeral=True)
            return
        c = await database.get_case(interaction.guild.id, case_id)
        if not c:
            await interaction.followup.send(f"Case #{case_id} not found.", ephemeral=True)
            return
        e = embeds.embed(
            f"📋 Case #{c['caseId']}",
            f"**Action:** {c['action']}\n**Target:** <@{c['targetId']}>\n"
            f"**Moderator:** <@{c['moderatorId']}>\n**Reason:** {c['reason']}"
            + (f"\n**Duration:** {c['duration']}" if c.get('duration') else ""),
            embeds.INFO)
        e.timestamp = c.get("createdAt")
        await interaction.followup.send(embed=e, ephemeral=True)

    @app_commands.command(name="cases", description="A member's moderation history.")
    @app_commands.describe(user="Whose record")
    async def cases(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        if not interaction.user.guild_permissions.manage_messages:
            await interaction.followup.send("Staff only.", ephemeral=True)
            return
        entries = await database.user_cases(interaction.guild.id, user.id)
        if not entries:
            await interaction.followup.send(f"{user.mention} has a clean record ✨", ephemeral=True)
            return
        lines = [f"**#{c['caseId']}** {c['action']} — {c['reason'][:60]}" for c in entries[:10]]
        await interaction.followup.send(
            embed=embeds.embed(f"📋 Cases — {user.display_name}", "\n".join(lines)), ephemeral=True)

    # ── Achievements ──────────────────────────────────────────────────
    @app_commands.command(name="achievements", description="Your unlocked achievements.")
    @app_commands.describe(user="Whose achievements (default: you)")
    async def achievements(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer()
        target = user or interaction.user
        keys = await database.get_achievements(interaction.guild.id, target.id)
        lines = []
        for key, (name, desc) in database.ACHIEVEMENTS.items():
            mark = "✅" if key in keys else "⬜"
            lines.append(f"{mark} **{name}** — {desc}")
        e = embeds.embed(
            f"🎖️ Achievements — {target.display_name}",
            "\n".join(lines),
            embeds.GOLD)
        e.add_field(name="Unlocked", value=f"{len(keys)}/{len(database.ACHIEVEMENTS)}", inline=True)
        if target.display_avatar:
            e.set_thumbnail(url=target.display_avatar.url)
        await interaction.followup.send(embed=e)

    # ── Background loops ──────────────────────────────────────────────
    @commands.Cog.listener()
    async def on_ready(self):
        if getattr(self, "_loops_started", False):
            return
        self._loops_started = True
        asyncio.create_task(self._giveaway_loop())
        asyncio.create_task(self._reminder_loop())

    async def _giveaway_loop(self):
        await self.bot.wait_until_ready()
        while not self.bot.is_closed():
            try:
                for g in await database.due_giveaways():
                    doc = await database.end_giveaway(g["messageId"])
                    if not doc or not doc["entries"]:
                        continue
                    channel = self.bot.get_channel(g["channelId"])
                    if not channel:
                        continue
                    winners_n = min(g["winners"], len(doc["entries"]))
                    winners = random.sample(doc["entries"], winners_n)
                    mentions = " ".join(f"<@{w}>" for w in winners)
                    try:
                        await channel.send(
                            content=f"🎉 {mentions} — you won **{g['prize']}**!",
                            embed=embeds.ok("🎁 Giveaway Ended",
                                            f"**{g['prize']}**\nWinners: {mentions}\n"
                                            f"{len(doc['entries'])} entries. Congratulations!"))
                    except discord.HTTPException:
                        pass
            except Exception:
                log.exception("Giveaway loop error")
            await asyncio.sleep(30)

    async def _reminder_loop(self):
        await self.bot.wait_until_ready()
        while not self.bot.is_closed():
            try:
                for r in await database.due_reminders():
                    user = self.bot.get_user(r["userId"])
                    channel = self.bot.get_channel(r["channelId"])
                    e = embeds.ok("⏰ Reminder", f"**{r['text'][:200]}**\n— set <t:{int(r['dueAt'].timestamp())}:R>")
                    try:
                        if user:
                            await user.send(embed=e)
                        elif channel:
                            await channel.send(content=f"<@{r['userId']}>", embed=e)
                    except discord.HTTPException:
                        pass
                    if r.get("recurringHours"):
                        from datetime import datetime as _dt, timezone as _tz
                        next_due = r["dueAt"] + timedelta(hours=r["recurringHours"])
                        if next_due.tzinfo is None:
                            next_due = next_due.replace(tzinfo=_tz.utc)
                        await database.add_reminder(
                            r["userId"], r["channelId"], r["text"], next_due, r["recurringHours"])
                    await database.delete_reminder(r["_id"])
            except Exception:
                log.exception("Reminder loop error")
            await asyncio.sleep(20)


async def setup(bot: commands.Bot):
    await bot.add_cog(CommunityCog(bot))
