"""Embed design system — one consistent MuraStream look across every response."""

import logging
import secrets
import time
from typing import Any

import discord

import config

log = logging.getLogger("bot.embeds")

BRAND = 0xE50914
GOLD = 0xD4AF37
OK = 0x2ECC40
WARN = 0xF39C12
ERROR = 0xE74C3C
INFO = 0x3498DB
MUSIC = 0x9B59B6
MOD = 0x95A5A6
SEC = 0x8E44AD

APP_FOOTER = "MuraStream • muragoods.vercel.app"


def embed(title: str, description: str | None = None,
          color: int = BRAND, *, footer: str | None = None,
          thumbnail: str | None = None, image: str | None = None) -> discord.Embed:
    e = discord.Embed(title=title[:256], description=description, color=color)
    e.set_footer(text=footer or APP_FOOTER)
    if thumbnail:
        e.set_thumbnail(url=thumbnail)
    if image:
        e.set_image(url=image)
    e.timestamp = discord.utils.utcnow()
    return e


def err_embed(error_id: str, reason: str | None = None,
              hint: str | None = None) -> discord.Embed:
    """User-safe error embed; the real exception goes to server logs only.

    A bare "something went wrong" is unactionable — and because the same embed
    is used for every failure, a user seeing it for command after command had
    no way to tell an offline database from a missing permission. `reason`
    states WHAT failed and `hint` what to do about it, without exposing the
    exception, which can contain internals.
    """
    lines = ["We couldn't complete that action."]
    if reason:
        lines.append(f"**Reason:** {reason}")
    if hint:
        lines.append(hint)
    lines.append(f"Error ID: `{error_id}`")
    return embed(
        "⚠️ Something went wrong",
        "\n\n".join(lines),
        color=ERROR,
    )


def new_error_id() -> str:
    return f"MS-{secrets.token_hex(3).upper()}"


def ok(title: str, description: str | None = None, **kw) -> discord.Embed:
    return embed(title, description, OK, **kw)


def warn_embed(title: str, description: str | None = None, **kw) -> discord.Embed:
    return embed(title, description, WARN, **kw)


def music(title: str, description: str | None = None, **kw) -> discord.Embed:
    return embed(title, description, MUSIC, **kw)


def media_item_fields(e: discord.Embed, item: dict[str, Any]) -> None:
    """Standardized ⭐/📅/🎭 fields for a normalized TMDB item."""
    rating = item.get("rating") or 0
    if rating:
        e.add_field(name="⭐ Rating", value=f"{float(rating):.1f}/10", inline=True)
    if item.get("year"):
        e.add_field(name="📅 Year", value=str(item["year"]), inline=True)
    if item.get("date"):
        e.add_field(name="🗓️ Released", value=str(item["date"]), inline=True)


def bar(current: float, total: float, width: int = 14) -> str:
    """Text progress bar for music positions."""
    if total <= 0:
        return "🔘" + "▬" * (width - 1)
    frac = max(0.0, min(1.0, current / total))
    filled = round(frac * width)
    return "▬" * filled + "🔘" + "▬" * (width - filled - 1)


def fmt_duration(seconds: float | int | None) -> str:
    if not seconds or seconds <= 0:
        return "live"
    seconds = int(seconds)
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"
