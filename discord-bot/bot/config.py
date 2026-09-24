"""Central configuration — every value comes from the environment, never hardcoded."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _get(name: str, default: str = "") -> str:
    value = os.environ.get(name, default)
    return value.strip() if isinstance(value, str) else default


# ── Discord ──────────────────────────────────────────────────────────────
DISCORD_TOKEN = _get("DISCORD_TOKEN")
DISCORD_CLIENT_ID = _get("DISCORD_CLIENT_ID")
DISCORD_PUBLIC_KEY = _get("DISCORD_PUBLIC_KEY")
DISCORD_CLIENT_SECRET = _get("DISCORD_CLIENT_SECRET")

BOT_STATUS = _get("BOT_STATUS", "online")          # online/idle/dnd/invisible
BOT_PREFIX = _get("BOT_PREFIX", "mg!")             # default per-guild command prefix
BOT_ACTIVITY = _get("BOT_ACTIVITY", "MuraStream • /help")

# Comma-separated Discord user IDs allowed to use /requests admin actions.
# Stored as ints: every call site compares against interaction.user.id (int),
# so keeping strings here silently disabled every admin exemption.
BOT_ADMIN_IDS = {int(u) for u in
                 (part.strip() for part in _get("BOT_ADMIN_IDS").split(","))
                 if u.isdigit()}

# ── MuraStream website ───────────────────────────────────────────────────
MURASTREAM_URL = _get("MURASTREAM_URL", "https://muragoods.vercel.app").rstrip("/")
BRIDGE_SECRET = _get("DISCORD_BRIDGE_SECRET")

# ── Data sources ─────────────────────────────────────────────────────────
TMDB_API_KEY = _get("TMDB_API_KEY")
# The website's own TMDB proxy (server-side key) — used when no direct key.
TMDB_PROXY = f"{MURASTREAM_URL}/api/murastream/tmdb"

MONGO_URI = _get("MONGO_URI") or _get("DATABASE_URL")
MONGO_DB = _get("MONGO_DB", "murastream_bot")

DEPLOY_WEBHOOK_URL = _get("DEPLOY_WEBHOOK_URL")

# Proxy for yt-dlp to reach YouTube (Render datacenter IPs are often blocked).
# Format: "http://user:pass@host:port" or "socks5://user:pass@host:port"
YOUTUBE_PROXY = _get("YOUTUBE_PROXY")
# Netscape cookie jar for yt-dlp. Datacenter egress IPs are routinely challenged
# by YouTube's bot check, and supplying the operator's own cookies is the
# standard remedy. Supply EITHER a path (YT_COOKIES_FILE) or the file's contents
# (YT_COOKIES); contents are written to a private temp file at runtime. Cookies
# are never logged and must never be committed.
YT_COOKIES_FILE = _get("YT_COOKIES_FILE")
YT_COOKIES = _get("YT_COOKIES")
# Optional overrides. Left unset by default on purpose: yt-dlp's own defaults
# select a working format and rotate clients (including PO-token handling), and
# pinning either was the cause of "Requested format is not available".
YT_FORMAT = _get("YT_FORMAT")
YT_PLAYER_CLIENT = _get("YT_PLAYER_CLIENT")

# ── Behaviour tuning ─────────────────────────────────────────────────────
COMMAND_COOLDOWN_SECONDS = 3          # per-user anti-spam on API-backed commands
REQUEST_COOLDOWN_SECONDS = 60         # /request per user
MAX_REQUEST_TITLE_LEN = 120
CACHE_TTL_SECONDS = 300               # TMDB metadata cache
HTTP_TIMEOUT = 15


def validate() -> list[str]:
    """Return a list of human-readable configuration problems (empty = OK)."""
    problems: list[str] = []
    if not DISCORD_TOKEN:
        problems.append("DISCORD_TOKEN is not set")
    if not DISCORD_CLIENT_ID:
        problems.append("DISCORD_CLIENT_ID is not set")
    if BRIDGE_SECRET and len(BRIDGE_SECRET) < 16:
        problems.append("DISCORD_BRIDGE_SECRET is too short (use 32+ random chars)")
    return problems


def invite_url() -> str:
    """Least-privilege invite: no Administrator."""
    perms = (
        (1 << 10)   # View Channels
        | (1 << 11)  # Send Messages
        | (1 << 14)  # Embed Links
        | (1 << 15)  # Attach Files
        | (1 << 16)  # Read History
        | (1 << 20)  # Connect (voice) — REQUIRED for music
        | (1 << 21)  # Speak (voice) — REQUIRED for music
        | (1 << 28)  # Use Slash Commands
    )
    return (
        f"https://discord.com/oauth2/authorize?client_id={DISCORD_CLIENT_ID}"
        f"&permissions={perms}&scope=bot%20applications.commands"
    )
