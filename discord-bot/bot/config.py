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
BOT_ACTIVITY = _get("BOT_ACTIVITY", "MuraStream • /help")

# Comma-separated Discord user IDs allowed to use /requests admin actions.
BOT_ADMIN_IDS = {u.strip() for u in _get("BOT_ADMIN_IDS").split(",") if u.strip()}

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
        # view/send/embed/link/attach/read history/mention/use app commands
        "1024"
        + (1 << 10)   # send messages in threads
        + (1 << 11)   # connect (voice)
        + (1 << 12)   # speak (voice)
        + (1 << 14)   # mute members (music /voicecontrol needs it rarely; keep minimal)
        + (1 << 20)   # moderate members (timeouts for /mute)
        + (1 << 13)   # move members not requested — omit
    )
    # Keep it simple and auditable:
    perms = 154624  # View Channels, Send Messages, Embed Links, Attach Files,
                    # Read History, Mention Everyone(off), Connect, Speak,
                    # Use Slash Commands, Moderate Members
    return (
        f"https://discord.com/oauth2/authorize?client_id={DISCORD_CLIENT_ID}"
        f"&permissions={perms}&scope=bot%20applications.commands"
    )
