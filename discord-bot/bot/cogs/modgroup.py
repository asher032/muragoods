"""`/moderation` group — the full punishment suite, warn management and cleanup.

Every subcommand calls the SAME modservice functions as the dashboard
bridge, so Discord and the dashboard behave identically. Group subcommands
do not consume top-level slash-command budget. Invoker permissions come from
modservice.USER_PERMISSIONS (the specification matrix) — one map, not
copy-pasted per command.
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import modservice
import utils

log = logging.getLogger("bot.modgroup")


def _invoker_ok(interaction: discord.Interaction, action: str) -> str | None:
    attr = modservice.USER_PERMISSIONS.get(action, "manage_guild")
    label = modservice.PERM_LABELS.get(attr, attr)
    try:
        if bool(getattr(interaction.user.guild_permissions, attr, False)):
            return None
    except Exception:
        pass
    return f"You need the **{label}** permission."


def _member_error(interaction: discord.Interaction, user) -> str | None:
    if isinstance(user, str) or not hasattr(user, "id"):
        return "That user couldn't be resolved — try picking them from the mention autocomplete."
    if user.id == interaction.user.id:
        return "You can't moderate yourself."
    if getattr(user, "bot", False):
        return "Bots can't be moderated this way."
    return None


async def _run(interaction: discord.Interaction, action: str, coro_factory, success_title: str):
    """Defer → service → one embed answer. Always acknowledges."""
    deny = _invoker_ok(interaction, action)
    if deny:
        await interaction.response.send_message(deny, ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    try:
        res = await coro_factory()
    except Exception as exc:
        log.warning("modservice %s raised: %s", action, type(exc).__name__)
        await interaction.followup.send(
            embed=utils.base_embed("⚠️ Failed", f"{action} failed unexpectedly ({type(exc).__name__})."),
            ephemeral=True)
        return
    if res.get("ok"):
        detail = res.get("detail") or _detail(action, res)
        await interaction.followup.send(
            embed=utils.base_embed(success_title, detail), ephemeral=True)
    else:
        await interaction.followup.send(
            embed=utils.base_embed("⚠️ Failed", str(res.get("error") or "Action failed.")),
            ephemeral=True)


def _detail(action: str, res: dict) -> str:
    target = res.get("target") or ""
    extra = []
    if res.get("caseId"):
        extra.append(f"Case **#{res['caseId']}**")
    if res.get("warningCount"):
        extra.append(f"warning **#{res['warningCount']}**")
    if res.get("dmSent") is False:
        extra.append("DM not delivered")
    suffix = f" ({'; '.join(extra)})" if extra else ""
    return f"{target}{suffix}"


def _svc_kwargs(interaction: discord.Interaction) -> dict:
    return {"actor_id": interaction.user.id, "source": "discord"}


async def _escalate(interaction, user, count: int) -> None:
    """Best-effort warn escalation via the moderation cog when loaded."""
    try:
        cog = interaction.client.get_cog("ModerationCog") if interaction.client else None
        if cog and hasattr(cog, "_apply_warn_thresholds"):
            await cog._apply_warn_thresholds(interaction, user, count)
    except Exception:
        pass


class ModerationGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    mod = app_commands.Group(name="moderation", description="Punishments, warnings and cleanup")

    async def _unban_choices(self, interaction: discord.Interaction,
                             current: str) -> list[app_commands.Choice[str]]:
        """Autocomplete banned users by name — no manual ID entry needed."""
        try:
            bans = [entry async for entry in interaction.guild.bans(limit=100)]
        except (discord.Forbidden, discord.HTTPException):
            return []
        q = (current or "").lower()
        out = []
        for entry in bans:
            label = f"{entry.user.display_name} (@{entry.user.name})"
            if q and q not in label.lower():
                continue
            out.append(app_commands.Choice(name=label[:100], value=str(entry.user.id)))
            if len(out) >= 25:
                break
        return out

    # ── Punishments ──
    @mod.command(name="ban", description="Ban a member (Ban Members).")
    @app_commands.describe(user="Member to ban", delete_days="Days of message history to delete",
                           reason="Why?")
    @app_commands.choices(delete_days=[
        app_commands.Choice(name="None", value=0),
        app_commands.Choice(name="Last 1 day", value=1),
        app_commands.Choice(name="Last 7 days", value=7),
    ])
    async def mod_ban(self, interaction: discord.Interaction, user: discord.Member,
                      reason: str = "No reason given", delete_days: int = 0):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return

        async def run():
            res = await modservice.ban_member(
                self.bot, database, interaction.guild.id, user.id, reason,
                delete_days=int(delete_days.value if hasattr(delete_days, "value") else delete_days),
                **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = user.mention
            return res
        await _run(interaction, "ban", run, "🔨 Banned")

    @mod.command(name="kick", description="Kick a member (Kick Members).")
    async def mod_kick(self, interaction: discord.Interaction, user: discord.Member,
                       reason: str = "No reason given"):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return

        async def run():
            res = await modservice.kick_member(
                self.bot, database, interaction.guild.id, user.id, reason, **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = user.mention
            return res
        await _run(interaction, "kick", run, "👢 Kicked")

    @mod.command(name="softban", description="Ban then immediately unban to clear history (Ban Members).")
    @app_commands.describe(user="Member", days="Days of message history to delete", reason="Why?")
    async def mod_softban(self, interaction: discord.Interaction, user: discord.Member,
                          days: int = 1, reason: str = "No reason given"):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return

        async def run():
            res = await modservice.softban_member(
                self.bot, database, interaction.guild.id, user.id, reason,
                delete_days=max(0, min(int(days or 1), 7)), **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = user.mention
            return res
        await _run(interaction, "softban", run, "🧹 Softbanned")

    @mod.command(name="tempban", description="Ban for a duration, then auto-unban (Ban Members).")
    @app_commands.describe(user="Member", duration="e.g. 1h, 7d", delete_days="History to delete",
                           reason="Why?")
    async def mod_tempban(self, interaction: discord.Interaction, user: discord.Member,
                          duration: str = "1h", delete_days: int = 0,
                          reason: str = "No reason given"):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        minutes = modservice.parse_duration_minutes(duration, default=-1)
        if minutes is None or minutes < 0:
            await interaction.response.send_message(
                "Duration not understood — try `30m`, `2h`, `7d`.", ephemeral=True)
            return

        async def run():
            res = await modservice.tempban_member(
                self.bot, database, interaction.guild.id, user.id, reason,
                delete_days=max(0, min(int(delete_days or 0), 7)),
                duration_minutes=minutes, **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = f"{user.mention} for **{duration}**"
            return res
        await _run(interaction, "tempban", run, "⏳ Temporarily banned")

    @mod.command(name="mute", description="Mute via the configured Muterole (Manage Roles).")
    @app_commands.describe(user="Member", duration="e.g. 10m, 1h (empty = indefinite)", reason="Why?")
    async def mod_mute(self, interaction: discord.Interaction, user: discord.Member,
                       duration: str = "", reason: str = "No reason given"):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        minutes = modservice.parse_duration_minutes(duration, default=None) if duration.strip() else None
        if duration.strip() and minutes is None:
            await interaction.response.send_message(
                "Duration not understood — try `10m`, `1h`, `7d`.", ephemeral=True)
            return

        async def run():
            res = await modservice.mute_member(
                self.bot, database, interaction.guild.id, user.id, reason,
                duration_minutes=minutes, **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = f"{user.mention}" + (f" for **{duration}**" if duration.strip() else "")
            return res
        await _run(interaction, "mute", run, "🔇 Muted")

    @mod.command(name="hardmute", description="Mute + strip roles, restorable (Manage Roles).")
    @app_commands.describe(user="Member", duration="e.g. 1h (empty = indefinite)", reason="Why?")
    async def mod_hardmute(self, interaction: discord.Interaction, user: discord.Member,
                           duration: str = "", reason: str = "No reason given"):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        minutes = modservice.parse_duration_minutes(duration, default=None) if duration.strip() else None
        if duration.strip() and minutes is None:
            await interaction.response.send_message(
                "Duration not understood — try `10m`, `1h`, `7d`.", ephemeral=True)
            return

        async def run():
            res = await modservice.hardmute_member(
                self.bot, database, interaction.guild.id, user.id, reason,
                duration_minutes=minutes, **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = f"{user.mention}" + (f" for **{duration}**" if duration.strip() else "")
            return res
        await _run(interaction, "hardmute", run, "🔇 Hard-muted")

    @mod.command(name="unmute", description="Remove the Muterole, restore roles (Manage Roles).")
    async def mod_unmute(self, interaction: discord.Interaction, user: discord.Member,
                         reason: str = "Unmuted"):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return

        async def run():
            res = await modservice.unmute_member(
                self.bot, database, interaction.guild.id, user.id, reason, **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = user.mention
            return res
        await _run(interaction, "unmute", run, "🔊 Unmuted")

    @mod.command(name="unban", description="Unban a user, picked from the ban list (Ban Members).")
    @app_commands.describe(user_id="Banned user — start typing to search")
    @app_commands.autocomplete(user_id=_unban_choices)
    async def mod_unban(self, interaction: discord.Interaction, user_id: str):
        async def run():
            try:
                uid = int(user_id)
            except (TypeError, ValueError):
                return {"ok": False, "code": "INVALID_INPUT",
                        "error": "Pick a banned user from the list."}
            res = await modservice.unban_member(
                self.bot, database, interaction.guild.id, uid,
                f"Unbanned by {getattr(interaction.user, 'display_name', 'moderator')}",
                **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = f"<@{uid}> can rejoin"
            return res
        await _run(interaction, "unban", run, "✅ Unbanned")

    @mod.command(name="warn", description="Warn a member (Manage Roles).")
    async def mod_warn(self, interaction: discord.Interaction, user: discord.Member, reason: str):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        deny = _invoker_ok(interaction, "warn")
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        try:
            res = await modservice.warn_member(
                self.bot, database, interaction.guild.id, user.id, reason, **_svc_kwargs(interaction))
        except Exception as exc:
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", f"Warn failed ({type(exc).__name__})."),
                ephemeral=True)
            return
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(
            embed=utils.base_embed("⚠️ Warning issued",
                                   f"{user.mention} — warning **#{res.get('warningCount')}**\nReason: {reason}"),
            ephemeral=True)
        await _escalate(interaction, user, int(res.get("warningCount") or 0))

    @mod.command(name="timeout", description="Timeout a member (Timeout Members).")
    @app_commands.describe(user="Member", minutes="Duration in minutes", reason="Why?")
    async def mod_timeout(self, interaction: discord.Interaction, user: discord.Member,
                          minutes: int, reason: str = "No reason given"):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return

        async def run():
            res = await modservice.timeout_member(
                self.bot, database, interaction.guild.id, user.id, max(1, min(int(minutes or 10), 40320)),
                reason, **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = f"{user.mention} for **{minutes}** minutes"
            return res
        await _run(interaction, "timeout", run, "🔇 Timed out")

    @mod.command(name="removetimeout", description="Remove a timeout (Timeout Members).")
    async def mod_removetimeout(self, interaction: discord.Interaction, user: discord.Member,
                                reason: str = "Timeout removed"):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return

        async def run():
            res = await modservice.remove_timeout(
                self.bot, database, interaction.guild.id, user.id, reason, **_svc_kwargs(interaction))
            if res.get("ok"):
                res["target"] = user.mention
            return res
        await _run(interaction, "removetimeout", run, "🔊 Timeout removed")

    # ── Warning management ──
    @mod.command(name="warns", description="Show a member's warnings (Manage Roles).")
    async def mod_warns(self, interaction: discord.Interaction, user: discord.Member):
        if isinstance(user, str) or not hasattr(user, "id"):
            await interaction.response.send_message(
                "That user couldn't be resolved — try the mention autocomplete.", ephemeral=True)
            return
        deny = _invoker_ok(interaction, "warnings")
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        res = await modservice.view_warnings(database, interaction.guild.id, user.id)
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        entries = res.get("warnings") or []
        if not entries:
            await interaction.followup.send(f"{user.mention} has a clean record ✨", ephemeral=True)
            return
        lines = [f"**{i}.** {e['reason']} — <@{e['moderatorId']}>" for i, e in enumerate(entries, 1)]
        await interaction.followup.send(
            embed=utils.base_embed(f"⚠️ Warnings — {user.display_name}", "\n".join(lines)),
            ephemeral=True)

    @mod.command(name="removewarning", description="Remove one warning by number (Manage Roles).")
    @app_commands.describe(user="Member", index="Warning number (see warns)")
    async def mod_removewarning(self, interaction: discord.Interaction, user: discord.Member, index: int):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return

        async def run():
            res = await modservice.remove_warning(database, interaction.guild.id, user.id, int(index))
            if res.get("ok"):
                res["target"] = f"warning **#{index}** from {user.mention}"
            return res
        await _run(interaction, "removewarning", run, "🧹 Warning removed")

    @mod.command(name="clearwarnings", description="Clear a member's warnings (Manage Roles).")
    async def mod_clearwarnings(self, interaction: discord.Interaction, user: discord.Member):
        err = _member_error(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return

        async def run():
            res = await modservice.clear_warnings(database, interaction.guild.id, user.id)
            if res.get("ok"):
                res["target"] = f"{user.mention}'s record is now clean"
            return res
        await _run(interaction, "clearwarnings", run, "🧹 Warnings cleared")

    @mod.command(name="cleanup", description="Delete the bot's recent messages here (Manage Server).")
    @app_commands.describe(count="How many (1–100)")
    async def mod_cleanup(self, interaction: discord.Interaction, count: int = 20):
        async def run():
            channel = interaction.channel
            channel_id = getattr(channel, "id", 0)
            res = await modservice.purge_messages(
                self.bot, database, interaction.guild.id, int(channel_id),
                "bot", max(1, min(int(count or 20), 100)),
                actor_id=interaction.user.id, source="discord")
            if res.get("ok"):
                res["target"] = f"**{res.get('deleted', 0)}** bot messages removed"
            return res
        await _run(interaction, "cleanup", run, "🧹 Cleanup")


async def setup(bot: commands.Bot):
    await bot.add_cog(ModerationGroup(bot))
