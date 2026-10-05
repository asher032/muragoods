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

# ── Murabot owner ───────────────────────────────────────────────────────
# The Murabot owner is a GLOBAL role: the person who owns the bot, NOT the
# owner of any particular Discord server and not "an admin". It is declared
# once, as a Discord USER ID, and every ownership check on both sides of the
# bridge compares against this value.
#
# A Discord user ID is the only stable identifier. A username, display name or
# nickname can be changed by the account holder at any time, so authorizing on
# one would let a rename break the owner OR let someone who takes the name
# through. Nothing in this codebase may authorize on a name.
#
# The website resolves the SAME variable from the same authenticated session
# (app/lib/murabot-owner.ts), so the dashboard and the bot cannot disagree
# about who the owner is.
_owner_raw = _get("MURABOT_OWNER_DISCORD_ID")
MURABOT_OWNER_DISCORD_ID: int | None = int(_owner_raw) if _owner_raw.isdigit() else None

# ── MuraStream website ───────────────────────────────────────────────────
MURASTREAM_URL = _get("MURASTREAM_URL", "https://muragoods.vercel.app").rstrip("/")
BRIDGE_SECRET = _get("DISCORD_BRIDGE_SECRET")

# ── Data sources ─────────────────────────────────────────────────────────
TMDB_API_KEY = _get("TMDB_API_KEY")
# The website's own TMDB proxy (server-side key) — used when no direct key.
TMDB_PROXY = f"{MURASTREAM_URL}/api/murastream/tmdb"

# ── Database ─────────────────────────────────────────────────────────────
# The bot owns its own cluster. The variable NAME is the contract: the site
# and the dashboard resolve the same name (see app/lib/db/clusters.ts), so
# "the dashboard shows the same data as the bot" is a property of the
# configuration instead of a convention. The legacy names are still accepted
# so an existing deployment keeps running through the migration.
#
# The URI is never logged, never included in an error message, and never
# returned by /health. `DATABASE_CLUSTER_STATE` carries a safe enum instead.
MURABOT_MONGODB_URI = _get("MURABOT_MONGODB_URI")
MONGO_URI = (MURABOT_MONGODB_URI
             or _get("MONGODB_URI")
             or _get("MONGO_URI")
             or _get("DATABASE_URL"))
MONGO_DB = _get("MURABOT_MONGO_DB") or _get("DISCORD_BOT_MONGO_DB") \
    or _get("MONGO_DB", "murastream_bot")

#: Which variable actually supplied the URI. Safe to log: a name, not a value.
MONGO_URI_SOURCE = ("MURABOT_MONGODB_URI" if MURABOT_MONGODB_URI
                    else "MONGODB_URI" if _get("MONGODB_URI")
                    else "MONGO_URI" if _get("MONGO_URI")
                    else "DATABASE_URL" if _get("DATABASE_URL") else None)

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

# ── Resolver concurrency ─────────────────────────────────────────────────
# How many yt-dlp resolves may run at the same time, process-wide.
#
# Every resolve fans out across several strategies, each doing blocking
# extraction in a worker thread. A small burst of concurrent resolves (the
# dashboard searching while the bot resolves, or several guilds searching at
# once) therefore multiplies simultaneous extractions, and that is what
# exhausted the container and killed the process. Serialising the expensive
# work bounds the peak regardless of how many callers arrive.
#
# This limits CONCURRENCY only. It never changes which track is chosen:
# ordering, ranking, provenance and the no-cover refusal are untouched.
#
# Values are clamped to >= 1 so a typo ("0", "-5", "abc") degrades to
# fully-serialised resolution rather than disabling the guard entirely.
def _positive_int(name: str, default: int) -> int:
    raw = _get(name, str(default))
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value >= 1 else 1


MUSIC_RESOLVE_CONCURRENCY = _positive_int("MUSIC_RESOLVE_CONCURRENCY", 2)
# How long a caller waits for its turn before giving up. Bounded so a queue
# cannot pile up unboundedly: past this the caller is told the service is
# busy, which is honest, rather than being silently starved.
MUSIC_RESOLVE_QUEUE_TIMEOUT = _positive_int("MUSIC_RESOLVE_QUEUE_TIMEOUT", 120)


def _positive_float(name: str, default: float) -> float:
    raw = _get(name, str(default))
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


# How long a successfully resolved track is reused before re-resolving, and the
# hard ceiling on cache size. The TTL is deliberately SHORT: a resolved stream
# URL can expire, so a long TTL would eventually hand out dead sources. It only
# needs to outlast a burst of people asking for the same track.
MUSIC_RESOLVE_CACHE_TTL = _positive_float("MUSIC_RESOLVE_CACHE_TTL", 300.0)
MUSIC_RESOLVE_CACHE_MAX = _positive_int("MUSIC_RESOLVE_CACHE_MAX", 200)
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
    if not MURABOT_OWNER_DISCORD_ID:
        problems.append(
            "MURABOT_OWNER_DISCORD_ID is not set to a Discord user ID — "
            "nobody can change owner-only economy values until it is")
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
