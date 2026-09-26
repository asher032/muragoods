"""`/notes` group — staff notebook (Manage Server).

DB-only: no Discord permission is needed to store notes, so these work even
for users who already left the server. Same modservice functions as the
dashboard bridge — one implementation, two interfaces.
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import modservice
import utils

log = logging.getLogger("bot.notes")


def _deny(interaction: discord.Interaction, action: str) -> str | None:
    attr = modservice.USER_PERMISSIONS.get(action, "manage_guild")
    try:
        if bool(getattr(interaction.user.guild_permissions, attr, False)):
            return None
    except Exception:
        pass
    return "You need the **Manage Server** permission."


class NotesGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    notes = app_commands.Group(name="notes", description="Staff notebook for members")

    @notes.command(name="setnote", description="Save a staff note about a member (Manage Server).")
    @app_commands.describe(user="Member", note="The note (max 1000 chars)")
    async def setnote(self, interaction: discord.Interaction, user: discord.Member, note: str):
        deny = _deny(interaction, "setnote")
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        if isinstance(user, str) or not hasattr(user, "id"):
            await interaction.response.send_message(
                "That user couldn't be resolved — try the mention autocomplete.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        try:
            res = await modservice.set_note(database, interaction.guild.id, user.id, note,
                                            interaction.user.id)
        except Exception as exc:
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", f"Note failed ({type(exc).__name__})."),
                ephemeral=True)
            return
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(
            embed=utils.base_embed("📝 Note saved",
                                   f"{user.mention} — note **#{res.get('noteId')}** recorded."),
            ephemeral=True)

    @notes.command(name="view", description="View a member's staff notes (Manage Server).")
    async def view(self, interaction: discord.Interaction, user: discord.Member):
        deny = _deny(interaction, "viewnotes")
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        if isinstance(user, str) or not hasattr(user, "id"):
            await interaction.response.send_message(
                "That user couldn't be resolved — try the mention autocomplete.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        res = await modservice.view_notes(database, interaction.guild.id, user.id)
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        entries = res.get("notes") or []
        if not entries:
            await interaction.followup.send(f"{user.mention} has no notes.", ephemeral=True)
            return
        lines = [f"**#{n['noteId']}** {n['text'][:120]} — <@{n['moderatorId']}>" for n in entries[:15]]
        await interaction.followup.send(
            embed=utils.base_embed(f"📝 Notes — {user.display_name}", "\n".join(lines)),
            ephemeral=True)

    @notes.command(name="removenote", description="Delete one staff note by ID (Manage Server).")
    @app_commands.describe(note_id="Note number (see /notes view)")
    async def removenote(self, interaction: discord.Interaction, note_id: int):
        deny = _deny(interaction, "removenote")
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        res = await modservice.remove_note(database, interaction.guild.id, int(note_id))
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(
            embed=utils.base_embed("🧹 Note removed", f"Note **#{note_id}** deleted."),
            ephemeral=True)

    @notes.command(name="clearnotes", description="Delete all staff notes for a member (Manage Server).")
    async def clearnotes(self, interaction: discord.Interaction, user: discord.Member):
        deny = _deny(interaction, "clearnotes")
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        if isinstance(user, str) or not hasattr(user, "id"):
            await interaction.response.send_message(
                "That user couldn't be resolved — try the mention autocomplete.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        res = await modservice.clear_notes(database, interaction.guild.id, user.id)
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(
            embed=utils.base_embed("🧹 Notes cleared",
                                   f"Removed **{res.get('cleared', 0)}** notes for {user.mention}."),
            ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(NotesGroup(bot))
