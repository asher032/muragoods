"""Safe persistent UI: guaranteed acknowledgement + friendly expiry handling.

Every view/subview used by the bot extends SafeView so no button or select can
ever produce "The application did not respond": interactions are acked inside
the view, failures produce an error-ID embed, and expired views say so.
"""

import logging

import discord

import embeds

log = logging.getLogger("bot.ui")


class SafeView(discord.ui.View):
    """Base view: catches every component failure and always responds."""

    async def _safe(self, interaction: discord.Interaction, coro_factory):
        """Run a component callback with guaranteed ack + error handling."""
        try:
            await coro_factory()
        except discord.errors.NotFound:
            # Interaction token expired (3 min) or message deleted.
            try:
                await interaction.response.send_message(
                    embed=embeds.embed("⏱️ Expired", "Please run the command again.", embeds.WARN),
                    ephemeral=True)
            except discord.HTTPException:
                pass
        except Exception:
            error_id = embeds.new_error_id()
            log.exception("Component error (id=%s)", error_id)
            try:
                if interaction.response.is_done():
                    await interaction.followup.send(embed=embeds.err_embed(error_id), ephemeral=True)
                else:
                    await interaction.response.send_message(embed=embeds.err_embed(error_id), ephemeral=True)
            except discord.HTTPException:
                pass

    async def on_error(self, interaction: discord.Interaction, error: Exception, item) -> None:
        error_id = embeds.new_error_id()
        log.exception("View error (id=%s)", error_id)
        try:
            if interaction.response.is_done():
                await interaction.followup.send(embed=embeds.err_embed(error_id), ephemeral=True)
            else:
                await interaction.response.send_message(embed=embeds.err_embed(error_id), ephemeral=True)
        except discord.HTTPException:
            pass


class MediaSelect(discord.ui.Select):
    """Search results picker with guaranteed ack."""

    def __init__(self, items: list[dict], requester_id: int):
        self.items = items
        self.requester_id = requester_id
        options = []
        for i, item in enumerate(items[:25]):
            icon = "🎬" if item.get("type") == "movie" else "📺"
            options.append(discord.SelectOption(
                label=f"{icon} {item.get('title', 'Untitled')}"[:100],
                description=(item.get("overview") or "No description")[:100],
                value=str(i),
            ))
        super().__init__(placeholder="Pick a title…", options=options)

    async def callback(self, interaction: discord.Interaction):
        view: SafeView = self.view  # type: ignore[assignment]
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message("This menu isn't yours — run your own search.", ephemeral=True)
            return
        item = self.items[int(self.values[0])]

        import bridge
        from . import embeds as E
        e = E.embed(f"{item.get('title', 'Untitled')}", (item.get("overview") or "")[:400])
        E.media_item_fields(e, item)
        if item.get("poster"):
            e.set_thumbnail(url=item["poster"])
        v = discord.ui.View()
        v.add_item(discord.ui.Button(label="▶ Watch", url=bridge.watch_url(
            item.get("type", "movie"), int(item.get("id", 0)))))
        v.add_item(discord.ui.Button(label="🔗 Open MuraStream", url=bridge.details_url(
            item.get("type", "movie"), int(item.get("id", 0)))))
        await interaction.response.edit_message(embed=e, view=v)


class MediaSelectView(SafeView):
    def __init__(self, items, requester_id, timeout=180):
        super().__init__(timeout=timeout)
        self.add_item(MediaSelect(items, requester_id))
