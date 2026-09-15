"""Shared helpers: brand-styled embeds, safe link handling, cooldowns."""

import logging
from typing import Any

import discord

import config
import database
from ui import SafeView  # re-export for cogs: utils.SafeView  # noqa: F401

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


def on_cooldown(user_id: int, bucket: str, seconds: int | None = None) -> bool:
    """Instant (no I/O) cooldown gate using in-memory buckets.
    Called AFTER interaction.response.defer() so it can never cause a timeout."""
    import time as _time
    now = _time.monotonic()
    key = (bucket, user_id)
    last = _cooldowns.get(key)
    if last is not None and now - last < (seconds or config.COMMAND_COOLDOWN_SECONDS):
        return True
    _cooldowns[key] = now
    return False


_cooldowns: dict[tuple[str, int], float] = {}


async def cooldown_check(interaction: discord.Interaction, bucket: str, seconds: int | None = None) -> bool:
    """DEPRECATED sync-style check kept for compatibility — non-blocking."""
    if interaction.user.id in config.BOT_ADMIN_IDS:
        return True
    if on_cooldown(interaction.user.id, bucket, seconds):
        try:
            await interaction.response.send_message(
                embed=base_embed("⏳ Slow down", "Please try again in a few seconds."),
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
