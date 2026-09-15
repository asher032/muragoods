"""Shared helpers: brand-styled embeds, safe link handling, cooldowns."""

import logging
from typing import Any

import discord

import config
import database

log = logging.getLogger("bot.utils")

BRAND_COLOR = 0xE50914   # MuraStream red
GOLD = 0xD4AF37

ICON = {
    "movie": "🎬", "tv": "📺", "anime": "🍥", "music": "🎵", "food": "🍔",
    "letter": "💌", "game": "🎮", "points": "⭐", "reward": "🎁",
    "profile": "👤", "watch": "▶️", "help": "📖", "warn": "⚠️", "mod": "🛡️",
    "request": "📋", "comments": "💬", "party": "👥",
}


def base_embed(title: str, description: str | None = None, color: int = BRAND_COLOR) -> discord.Embed:
    embed = discord.Embed(title=title, description=description, color=color)
    embed.set_footer(text="MuraStream • Muragoods", icon_url=None)
    return embed


def media_embed(item: dict[str, Any]) -> discord.Embed:
    """Embed for a normalized TMDB item from bot.tmdb."""
    kind = item.get("type", "movie")
    icon = ICON.get(kind, "🎬")
    rating = item.get("rating") or 0
    title = item.get("title", "Untitled")
    year = item.get("year", "")
    label = f"{icon} {title}" + (f" ({year})" if year else "")
    embed = base_embed(label, (item.get("overview") or "No description available.")[:400])
    if rating:
        embed.add_field(name="⭐ Rating", value=f"{float(rating):.1f}/10", inline=True)
    if item.get("date"):
        embed.add_field(name="📅 Release", value=str(item["date"]), inline=True)
    if item.get("type"):
        embed.add_field(name="🗂️ Type", value="Movie" if kind == "movie" else "TV Series", inline=True)
    if item.get("poster"):
        embed.set_thumbnail(url=item["poster"])
    if item.get("backdrop"):
        embed.set_image(url=item["backdrop"])
    return embed


def watch_link_button(item: dict[str, Any], season: int = 1, episode: int = 1) -> discord.ui.Button:
    from urllib.parse import quote_plus
    import bridge
    url = bridge.watch_url(item.get("type", "movie"), int(item.get("id", 0)), season, episode)
    return discord.ui.Button(label="▶ Watch on MuraStream", url=url, row=0)


def site_link_button(label: str, url: str, emoji: str | None = None) -> discord.ui.Button:
    return discord.ui.Button(label=label, url=url, emoji=emoji or "🔗")


async def cooldown_check(interaction: discord.Interaction, bucket: str, seconds: int | None = None) -> bool:
    """Returns True if the user is allowed to proceed; False replies with remaining time."""
    if interaction.user.id in config.BOT_ADMIN_IDS:
        return True
    remaining = await database.check_cooldown(f"cmd:{bucket}:{interaction.user.id}", seconds or config.COMMAND_COOLDOWN_SECONDS)
    if remaining:
        try:
            await interaction.response.send_message(
                embed=base_embed("⏳ Slow down", f"Try again in **{remaining}s**."),
                ephemeral=True,
            )
        except discord.HTTPException:
            pass
        return False
    return True


def safe_external_url(url: str) -> str | None:
    """Only allow https URLs to the configured site."""
    if not url.startswith("https://"):
        return None
    return url


def chunk_text(text: str, limit: int = 1024) -> list[str]:
    return [text[i:i + limit] for i in range(0, len(text), limit)]
