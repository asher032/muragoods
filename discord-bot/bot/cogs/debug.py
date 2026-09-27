"""`/debug permissions` — owner/admin-only permission truth report.

Resolves the invoker AND the bot from the CURRENT interaction guild (never a
cached member, never another guild, never the dashboard) and reports both
permission sets plus the effective channel perms. Follows the same rules as
every action: Cloudflare-blocked lookups (40333) are reported as network
blocks, unresolvable members as lookup failures — never as fake denials.
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import modservice
import utils

log = logging.getLogger("bot.debug")

MANAGE_CHANNELS_BIT = 1 << 4


def _names(perms: discord.Permissions) -> list[str]:
    try:
        return sorted(name for name, value in iter(perms) if value)
    except Exception:
        return []


class DebugGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    debug = app_commands.Group(
        name="debug", description="Diagnostics (server owner / admins only)")

    @debug.command(name="permissions", description="Show real user/bot/channel permissions.")
    @app_commands.describe(channel="Channel to evaluate (current if empty)")
    async def permissions(self, interaction: discord.Interaction,
                          channel: discord.TextChannel | None = None):
        guild = interaction.guild
        if guild is None:
            await interaction.response.send_message(
                "Guild context unavailable.", ephemeral=True)
            return
        invoker = getattr(interaction, "member", None) or interaction.user
        if invoker is None or not hasattr(invoker, "id"):
            await interaction.response.send_message(
                "Could not resolve your member record.", ephemeral=True)
            return
        user_perms = getattr(invoker, "guild_permissions", None)
        is_owner = interaction.user.id == guild.owner_id
        is_admin = bool(user_perms and getattr(user_perms, "administrator", False))
        if not (is_owner or is_admin):
            await interaction.response.send_message(
                "Server owner or Administrator only.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)

        target = channel or interaction.channel
        lines: list[str] = []
        lines.append(f"Guild: **{guild.name}** (`{guild.id}`)")

        # ── User side (from THIS interaction, not the dashboard) ──
        lines.append(f"User: **{interaction.user}** (`{interaction.user.id}`)")
        user_roles = [getattr(r, "name", "?") for r in (getattr(invoker, "roles", []) or [])]
        lines.append(f"User roles: {', '.join(user_roles) or '(none)'}")
        user_manage = bool(user_perms and getattr(user_perms, "manage_channels", False))
        lines.append(f"USER Manage Channels: **{user_manage}**")

        # ── Bot side: fresh member from THIS guild ──
        me = getattr(guild, "me", None)
        fresh = await modservice.refresh_bot_member(guild)
        bot_member = fresh if fresh is not None else me
        if bot_member is None:
            await interaction.followup.send(embed=utils.base_embed(
                "🔍 Permission Debug — INCONCLUSIVE",
                "\n".join(lines) + "\n\nBot member lookup failed — "
                "could not resolve my member record. This is a lookup "
                "failure, NOT a denial. Retry in a moment."), ephemeral=True)
            return
        bot_roles = [getattr(r, "name", "?") for r in (getattr(bot_member, "roles", []) or [])]
        lines.append(f"Bot member: <@{bot_member.id}> roles: {', '.join(bot_roles) or '(none)'}")
        if fresh is not None and me is not None and fresh is not me:
            lines.append("_Note: live member re-fetched (cache was stale)._")
        bot_perms = getattr(bot_member, "guild_permissions", None)
        granted = _names(bot_perms) if bot_perms is not None else []
        lines.append(f"BOT guild permissions: {', '.join(granted) or '(none)'}")

        # ── Channel-effective check (only where meaningful) ──
        result = "PASS"
        reason = "Bot holds Manage Channels here."
        bot_manage = False
        try:
            if target is not None and hasattr(target, "permissions_for"):
                effective = target.permissions_for(bot_member)
                bot_manage = bool(getattr(effective, "manage_channels", False))
                lines.append(
                    f"Channel: **#{getattr(target, 'name', '?')}** — "
                    f"BOT Manage Channels: **{bot_manage}**")
            else:
                bot_global = bool(bot_perms and getattr(bot_perms, "manage_channels", False))
                bot_manage = bot_global
                lines.append(f"BOT Manage Channels (guild): **{bot_manage}**")
        except discord.Forbidden as exc:
            if modservice.is_cloudflare_block(exc):
                result = "INCONCLUSIVE"
                reason = ("Discord's network filter blocked the permission read "
                          "(Cloudflare) — retry, do not assume denial.")
            else:
                result = "FAIL"
                reason = "Discord refused the permission read."
            lines.append(f"Channel read: blocked ({type(exc).__name__})")
        except Exception as exc:
            result = "INCONCLUSIVE"
            reason = f"Channel lookup failed ({type(exc).__name__}) — not a denial."
            lines.append("Channel read: lookup failed.")
        if result == "PASS" and not bot_manage:
            result = "FAIL"
            reason = "Bot lacks Manage Channels here (verified live)."

        lines.append(f"\nRESULT: **{result}**\nREASON: {reason}")
        await interaction.followup.send(embed=utils.base_embed(
            "🔍 Permission Debug", "\n".join(lines)[:4000]), ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(DebugGroup(bot))
