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


async def giveaway_config(guild_id: int) -> dict:
    """The Giveaways panel the dashboard saves, read from the SAME document.

    The dashboard writes this section through /api/dashboard/config; if this
    function read anything else the panel would be decorative, which is exactly
    the bug that let "Giveaway settings cannot be saved" go unnoticed — the
    command never consulted any config at all.
    """
    try:
        cfg = await database.get_guild_config(guild_id)
    except Exception:
        log.warning("Giveaway config lookup failed — using defaults", exc_info=True)
        return {}
    raw = cfg.get("giveaways")
    return raw if isinstance(raw, dict) else {}


def _num(value, lo: int, hi: int, default: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


async def _eligibility_error(guild, user, cfg: dict) -> str | None:
    """None when `user` may enter, else the exact reason to show them.

    Checked at ENTRY time rather than at draw time so an ineligible member is
    told immediately instead of silently dropped after the giveaway ends.
    """
    if not guild or not user:
        return None

    required_role = str(cfg.get("requiredRoleId") or "").strip()
    if required_role.isdigit():
        role = guild.get_role(int(required_role))
        # A role id that no longer resolves is a real problem — refusing entry
        # beats admitting everyone to a giveaway the panel says is restricted.
        if role is None:
            return "This giveaway's required role no longer exists on the server."
        if not any(r.id == role.id for r in user.roles):
            return f"You need the **{role.name}** role to enter this giveaway."

    min_days = _num(cfg.get("minAccountAge"), 0, 3650, 0)
    if min_days > 0:
        member = guild.get_member(user.id)
        joined = getattr(member, "joined_at", None) or getattr(user, "joined_at", None)
        if joined is not None and joined.tzinfo is None:
            from datetime import timezone as _tz
            joined = joined.replace(tzinfo=_tz.utc)
        if joined is not None:
            age_days = (discord.utils.utcnow() - joined).days
            if age_days < min_days:
                return (f"Your account must be at least **{min_days} day(s)** old "
                        f"to enter — {age_days} day(s) so far.")

    active_days = _num(cfg.get("requiredActivity"), 0, 3650, 0)
    if active_days > 0:
        member = guild.get_member(user.id)
        joined = getattr(member, "joined_at", None) or getattr(user, "joined_at", None)
        if joined is not None and joined.tzinfo is None:
            from datetime import timezone as _tz
            joined = joined.replace(tzinfo=_tz.utc)
        if joined is not None:
            active = (discord.utils.utcnow() - joined).days
            if active < active_days:
                return (f"You need **{active_days} day(s)** of activity on this server "
                        f"to enter — {active} day(s) so far.")

    required_level = _num(cfg.get("requiredLevel"), 0, 100, 0)
    if required_level > 0:
        try:
            doc = await database._db.xp.find_one(
                {"guildId": guild.id, "userId": user.id}) or {}
        except Exception:
            log.warning("Giveaway level gate lookup failed", exc_info=True)
            return "Level requirements could not be checked. Try again shortly."
        if _num(doc.get("level"), 0, 100, 0) < required_level:
            return f"You need to be **level {required_level}** to enter this giveaway."

    return None


class GiveawayEntryView(utils.SafeView):
    """Persistent-style Join button attached to giveaway messages."""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Join Giveaway", style=discord.ButtonStyle.success, emoji="🎁")
    async def join(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is not None:
            blocked = await _eligibility_error(
                interaction.guild, interaction.user, await giveaway_config(interaction.guild.id))
            if blocked:
                await interaction.followup.send(f"✕ {blocked}", ephemeral=True)
                return
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
                       minutes: int | None = None, winners: int | None = None):
        await interaction.response.defer()
        cfg = await giveaway_config(interaction.guild.id)
        # Manage Server, OR the role the dashboard nominated as giveaway manager.
        manager_role = str(cfg.get("managerRoleId") or "").strip()
        allowed = bool(interaction.user.guild_permissions.manage_guild)
        if not allowed and manager_role.isdigit():
            role = interaction.guild.get_role(int(manager_role))
            allowed = role is not None and any(
                r.id == role.id for r in interaction.user.roles)
        if not allowed:
            await interaction.followup.send(
                "You need **Manage Server** permission"
                + (" (or the Giveaway Manager role)." if manager_role else "."),
                ephemeral=True)
            return
        # The dashboard's defaults apply when the operator did not override them
        # on this specific command.
        if minutes is None:
            minutes = _num(cfg.get("defaultDuration"), 1, 24 * 14, 24) * 60
        if winners is None:
            winners = _num(cfg.get("defaultWinners"), 1, 20, 1)
        minutes = max(1, min(minutes, 60 * 24 * 14))
        ends_at = discord.utils.utcnow() + timedelta(minutes=minutes)

        # Post where the dashboard says giveaways live. Falls back to the
        # invoking channel only when no channel is configured, so an existing
        # setup can never break by turning the panel on.
        target = interaction.channel
        configured_channel = str(cfg.get("channelId") or "").strip()
        if configured_channel.isdigit():
            resolved = interaction.guild.get_channel(int(configured_channel))
            if resolved is None:
                await interaction.followup.send(
                    "✕ The configured Giveaway Channel no longer exists on this server. "
                    "Nothing was started — fix it in the dashboard.", ephemeral=True)
                return
            if not isinstance(resolved, (discord.TextChannel, discord.Thread)):
                await interaction.followup.send(
                    "✕ The configured Giveaway Channel is not a text channel. "
                    "Nothing was started.", ephemeral=True)
                return
            perms = resolved.permissions_for(interaction.guild.me)
            if not perms or not (perms.view_channel and perms.send_messages and perms.embed_links):
                missing = [n for n, ok in (("View Channel", perms.view_channel if perms else False),
                                           ("Send Messages", perms.send_messages if perms else False),
                                           ("Embed Links", perms.embed_links if perms else False)) if not ok]
                await interaction.followup.send(
                    f"✕ I cannot post giveaways in <#{resolved.id}>. "
                    f"Missing: {', '.join(missing)}. Nothing was started.", ephemeral=True)
                return
            target = resolved

        e = embeds.embed("🎁 GIVEAWAY", f"**{prize[:150]}**", embeds.GOLD)
        e.add_field(name="⏰ Ends", value=f"<t:{int(ends_at.timestamp())}:R>", inline=True)
        e.add_field(name="🏆 Winners", value=str(max(1, min(winners, 20))), inline=True)
        e.add_field(name="🎉 Host", value=interaction.user.mention, inline=True)
        e.set_footer(text="Press the button to enter • MuraStream")
        msg = await target.send(embed=e, view=GiveawayEntryView())
        await database.create_giveaway(
            interaction.guild.id, target.id, msg.id,
            prize, interaction.user.id, ends_at, winners)
        if target.id != interaction.channel.id:
            await interaction.followup.send(
                f"🎁 Giveaway started in <#{target.id}> (the configured Giveaway Channel).",
                ephemeral=True)
        # The confirm above replaces the deferred placeholder in the invoking
        # channel; nothing further is sent there.

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
            # A reroll may name the winning channel explicitly, but when the
            # dashboard configured a Giveaway Logs channel that is where the
            # audit trail belongs.
            cfg = await giveaway_config(interaction.guild.id)
            logs_id = str(cfg.get("logsChannelId") or "").strip()
            logs = (interaction.guild.get_channel(int(logs_id))
                    if logs_id.isdigit() else None)
            await channel.send(
                content=f"🎉 Reroll! {mentions} — you won **{doc['prize']}**!",
                embed=embeds.ok("🎁 Giveaway Rerolled", f"**{doc['prize']}**\nNew winner(s): {mentions}"))
            if isinstance(logs, discord.TextChannel):
                await logs.send(embed=embeds.ok(
                    "📋 Giveaway Rerolled",
                    f"**{str(doc.get('prize') or '')[:200]}**\nNew winner(s): {mentions}"))
            await interaction.followup.send("Reroll sent ✅", ephemeral=True)
        except discord.HTTPException as exc:
            await interaction.followup.send(f"Discord rejected the reroll: {exc.status}", ephemeral=True)

    # ── Suggestions ───────────────────────────────────────────────────
    suggestions = app_commands.Group(
        name="suggestions", description="Submit and manage server suggestions")

    @suggestions.command(name="add", description="Submit a server suggestion.")
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
        e.set_footer(text="Staff: /suggestions manage <id> <status> • MuraStream")
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

    @suggestions.command(name="manage", description="Manage a suggestion (Manage Messages).")
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
    @app_commands.command(name="rep", description="Give reputation — run bare to see the leaderboard.")
    @app_commands.describe(user="Who deserves it? (omit for the leaderboard)")
    async def rep(self, interaction: discord.Interaction, user: discord.Member | None = None):
        await interaction.response.defer()
        if user is None:
            top = await database.top_rep(interaction.guild.id)
            if not top:
                await interaction.followup.send("No reputation given yet — use `/rep @user`!")
                return
            medals = ["🥇", "🥈", "🥉"] + ["▫️"] * 7
            lines = [f"{medals[i]} <@{d['userId']}> — **{d['score']}** ⭐" for i, d in enumerate(top[:10])]
            await interaction.followup.send(embed=embeds.embed(
                "⭐ Reputation Leaderboard", "\n".join(lines), embeds.GOLD))
            return
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

    # ── Cases ─────────────────────────────────────────────────────────
    @app_commands.command(name="case", description="Look up a moderation case, or a member's history.")
    @app_commands.describe(case_id="Case number", user="A member's moderation record instead")
    async def case(self, interaction: discord.Interaction, case_id: int | None = None,
                   user: discord.Member | None = None):
        await interaction.response.defer(ephemeral=True)
        if not interaction.user.guild_permissions.manage_messages:
            await interaction.followup.send("Staff only.", ephemeral=True)
            return
        if user is not None:
            entries = await database.user_cases(interaction.guild.id, user.id)
            if not entries:
                await interaction.followup.send(f"{user.mention} has a clean record ✨", ephemeral=True)
                return
            lines = [f"**#{c['caseId']}** {c['action']} — {c['reason'][:60]}" for c in entries[:10]]
            await interaction.followup.send(
                embed=embeds.embed(f"📋 Cases — {user.display_name}", "\n".join(lines)), ephemeral=True)
            return
        if case_id is None:
            await interaction.followup.send(
                "Give a case number (`/case 12`) or a member (`/case @user`).", ephemeral=True)
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

    # ── Background loops ──────────────────────────────────────────────
    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member):
        """Member left — used by welcome/leave symmetry and any future leave
        notification the server configures."""
        cfg = await database.get_guild_config(member.guild.id)
        if not cfg.get("leaveMessage"):
            return
        channel_id = cfg.get("leaveChannelId") or (await database.get_guild_config(member.guild.id)).get("channels", {}).get("leave")
        if not channel_id:
            return
        channel = member.guild.get_channel(int(channel_id))
        if not isinstance(channel, discord.TextChannel):
            return
        try:
            await channel.send(
                embed=utils.base_embed(
                    "👋 Left",
                    f"{member.mention} ({member.display_name}) left {member.guild.name}."))
        except discord.HTTPException:
            pass


    @commands.Cog.listener()
    async def on_voice_state_update(self, member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
        """Voice join/move/leave — placeholder hook for any future voice-channel
        activity features. Owned by community so music/moderation don't each
        invent their own voice bookkeeping."""
        pass


    @commands.Cog.listener()
    async def on_ready(self):
        if getattr(self, "_loops_started", False):
            return
        # Re-arm periodic loops on every session resume as well as the first ready,
        # because on_ready fires once per session, not once per process.
        self._loops_started = True
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
                    # The winner announcement above stays public in the giveaway
                    # channel; the audit line goes to the configured Giveaway
                    # Logs channel when one is set.
                    await self._log_giveaway(g, mentions, len(doc["entries"]))
            except Exception:
                log.exception("Giveaway loop error")
            await asyncio.sleep(30)

    async def _log_giveaway(self, g: dict, mentions: str, entries: int) -> None:
        """Post the giveaway result to Giveaway Logs, if the panel set one."""
        try:
            cfg = await giveaway_config(g.get("guildId"))
            logs_id = str(cfg.get("logsChannelId") or "").strip()
            if not logs_id.isdigit():
                return
            guild = self.bot.get_guild(g.get("guildId"))
            if guild is None:
                return
            logs = guild.get_channel(int(logs_id))
            if not isinstance(logs, discord.TextChannel):
                return
            await logs.send(embed=embeds.ok(
                "📋 Giveaway Ended",
                f"**{str(g.get('prize') or '')[:200]}**\n"
                f"Winners: {mentions}\nEntries: {entries}\n"
                f"Winners configured: {g.get('winners', 1)}"))
        except discord.HTTPException:
            log.warning("Giveaway log post failed for %s", g.get("messageId"), exc_info=True)
        except Exception:
            log.exception("Giveaway logging error")

    async def _reminder_loop(self):
        await self.bot.wait_until_ready()
        while not self.bot.is_closed():
            try:
                for r in await database.due_reminders():
                    # A reminder addressed to the bot itself (or a non-member
                    # resolvable only as ClientUser) can never be delivered —
                    # skip it instead of raising every 20s forever.
                    try:
                        bot_id = self.bot.user.id if self.bot.user else None
                    except Exception:
                        bot_id = None
                    if bot_id is not None and r.get("userId") == bot_id:
                        continue
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
