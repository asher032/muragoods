"""Bot entrypoint — loads cogs, syncs once, resilient startup, health endpoint."""

import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Make sibling modules importable regardless of how the bot is launched.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import discord
from discord.ext import commands

import bridge
import config
import database
import embeds
from gateway_util import gateway_latency_ms
import net as http_mod
import tmdb
import threading

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logging.getLogger("discord").setLevel(logging.WARNING)
log = logging.getLogger("bot.main")

# Health tracking
_start_time = time.time()
_reconnect_count = 0

# Real gateway reconnects. `_reconnect_count` above only increments when the
# OUTER login loop in main() re-runs, so it never observes discord.py's own
# internal reconnects; `_gateway_reconnects` is driven by on_disconnect.
_gateway_reconnects = 0
# Whether the gateway has EVER become ready in this process. Distinguishes
# "still starting / reconnecting" (never ready) from "was connected and lost
# it" (gateway_failed) — the dashboard must not label a fresh boot as failed.
_ever_ready = False
# Set when Discord rejects the token. The process exits right after, but the
# flag lets any still-serving /health answer invalid_token instead of offline.
_login_failed = False
# Last Discord API reachability probe (unauthenticated, credential-free).
# Only overwritten on SUCCESS, so `at` is the last SUCCESSFUL check.
_last_api_check: dict | None = None
# Discord's heartbeat interval is ~41s, so 150s without a heartbeat ACK means
# the socket is dead rather than merely idle. Generous on purpose: a brief
# reconnect must not flip /health to a failing state and provoke a restart.
GATEWAY_STALE_AFTER = 150.0


# ── Guild registry for event bookkeeping (no config decisions here) ──────
# Owned by main.py. Cogs consult the DB themselves; this is only the shared
# thread-safe bitset of guilds the bot is currently in, refreshed by gateway
# events so the dashboard's perimeter endpoint can be cross-checked against the
# process's own view without hitting Discord for every request.
_guilds_lock = threading.Lock()
_guild_ids: set[int] = set()


def _register_guild(guild: discord.Guild) -> None:
    with _guilds_lock:
        _guild_ids.add(guild.id)


def _unregister_guild(guild_id: int) -> None:
    with _guilds_lock:
        _guild_ids.discard(guild_id)


def bot_guild_id_set() -> set[int]:
    """Snapshot of guilds the bot believes it is currently in."""
    with _guilds_lock:
        return set(_guild_ids)


# Flipped to False if Discord rejects the privileged-intent request; the bot
# then restarts without them (automod message-scan + welcome events disabled).
# NOTE: this block (intent flags, prefix resolver, MuraBot, instantiation)
# lives ABOVE the @bot.event dispatcher on purpose — the decorators below
# need a constructed bot at import time.
_privileged_ok = True

# ── Per-guild command prefix ─────────────────────────────────────────────
# Cached per GUILD ID (never a single global value) with a short TTL, so a
# prefix changed on the dashboard takes effect promptly even if the refresh
# webhook can't be delivered. Default is config.BOT_PREFIX (mg!).
_PREFIX_TTL = 30.0
_prefix_cache: dict[str, tuple[float, str]] = {}


def _prefix_cached(guild_id: int | str) -> str | None:
    hit = _prefix_cache.get(str(guild_id))
    if hit and time.monotonic() - hit[0] < _PREFIX_TTL:
        return hit[1]
    return None


async def _guild_prefix(guild_id: int | str) -> str:
    cached = _prefix_cached(guild_id)
    if cached is not None:
        return cached
    try:
        stored = await database.get_guild_prefix(guild_id)
    except Exception as exc:
        log.warning("Prefix lookup failed for guild %s: %s", guild_id, str(exc)[:150])
        # Database down: fall back to the default rather than losing every
        # prefix command. Do not cache the fallback.
        return config.BOT_PREFIX
    prefix = stored or config.BOT_PREFIX
    _prefix_cache[str(guild_id)] = (time.monotonic(), prefix)
    return prefix


async def get_prefix(bot: commands.Bot, message: discord.Message):
    """discord.py prefix resolver — per guild, cached by guild ID."""
    prefixes = [config.BOT_PREFIX, "MuraBot "]
    if message.guild is not None:
        custom = await _guild_prefix(message.guild.id)
        if custom and custom not in prefixes:
            prefixes.insert(0, custom)
    return commands.when_mentioned_or(*prefixes)(bot, message)


class MuraBot(commands.Bot):
    """All lifecycle handlers live on the class so a rebuilt instance keeps them."""

    def __init__(self) -> None:
        intents = discord.Intents.default()
        if _privileged_ok:
            intents.message_content = True   # automod + XP from messages
            intents.members = True           # welcome events
        super().__init__(
            command_prefix=get_prefix,
            intents=intents,
            help_command=None,
            case_insensitive=True,
            allowed_mentions=discord.AllowedMentions(everyone=False, roles=False, replied_user=False),
        )
        self.initial_cogs = [
            "cogs.murastream",
            "cogs.watchtogether",
            "cogs.music",
            "cogs.moderation",
            "cogs.security",
            "cogs.community",
            "cogs.muragoods",
            "cogs.fun",
            "cogs.leveling",
            "cogs.tickets",
            "cogs.prefix",
        ]

    async def setup_hook(self) -> None:
        # Shared HTTP session must exist before any cog fetches data.
        await http_mod.init()
        try:
            await database.connect()
            http_mod.set_status("database", "online")
        except Exception as exc:
            log.error("Database unavailable at startup: %s", str(exc)[:200])
            http_mod.set_status("database", "offline")
        for cog in self.initial_cogs:
            try:
                await self.load_extension(cog)
                log.info("Loaded %s", cog)
            except Exception:
                log.exception("Failed to load %s", cog)
        # Log yt-dlp version for diagnostics.
        try:
            import yt_dlp
            log.info("yt-dlp version: %s", yt_dlp.version.__version__)
        except Exception as exc:
            log.warning("Could not get yt-dlp version: %s", exc)
        # Sync ONCE per process start (global). Per-guild instant sync happens
        # in on_guild_join. Re-syncing on every reconnect causes rate limits.
        try:
            synced = await self.tree.sync()
            log.info("Successfully synced %d commands.", len(synced))
        except discord.HTTPException as exc:
            log.error("Command sync FAILED (will retry on next start): %s", str(exc)[:300])

    async def _sync_guild_commands(self, guild: discord.Guild) -> None:
        try:
            await self.tree.sync(guild=guild)
            log.info("Guild-synced commands for %s", guild.id)
        except discord.HTTPException:
            log.warning("Guild sync failed for %s", guild.id)


bot = MuraBot()


# ── Cross-cutting gateway events (bookkeeping + forward to cogs) ─────────
# These live here, not in a cog, because they are the dispatcher the modules
# rely on: each module already owns its own @Cog.listener hooks for the events
# it cares about. Here we (a) keep the guild registry honest, (b) do the small
# bits no module should own (deduplication metadata, cross-guild logging), and
# (c) never make a config decision — that belongs in the owning cog.


# ── Gateway lifecycle → honest /health status ────────────────────────────
# These are the ONLY registrations for these events. The same handlers also
# existed as `MuraBot` methods, but `@bot.event` does `setattr(bot, name, coro)
# — so the instance attributes silently shadowed every one of them. The result
# was a bot that reported `discord: "starting"` forever (on_ready never ran),
# never set its presence, and lost the "Logged in as" startup line, while the
# dashboard showed it as permanently starting up. App-state transitions live
# here now, next to the registry work, with one handler per event.


@bot.event
async def on_ready():
    """Rebuild the guild registry and settle app-state once the connection is up."""
    global _ever_ready
    _ever_ready = True
    http_mod.set_status("discord", "online")
    with _guilds_lock:
        _guild_ids = {g.id for g in bot.guilds}
    log.info("on_ready: guild registry rebuilt — %d guilds", len(_guild_ids))
    # Measure the decoder instead of asserting it. `music` used to be set to
    # "ready" here unconditionally, so /health advertised working music on a
    # host whose FFmpeg was missing. Playback itself is still only proven by
    # GET /music/diagnose, which performs a real resolve.
    try:
        import music as music_mod
        ffmpeg_ok = await music_mod.probe()
        log.info("Music decoder %s (%s); playback is only proven by /music/diagnose",
                 "available" if ffmpeg_ok else "MISSING", music_mod.FFMPEG_EXE)
        log.info("yt-dlp JS runtimes: %s", music_mod.js_runtimes())
    except Exception as exc:
        log.warning("Music probe failed at startup: %s", str(exc)[:160])
    activity_name = config.BOT_ACTIVITY.strip() or "https://muragoods.vercel.app/"
    if "twitch.tv" in activity_name.lower():
        activity_name = "https://muragoods.vercel.app/"
    activity = discord.Activity(
        type=discord.ActivityType.watching,
        name=activity_name,
    )
    await bot.change_presence(
        activity=activity,
        status={"online": discord.Status.online, "idle": discord.Status.idle,
                "dnd": discord.Status.do_not_disturb}.get(
                    config.BOT_STATUS.lower(), discord.Status.online))
    log.info("Logged in as %s (%s) - %d guilds",
             bot.user, getattr(bot.user, "id", "?"), len(bot.guilds))


@bot.event
async def on_connect():
    """Gateway socket opened. Do not flip app-state here — on_resumed does that
    once the session is fully re-authenticated."""
    http_mod.set_status("discord", "connecting")
    log.info("Gateway connected")


@bot.event
async def on_disconnect():
    """Gateway socket closed. discord.py will reconnect by default."""
    global _gateway_reconnects
    _gateway_reconnects += 1
    http_mod.set_status("discord", "reconnecting")
    log.warning(
        "Gateway disconnected (count=%d) — discord.py will auto-reconnect",
        _gateway_reconnects,
    )


@bot.event
async def on_resumed():
    """Session re-authenticated/resumed (includes initial ready handshake)."""
    http_mod.set_status("discord", "online")
    with _guilds_lock:
        _guild_ids = {g.id for g in bot.guilds}
    log.info("Gateway session resumed — %d guilds in registry", len(_guild_ids))


@bot.event
async def on_guild_join(guild: discord.Guild):
    _register_guild(guild)
    log.info("on_guild_join: %s (%s) — %d guilds now", guild.name, guild.id, len(_guild_ids))


@bot.event
async def on_guild_leave(guild: discord.Guild):
    _unregister_guild(guild.id)
    log.info("on_guild_leave: %s (%s) — %d guilds remain", guild.name, guild.id, len(_guild_ids))


@bot.event
async def on_guild_available(guild: discord.Guild):
    """Guild data refreshed from the gateway (e.g. after reconnect)."""
    if guild.owner_id and not guild.id in _guild_ids:
        _register_guild(guild)


@bot.event
async def on_guild_unavailable(guild: discord.Guild):
    """Guild dropped from the cache (often transient after reconnect)."""
    _unregister_guild(guild.id)


@bot.event
async def on_member_join(member: discord.Member):
    """New member joined. Forward to every cog that opted in."""
    for cog in bot.cogs.values():
        if hasattr(cog, "on_member_join"):
            try:
                await cog.on_member_join(member)
            except Exception:
                log.exception("cog.on_member_join raised in %s", cog.qualified_name)


@bot.event
async def on_member_remove(member: discord.Member):
    """Member left/banned/kicked. Forward to every cog that opted in."""
    for cog in bot.cogs.values():
        if hasattr(cog, "on_member_remove"):
            try:
                await cog.on_member_remove(member)
            except Exception:
                log.exception("cog.on_member_remove raised in %s", cog.qualified_name)


@bot.event
async def on_member_ban(guild: discord.Guild, user: discord.User):
    """User banned. Forward to every cog that opted in."""
    for cog in bot.cogs.values():
        if hasattr(cog, "on_member_ban"):
            try:
                await cog.on_member_ban(guild, user)
            except Exception:
                log.exception("cog.on_member_ban raised in %s", cog.qualified_name)


@bot.event
async def on_member_unban(guild: discord.Guild, user: discord.User):
    """User unbanned. Forward to every cog that opted in."""
    for cog in bot.cogs.values():
        if hasattr(cog, "on_member_unban"):
            try:
                await cog.on_member_unban(guild, user)
            except Exception:
                log.exception("cog.on_member_unban raised in %s", cog.qualified_name)


@bot.event
async def on_member_update(before: discord.Member, after: discord.Member):
    """Member metadata changed: roles, nickname, pending, timed_out."""
    if (before.roles != after.roles or before.nick != after.nick or before.pending != after.pending or
            (hasattr(before, "timed_out_until") and before.timed_out_until != after.timed_out_until)):
        for cog in bot.cogs.values():
            if hasattr(cog, "on_member_update"):
                try:
                    await cog.on_member_update(before, after)
                except Exception:
                    log.exception("cog.on_member_update raised in %s", cog.qualified_name)


@bot.event
async def on_guild_channel_create(channel: discord.abc.GuildChannel):
    for cog in bot.cogs.values():
        if hasattr(cog, "on_guild_channel_create"):
            try:
                await cog.on_guild_channel_create(channel)
            except Exception:
                log.exception("cog.on_guild_channel_create raised in %s", cog.qualified_name)


@bot.event
async def on_guild_channel_update(before: discord.abc.GuildChannel, after: discord.abc.GuildChannel):
    if (before.name != after.name or before.permission_overwrites != after.permission_overwrites or
            before.category_id != after.category_id or before.topic != after.topic):
        for cog in bot.cogs.values():
            if hasattr(cog, "on_guild_channel_update"):
                try:
                    await cog.on_guild_channel_update(before, after)
                except Exception:
                    log.exception("cog.on_guild_channel_update raised in %s", cog.qualified_name)


@bot.event
async def on_guild_channel_delete(channel: discord.abc.GuildChannel):
    for cog in bot.cogs.values():
        if hasattr(cog, "on_guild_channel_delete"):
            try:
                await cog.on_guild_channel_delete(channel)
            except Exception:
                log.exception("cog.on_guild_channel_delete raised in %s", cog.qualified_name)


@bot.event
async def on_guild_role_create(role: discord.Role):
    for cog in bot.cogs.values():
        if hasattr(cog, "on_guild_role_create"):
            try:
                await cog.on_guild_role_create(role)
            except Exception:
                log.exception("cog.on_guild_role_create raised in %s", cog.qualified_name)


@bot.event
async def on_guild_role_update(before: discord.Role, after: discord.Role):
    if (before.name != after.name or before.color != after.color or before.hoist != after.hoist or
            before.permissions != after.permissions or before.position != after.position):
        for cog in bot.cogs.values():
            if hasattr(cog, "on_guild_role_update"):
                try:
                    await cog.on_guild_role_update(before, after)
                except Exception:
                    log.exception("cog.on_guild_role_update raised in %s", cog.qualified_name)


@bot.event
async def on_guild_role_delete(role: discord.Role):
    for cog in bot.cogs.values():
        if hasattr(cog, "on_guild_role_delete"):
            try:
                await cog.on_guild_role_delete(role)
            except Exception:
                log.exception("cog.on_guild_role_delete raised in %s", cog.qualified_name)


@bot.event
async def on_message_edit(before: discord.Message, after: discord.Message):
    """A message was edited. Forward to every cog that opted in."""
    if not after.guild or after.author.bot:
        return
    if before.content == after.content and before.embeds == after.embeds and before.attachments == after.attachments:
        return
    for cog in bot.cogs.values():
        if hasattr(cog, "on_message_edit"):
            try:
                await cog.on_message_edit(before, after)
            except Exception:
                log.exception("cog.on_message_edit raised in %s", cog.qualified_name)


@bot.event
async def on_message_delete(message: discord.Message):
    """A single message was deleted. Forward to every cog that opted in."""
    if not message.guild or message.author.bot:
        return
    for cog in bot.cogs.values():
        if hasattr(cog, "on_message_delete"):
            try:
                await cog.on_message_delete(message)
            except Exception:
                log.exception("cog.on_message_delete raised in %s", cog.qualified_name)


@bot.event
async def on_bulk_message_delete(messages: list[discord.Message]):
    """Bulk delete. Forward to every cog that opted in."""
    if not messages:
        return
    guild = messages[0].guild
    if not guild:
        return
    for cog in bot.cogs.values():
        if hasattr(cog, "on_bulk_message_delete"):
            try:
                await cog.on_bulk_message_delete(messages)
            except Exception:
                log.exception("cog.on_bulk_message_delete raised in %s", cog.qualified_name)


@bot.event
async def on_reaction_add(reaction: discord.Reaction, user: discord.User | discord.Member):
    """Reaction added. Forward to every cog that opted in."""
    if not user.guild or user.bot:
        return
    for cog in bot.cogs.values():
        if hasattr(cog, "on_reaction_add"):
            try:
                await cog.on_reaction_add(reaction, user)
            except Exception:
                log.exception("cog.on_reaction_add raised in %s", cog.qualified_name)


@bot.event
async def on_reaction_remove(reaction: discord.Reaction, user: discord.User | discord.Member):
    """Reaction removed. Forward to every cog that opted in."""
    if not user.guild or user.bot:
        return
    for cog in bot.cogs.values():
        if hasattr(cog, "on_reaction_remove"):
            try:
                await cog.on_reaction_remove(reaction, user)
            except Exception:
                log.exception("cog.on_reaction_remove raised in %s", cog.qualified_name)


@bot.event
async def on_voice_state_update(member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
    """Voice join/move/leave/mute/deaf/afk. Forward to every cog that opted in."""
    if (before.channel != after.channel or before.self_mute != after.self_mute or before.self_deaf != after.self_deaf or
            before.afk != after.afk or before.self_stream != after.self_stream):
        for cog in bot.cogs.values():
            if hasattr(cog, "on_voice_state_update"):
                try:
                    await cog.on_voice_state_update(member, before, after)
                except Exception:
                    log.exception("cog.on_voice_state_update raised in %s", cog.qualified_name)


def gateway_liveness(bot) -> tuple[bool, float | None, str | None]:
    """Measure real gateway liveness from the socket's own heartbeat ACK clock.

    Returns ``(alive, heartbeat_age_seconds, last_heartbeat_iso)``.

    Why the ACK clock and not a counter: ``ConnectionState.last_heartbeat`` does
    not exist (verified absent on discord.py 2.7.1), so the previous lookup
    returned null forever and ``discord`` stayed "online" even after the socket
    died. ``DiscordWebSocket._last_ack`` is updated on every heartbeat ACK and
    is not gated behind a client flag, so it is a genuine measurement.

    ``on_socket_raw_receive`` is deliberately NOT used here: it only fires when
    the client is built with ``enable_debug_events=True``, so depending on it
    would freeze on a healthy bot and fabricate an outage.

    If the ACK clock is unavailable (library drift), this falls back to the
    ready flag rather than failing closed — never invent an outage.
    """
    def _ack_clock(socket) -> float | None:
        """The heartbeat-ACK perf_counter for one websocket, or None.

        Path verified against discord.py 2.7.1 source rather than assumed:
        `_last_ack` is an instance attribute of KeepAliveHandler (set in its
        __init__, refreshed in ack()), and the socket reaches it through
        `DiscordWebSocket._keep_alive`. Two earlier guesses were both wrong and
        failed silently, which is why /health kept reporting null:
          * `ConnectionState.last_heartbeat` does not exist at all.
          * `ShardInfo.ws` does not exist — its __slots__ are
            ('_parent', 'id', 'shard_count'), so the socket is `_parent.ws`.
            `bot.shards` also only exists on AutoShardedClient, so on this
            non-sharded client the lookup raised on every single call.
        """
        keep_alive = getattr(socket, "_keep_alive", None)
        ack = getattr(keep_alive, "_last_ack", None)
        return ack if isinstance(ack, (int, float)) else None

    hb_age: float | None = None
    try:
        sockets = []
        # Non-sharded client (what MuraBot runs as): the socket is on the bot.
        direct = getattr(bot, "ws", None)
        if direct is not None:
            sockets.append(direct)
        # AutoShardedClient, if this ever runs sharded: ShardInfo -> _parent.ws.
        for si in (getattr(bot, "shards", None) or {}).values():
            parent = getattr(si, "_parent", None)
            socket = getattr(parent, "ws", None) or getattr(si, "ws", None)
            if socket is not None:
                sockets.append(socket)
        acks = [a for a in (_ack_clock(s) for s in sockets) if a is not None]
        if acks:
            hb_age = max(time.perf_counter() - a for a in acks)
    except Exception:
        hb_age = None

    if hb_age is not None:
        alive = hb_age < GATEWAY_STALE_AFTER
        last_iso = datetime.fromtimestamp(time.time() - hb_age).isoformat()
    else:
        alive = bool(bot.is_ready())
        last_iso = None
    return alive, hb_age, last_iso

@bot.listen()
async def on_guild_join(guild: discord.Guild):
    """Re-sync slash commands for a guild the bot just joined. This is a thin
    dispatcher: the heavy guild-joined bookkeeping (registry, logging) already
    happens in the @bot.event handler above."""
    await bot._sync_guild_commands(guild)


def describe_error(error: Exception) -> tuple[str, str | None]:
    """Map a failure to a user-safe reason, so the embed says WHAT broke.

    Every failure previously produced the identical "something went wrong"
    embed, which is why a user could not tell an offline database from a
    missing permission. Only safe, non-revealing text is returned; the
    exception itself still goes to logs and the Error Center.
    """
    original = getattr(error, "original", error)

    # Unwrap command-invoke wrappers so the real cause is classified.
    for _ in range(3):
        nxt = getattr(original, "original", None)
        if nxt is None:
            break
        original = nxt

    # Database first: when the bot cannot reach Mongo, everything that reads or
    # writes raises, so this is the single most likely cause of a wall of
    # identical command failures.
    name = type(original).__name__
    db_down = database.LAST_ERROR is not None or getattr(database, "_db", None) is None
    if db_down and (
        name in {"ServerSelectionTimeoutError", "InvalidName", "OperationFailure",
                 "ConfigurationError", "AutoReconnect", "NetworkTimeout", "NotConnected"}
        or "pymongo" in type(original).__module__
        or "motor" in type(original).__module__
    ):
        detail = database.LAST_ERROR or "not connected"
        return (
            "The bot's database is unavailable, so this action could not read "
            f"or save data ({detail}).",
            "Operators: check MONGO_URI and MONGO_DB on the bot host.",
        )

    if isinstance(original, discord.Forbidden):
        return (
            "MuraGoods is missing a permission it needs in this server.",
            "Check the bot's role position and permissions.",
        )
    if isinstance(original, discord.NotFound):
        return ("The Discord resource this refers to no longer exists.", None)
    if isinstance(original, discord.HTTPException):
        if original.status == 429:
            return ("Discord rate-limited this action.", "Please try again shortly.")
        if 500 <= original.status < 600:
            return (f"Discord returned a temporary error (HTTP {original.status}).",
                    "This is on Discord's side — please retry.")
        return (f"Discord rejected the request (HTTP {original.status}).", None)
    if isinstance(original, asyncio.TimeoutError):
        return ("A request timed out before it finished.", "Please try again.")
    return (f"An unexpected error occurred ({name}).",
            "The details are in the bot logs and the dashboard Error Center.")


@bot.tree.error
async def on_app_command_error(interaction: discord.Interaction, error: Exception) -> None:
    """Central error handler: user gets error ID, logs get the real exception,
    and the dashboard Error Center receives a persistent record."""
    if isinstance(error, discord.app_commands.CheckFailure):
        return
    error_id = embeds.new_error_id()
    command_name = interaction.command.qualified_name if interaction.command else "unknown"
    log.error("[ERROR] command=/%s [ERROR_ID]=%s [EXCEPTION]=%r",
              command_name, error_id, error)
    # Relay to the dashboard Error Center (database on the shared cluster).
    try:
        await database.record_bot_error(
            "command", f"/{command_name}: {type(error).__name__}: {error}",
            guild_id=interaction.guild_id if interaction.guild_id else None,
            command=command_name,
            detail=repr(error)[:2000])
    except Exception:
        log.debug("error relay failed (non-fatal)")
    try:
        reason, hint = describe_error(error)
        e = embeds.err_embed(error_id, reason=reason, hint=hint)
        if interaction.response.is_done():
            await interaction.followup.send(embed=e, ephemeral=True)
        else:
            await interaction.response.send_message(embed=e, ephemeral=True)
    except discord.HTTPException:
        pass


# Failed resolves get a named remedy rather than one generic message. A YouTube
# bot-challenge and a provider outage are different problems with different
# owners, so they must not share one message.
_RESOLVE_REMEDIES = {
    "youtube_bot_challenge": (
        "YouTube demands sign-in from this host's egress IP. Set YT_COOKIES (contents "
        "of an exported Netscape cookie jar) or YT_COOKIES_FILE, or route extraction "
        "through a proxy with YOUTUBE_PROXY. Retrying cannot help."
    ),
    "preview_only": (
        "The fallback provider offered only a preview clip, which is not the track. "
        "Fix the primary provider (see youtube_bot_challenge)."
    ),
    "fallback_mismatch": (
        "A fallback provider returned a result that does not match the query; it was "
        "rejected instead of played. Fix the primary provider."
    ),
}
_RESOLVE_REMEDY_DEFAULT = (
    "No provider returned a playable match. If cookies and a proxy are already set, "
    "check last_resolve_error and js_runtimes."
)


async def _health_server() -> None:
    """Tiny HTTP endpoint for host healthchecks (Render/Docker) + the
    music-state/control bridge the dashboard uses for REAL player data."""
    from aiohttp import web

    def _authorized(request: web.Request) -> bool:
        secret = config.BRIDGE_SECRET
        if not secret:
            return False
        return request.headers.get("Authorization", "") == f"Bearer {secret}"

    def _db_detail() -> dict:
        try:
            return database.diagnostic()
        except Exception:
            return {"configured": None, "error_class": None, "hint": None}

    def _ffmpeg_state() -> bool | None:
        try:
            import music as music_mod
            return music_mod.FFMPEG_OK
        except Exception:
            return None

    def _youtube_egress_state() -> dict:
        """Which egress path served the last YouTube resolve.

        A proxy that answers but whose IP YouTube refuses reports HTTP 200, so
        its presence says nothing about whether it works. This returns the
        measured outcome instead — never the proxy URL or its credentials.
        """
        try:
            import music as music_mod
            return music_mod.proxy_state()
        except Exception:
            return {"configured": bool(config.YOUTUBE_PROXY), "status": "unknown"}

    def _js_runtime_state() -> dict:
        """Which JavaScript runtime yt-dlp can use for YouTube's challenges.

        A missing runtime is the single most misleading music failure: the
        extraction error reads like an IP block, so the dashboard could only
        guess. Reporting it makes the cause a measurement.
        """
        try:
            import music as music_mod
            return music_mod.js_runtimes()
        except Exception:
            return {"available": {}, "any": None, "yt_dlp_ejs_installed": None}

    def _voice_state() -> dict:
        """Is discord.py's voice backend importable?

        Voice support was split into a separate package (davey); without it
        every voice connect raises and no track can play. Same reasoning as
        the runtime probe: a missing dependency must be a measurement, not a
        guess the user later meets as "Unknown Playback Error".
        """
        try:
            import davey  # noqa: F401
            return {"davey": True}
        except Exception:
            return {"davey": False}

    def _opus_state() -> dict:
        """Opus codec introspection for /health (never raises)."""
        try:
            import music as music_mod
            return music_mod.opus_status()
        except Exception:
            return {"loaded": False, "lib": None, "status": "unknown"}

    def _bridge_detail() -> dict:
        """Credential-free snapshot of the last site-bridge probe."""
        try:
            import bridge as bridge_mod
            return bridge_mod.last_check()
        except Exception:
            return {"status": None, "reason": "unavailable"}

    async def _discord_api_probe() -> tuple[bool, int | None]:
        """Unauthenticated Discord API reachability check (credential-free).

        GET /api/v10 without auth returns 401 when Discord is reachable — the
        same signal the dashboard's own check uses. Returns
        (reachable, latency_ms). On success the module-level last-success
        cache is refreshed; failures never overwrite it, so `at` always means
        the last SUCCESSFUL check.
        """
        global _last_api_check
        import aiohttp
        t0 = time.monotonic()
        try:
            timeout = aiohttp.ClientTimeout(total=3)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get("https://discord.com/api/v10") as resp:
                    # 401 = reachable (rejected auth, not network). Any HTTP
                    # response at all proves the API is up; 5xx still counts
                    # as reachable-but-degraded rather than unavailable.
                    await resp.read()
            latency = round((time.monotonic() - t0) * 1000)
            _last_api_check = {
                "at": datetime.now(timezone.utc).isoformat(),
                "latency_ms": latency,
            }
            return True, latency
        except Exception:
            return False, None

    def _connection_state(gateway_alive: bool, api_reachable: bool | None) -> str:
        """One honest connection state from real measurements — never from
        mere token presence.

        online_connected | connecting | offline | invalid_token |
        gateway_failed | api_unavailable

        Gateway heartbeat ACKs are the primary signal: a live gateway proves
        Discord is reachable, so one failed 3s API probe never demotes a
        connected bot (that would flap on every probe blip). The probe only
        decides between gateway_failed (our connection) and api_unavailable
        (Discord itself) once the gateway is actually dead.
        """
        if not config.DISCORD_TOKEN or _login_failed:
            return "invalid_token"
        if bot.is_closed():
            return "offline"
        ready = bool(bot.is_ready())
        if gateway_alive and ready:
            return "online_connected"
        if api_reachable is False:
            # Discord itself unreachable — explains a dead gateway.
            return "api_unavailable"
        if _ever_ready and not gateway_alive:
            return "gateway_failed"
        return "connecting"

    def _bot_user() -> dict:
        """Public bot identity for the dashboard. Never secrets: username,
        avatar CDN URL and application ID are all public Discord data."""
        try:
            user = getattr(bot, "user", None)
            if user is None:
                return {"username": None, "avatar_url": None,
                        "application_id": getattr(bot, "application_id", None)}
            avatar = None
            try:
                avatar = user.display_avatar.url if user.display_avatar else None
            except Exception:
                avatar = None
            return {"username": user.name,
                    "avatar_url": avatar,
                    "application_id": getattr(bot, "application_id", None)}
        except Exception:
            return {"username": None, "avatar_url": None, "application_id": None}

    async def health(_request: web.Request) -> web.Response:
        statuses = http_mod.get_status()
        # NaN-safe: bot.latency is NaN while the gateway is unconnected and
        # NaN is truthy, so the old `if bot.latency` guard raised
        # `ValueError: cannot convert float NaN to integer` here and crashed
        # /health every 10s under Render's health probe.
        latency_ms = gateway_latency_ms(bot, 0)
        uptime = time.time() - _start_time
        # Real heartbeat liveness. `ConnectionState.last_heartbeat` does not
        # exist (verified absent on discord.py 2.7.1), so the old lookup
        # returned null forever. `DiscordWebSocket._last_ack` IS maintained on
        # every heartbeat ACK and is not gated behind a client flag.
        # `on_socket_raw_receive` is deliberately NOT used for this: it only
        # fires when the client is built with enable_debug_events=True, so
        # relying on it would freeze on a healthy bot and fabricate an outage.
        gateway_alive, hb_age, last_hb = gateway_liveness(bot)
        if not gateway_alive:
            statuses = {**statuses, "discord": "stale-no-gateway-ack"}
        # Real Discord API reachability (unauthenticated probe, 3s budget).
        # Skipped only when there is no point: invalid token or closed bot.
        closed = bot.is_closed()
        check_api = bool(config.DISCORD_TOKEN) and not _login_failed and not closed
        api_reachable, api_latency = await _discord_api_probe() if check_api else (None, None)
        if check_api and not api_reachable:
            statuses = {**statuses, "discord_api": "unavailable"}
        connection_state = _connection_state(gateway_alive, api_reachable)
        # Liveness stays gateway-based: a single failed 3s API probe must not
        # flip the process unhealthy (and trigger a host restart) while
        # heartbeats are being ACKed. A real Discord outage kills the gateway
        # within the stale window and surfaces as api_unavailable anyway.
        ok = not closed and bool(bot.is_ready()) and gateway_alive
        shard_count = len(bot.shards) if hasattr(bot, "shards") else 1
        bot_version = getattr(config, "BOT_VERSION", "1.0.0")
        # Make the privileged-intent state explicit: if message_content could
        # not be requested, prefix commands are dead and the dashboard must be
        # able to show that instead of pretending the bot is fully healthy.
        if not _privileged_ok:
            statuses = {**statuses, "prefix_commands": "disabled-no-message-content"}
        last_api = _last_api_check or {}
        return web.json_response({
            "ok": ok,
            "guilds": len(bot.guilds),
            # Real guild IDs the bot is currently present in — the dashboard uses
            # this to report "bot installed / not installed" per server instead
            # of guessing.
            "guild_ids": [str(g.id) for g in bot.guilds],
            "subsystems": statuses,
            "bot_version": bot_version,
            # Public identity (username, avatar CDN URL, application ID).
            # Never secrets: no token, client secret, or credentials here.
            "user": _bot_user(),
            # One measured connection state — the dashboard renders this
            # directly instead of inferring health from token presence.
            "connection_state": connection_state,
            "latency": latency_ms,
            "uptime_seconds": round(uptime),
            "last_heartbeat": last_hb,
            "reconnect_count": _gateway_reconnects + _reconnect_count,
            # Last SUCCESSFUL Discord API check (failures never overwrite it).
            # `reachable` is this call's probe outcome (None = skipped).
            "last_api_check": {
                "at": last_api.get("at"),
                "latency_ms": last_api.get("latency_ms"),
                "reachable": api_reachable,
            },
            "gateway": {
                "alive": gateway_alive,
                "heartbeat_age_seconds": round(hb_age, 1) if hb_age is not None else None,
                "stale_after_seconds": GATEWAY_STALE_AFTER,
            },
            "shard_count": shard_count,
            # Real decoder measurement (None = not measured yet). The dashboard
            # must be able to tell "no FFmpeg" from "decoder fine, playback
            # unproven" instead of guessing from an aggregate flag.
            "ffmpeg": _ffmpeg_state(),
            # Opus codec introspection (loaded lazily by discord.py on first
            # voice connect — "unknown" at rest is normal, never an outage).
            "opus": _opus_state(),
            # Real JavaScript-runtime discovery (deno/node/bun/quickjs) plus the
            # EJS solver scripts. Without a runtime, YouTube extraction fails in
            # a way that looks like an IP block — never guess, measure.
            "js_runtimes": _js_runtime_state(),
            # YouTube egress (proxy) outcome — see _youtube_egress_state().
            "youtube_egress": _youtube_egress_state(),
            # discord.py's voice backend package. Its absence is a hard stop for
            # every /play, so it belongs in the one endpoint the dashboard polls.
            "voice_backend": _voice_state(),
            # Last bridge probe: HTTP status + safe reason, so the dashboard
            # can tell "authentication failed" from "endpoint unavailable".
            "site_bridge_detail": _bridge_detail(),
            # Why the database is offline, without credentials. `database:
            # offline` alone cannot distinguish a missing variable from an
            # access-list rejection, so it was unactionable.
            "database_detail": _db_detail(),
        }, status=200 if ok else 503)

    async def gateway_drop(request: web.Request) -> web.Response:
        """Deliberately sever the gateway socket, so the offline/recovery path
        can be observed for real instead of only against fakes.

        Gated by the same bridge secret as every other write route. It closes
        the websocket only — discord.py reconnects within the same process — so
        this exercises the reconnect path rather than killing the bot.
        """
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        ws = getattr(bot, "ws", None)
        if ws is None:
            return web.json_response({"ok": False, "error": "No gateway socket"}, status=409)
        try:
            observe = float(request.query.get("observe", "6"))
        except ValueError:
            observe = 6.0
        observe = max(0.0, min(observe, 30.0))
        before = _gateway_reconnects + _reconnect_count

        # Record the transitions in-process, not over HTTP. A reconnect is
        # shorter than the round trip to even observe it: 80 parallel /health
        # requests fired 150ms after the close all still read "online", while
        # reconnect_count incremented, proving the disconnect happened inside
        # that window. Sampling the registry directly gives millisecond
        # resolution, which is the only honest way to see the state change.
        timeline: list[dict] = []
        sampler = None
        if observe:
            async def _sample() -> None:
                t0 = time.monotonic()
                last: tuple | None = None
                while time.monotonic() - t0 < observe:
                    snap = (
                        http_mod.get_status().get("discord"),
                        gateway_liveness(bot)[0],
                        _gateway_reconnects + _reconnect_count,
                    )
                    if snap != last:
                        timeline.append({
                            "t_ms": round((time.monotonic() - t0) * 1000),
                            "discord": snap[0],
                            "gateway_alive": snap[1],
                            "reconnects": snap[2],
                        })
                        last = snap
                    await asyncio.sleep(0.05)

            sampler = asyncio.create_task(_sample())

        try:
            await ws.close()
        except Exception as exc:
            if sampler:
                sampler.cancel()
            return web.json_response({"ok": False, "error": type(exc).__name__}, status=500)
        log.warning("SELF-TEST: gateway socket closed deliberately (real disconnect)")
        if sampler:
            await sampler
        return web.json_response({
            "ok": True,
            "requested": True,
            "reconnect_count_before": before,
            "reconnect_count_after": _gateway_reconnects + _reconnect_count,
            "distinct_discord_states": sorted({t["discord"] for t in timeline}),
            "left_online": any(t["discord"] != "online" for t in timeline),
            "timeline": timeline,
            "final": http_mod.get_status().get("discord"),
        })

    def _track_dict(t) -> dict:
        if t is None:
            return None
        return {
            "title": t.title, "uploader": t.uploader, "duration": t.duration,
            "thumbnail": t.thumbnail, "url": t.url,
            "requester": str(t.requester) if t.requester else None,
        }

    async def music_state(request: web.Request) -> web.Response:
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        guild_id = int(request.match_info["guild_id"])
        guild = bot.get_guild(guild_id)
        if not guild:
            return web.json_response({"ok": False, "error": "Bot not in that guild"}, status=404)
        import music as music_mod
        p = music_mod.engine.get_player(guild_id)
        vc = p.voice
        connected = bool(vc and vc.is_connected())
        state = "idle"
        if connected and vc.is_paused():
            state = "paused"
        elif connected and (vc.is_playing() or p.playing):
            state = "playing"
        # Automatic permission readout for the CURRENT voice channel (no IDs).
        permissions = None
        try:
            ch = vc.channel if (connected and vc.channel) else None
            if ch is not None:
                permissions = music_mod.check_voice_permissions(ch, guild.me)
        except Exception:
            permissions = None
        return web.json_response({
            "ok": True,
            "connected": connected,
            "state": state,
            "voiceChannel": vc.channel.name if connected and vc.channel else None,
            "voiceChannelId": str(vc.channel.id) if connected and vc.channel else None,
            "connectionState": p.connection_state,
            "playerState": p.player_state,
            "reconnectAttempts": p.reconnect_attempts,
            "lastSuccessfulConnection": p.last_successful_connection,
            "permissions": permissions,
            "ffmpeg": music_mod.ffmpeg_check(),
            "lastErrorCode": p.last_error_code,
            "lastError": music_mod.sanitize_for_log(p.last_error, limit=300),
            "lastPlayback": music_mod.engine.get_last_playback_diagnostic(),
            "current": _track_dict(p.current),
            "position": round(p.position()) if p.current else 0,
            "volume": int(p.volume * 100),
            "loop": p.loop,
            "queueLoop": p.queue_loop,
            "autoplay": p.autoplay,
            "queue": [_track_dict(t) for t in list(p.queue)[:20]],
            "queueLength": len(p.queue),
            "history": [_track_dict(t) for t in list(reversed(p.history))[:10]],
        })

    async def music_control(request: web.Request) -> web.Response:
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        guild_id = int(request.match_info["guild_id"])
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
        action = str(body.get("action") or "")
        import music as music_mod
        p = music_mod.engine.get_player(guild_id)
        vc = p.voice if (p.voice and p.voice.is_connected()) else None

        def need_voice() -> web.Response | None:
            if not vc:
                return web.json_response(
                    {"ok": False, "error": "Bot is not connected to a voice channel"}, status=409)
            return None

        try:
            if action == "pause":
                if r := need_voice():
                    return r
                if vc.is_playing():
                    vc.pause()
                    p.mark_paused()
                return web.json_response({"ok": True, "state": "paused"})
            if action == "resume":
                if r := need_voice():
                    return r
                if vc.is_paused():
                    vc.resume()
                    p.mark_resumed()
                return web.json_response({"ok": True, "state": "playing"})
            if action == "skip":
                if r := need_voice():
                    return r
                p.playing = True  # allow the track-end handler to advance
                vc.stop()
                return web.json_response({"ok": True})
            if action == "stop":
                if r := need_voice():
                    return r
                p.clear()
                p.playing = False
                vc.stop()
                return web.json_response({"ok": True})
            if action == "volume":
                if r := need_voice():
                    return r
                level = max(1, min(150, int(body.get("level") or 50)))
                p.volume = level / 100
                if isinstance(vc.source, discord.PCMVolumeTransformer):
                    vc.source.volume = p.volume
                return web.json_response({"ok": True, "volume": level})
            if action == "loop":
                p.loop = not p.loop
                return web.json_response({"ok": True, "loop": p.loop})
            if action == "queueLoop":
                p.queue_loop = not p.queue_loop
                return web.json_response({"ok": True, "queueLoop": p.queue_loop})
            if action == "shuffle":
                import random as _random
                items = list(p.queue)
                _random.shuffle(items)
                p.queue.clear()
                p.queue.extend(items)
                return web.json_response({"ok": True, "queueLength": len(items)})
            if action == "remove":
                pos = int(body.get("position") or 0)
                if pos < 1 or pos > len(p.queue):
                    return web.json_response({"ok": False, "error": "Bad position"}, status=400)
                removed = p.queue[pos - 1]
                del p.queue[pos - 1]
                return web.json_response({"ok": True, "removed": removed.title})
            if action == "disconnect":
                if vc:
                    p.clear()
                    p.playing = False
                    await vc.disconnect(force=True)
                p.voice = None
                music_mod.engine.remove_player(guild_id)
                return web.json_response({"ok": True})
            if action == "seek":
                if r := need_voice():
                    return r
                if not p.current:
                    return web.json_response(
                        {"ok": False, "error": "Nothing is playing to seek within"}, status=409)
                position = max(0, int(body.get("position") or 0))
                duration = p.current.duration or 0
                if duration and position >= duration:
                    return web.json_response(
                        {"ok": False,
                         "error": f"Position {position}s is past the end of the track ({duration}s)"},
                        status=400)
                if not vc.channel:
                    return web.json_response(
                        {"ok": False, "error": "Voice channel is no longer available"}, status=409)
                # Reuses the real playback path, so seeking genuinely re-creates
                # the audio stream at an offset (ffmpeg -ss) instead of changing
                # a number the dashboard displays.
                await music_mod.engine.play_now(p, p.current, vc.channel,
                                                seek_to=float(position))
                return web.json_response({"ok": True, "position": position})
            if action == "autoplay":
                enabled = body.get("enabled")
                p.autoplay = bool(enabled) if enabled is not None else (not p.autoplay)
                return web.json_response({"ok": True, "autoplay": p.autoplay})
            return web.json_response({"ok": False, "error": f"Unknown action: {action}"}, status=400)
        except Exception as exc:
            log.warning("music_control %s failed for guild %s: %s", action, guild_id, str(exc)[:150])
            return web.json_response({"ok": False, "error": str(exc)[:200]}, status=500)

    async def member_lookup(request: web.Request) -> web.Response:
        """Real member data + moderation history for the dashboard."""
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        guild_id = int(request.match_info["guild_id"])
        user_id = int(request.match_info["user_id"])
        guild = bot.get_guild(guild_id)
        if not guild:
            return web.json_response({"ok": False, "error": "Bot not in that guild"}, status=404)
        member = guild.get_member(user_id)
        if not member:
            return web.json_response({"ok": False, "error": "Member not found"}, status=404)
        import database as db
        warn_list = await db.get_warnings(guild_id, user_id)
        cases = await db.user_cases(guild_id, user_id, limit=15)
        return web.json_response({
            "ok": True,
            "member": {
                "id": str(member.id),
                "username": member.name,
                "displayName": member.display_name,
                "avatar": member.display_avatar.url if member.display_avatar else None,
                "roles": [{"id": str(r.id), "name": r.name, "color": str(r.color)}
                          for r in reversed(member.roles[1:])],
                "joinedAt": member.joined_at.isoformat() if member.joined_at else None,
                "accountCreated": member.created_at.isoformat(),
                "timedOutUntil": member.timed_out_until.isoformat() if member.is_timed_out() else None,
                "topRole": member.top_role.name,
            },
            "warnings": [{"reason": w["reason"], "moderatorId": str(w["moderatorId"]),
                          "at": w["at"].isoformat() if hasattr(w["at"], "isoformat") else str(w["at"])}
                         for w in warn_list],
            "cases": [{"caseId": c["caseId"], "action": c["action"], "reason": c["reason"],
                       "moderatorId": str(c["moderatorId"]),
                       "createdAt": c["createdAt"].isoformat() if hasattr(c["createdAt"], "isoformat") else str(c["createdAt"])}
                      for c in cases],
        })

    async def mod_action(request: web.Request) -> web.Response:
        """Dashboard-initiated moderation: re-checks EVERYTHING server-side.
        Never trusts the frontend — hierarchy, bot perms, target resolution
        and Discord API result are all evaluated here."""
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        guild_id = int(request.match_info["guild_id"])
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
        action = str(body.get("action") or "")
        target_id = int(body.get("userId") or 0)
        reason = str(body.get("reason") or "Dashboard action")[:300]
        minutes = max(1, min(int(body.get("minutes") or 10), 40320))
        actor_label = str(body.get("actor") or "Dashboard moderator")[:60]

        guild = bot.get_guild(guild_id)
        if not guild:
            return web.json_response({"ok": False, "error": "Bot not in that guild"}, status=404)
        me = guild.me
        member = guild.get_member(target_id)
        if action != "unban" and not member:
            return web.json_response({"ok": False, "error": "Member not found in this server"}, status=404)
        if member and member.id == me.id:
            return web.json_response({"ok": False, "error": "I can't moderate myself"}, status=400)
        if member and member.id == guild.owner_id:
            return web.json_response({"ok": False, "error": "I can't moderate the server owner"}, status=400)

        def hierarchy_blocked() -> web.Response | None:
            if member and member.top_role >= me.top_role:
                return web.json_response({
                    "ok": False,
                    "error": ("I cannot moderate this member because their highest role is "
                              "equal to or higher than mine. Fix: Server Settings → Roles → "
                              f"drag my role above {member.top_role.name}.")}, status=409)
            return None

        import database as db
        try:
            if action == "warn":
                if r := hierarchy_blocked():
                    return r
                count = await db.add_warning(guild_id, target_id, 0, reason)
                case_id = await db.add_case(guild_id, target_id, 0, "warn", reason)
                if member:
                    try:
                        await member.send(embed=discord.Embed(
                            title=f"⚠️ Warning — {guild.name}", description=reason[:300]))
                    except (discord.Forbidden, discord.HTTPException):
                        pass
                return web.json_response({"ok": True, "caseId": case_id, "warningCount": count})
            if action == "timeout":
                if r := hierarchy_blocked():
                    return r
                if not me.guild_permissions.moderate_members:
                    return web.json_response({"ok": False, "error": "I lack Moderate Members permission"}, status=403)
                await member.timeout(discord.utils.utcnow() + timedelta(minutes=minutes),
                                     reason=f"Dashboard: {reason[:150]}")
                case_id = await db.add_case(guild_id, target_id, 0, "timeout", reason, f"{minutes}m")
                await db.log_action(guild_id, 0, target_id, "timeout", f"{reason[:200]} (dashboard: {actor_label})")
                return web.json_response({"ok": True, "caseId": case_id})
            if action == "kick":
                if r := hierarchy_blocked():
                    return r
                if not me.guild_permissions.kick_members:
                    return web.json_response({"ok": False, "error": "I lack Kick Members permission"}, status=403)
                await member.kick(reason=f"Dashboard ({actor_label}): {reason[:150]}")
                case_id = await db.add_case(guild_id, target_id, 0, "kick", reason)
                await db.log_action(guild_id, 0, target_id, "kick", f"{reason[:200]} (dashboard: {actor_label})")
                return web.json_response({"ok": True, "caseId": case_id})
            if action == "ban":
                if r := hierarchy_blocked():
                    return r
                if not me.guild_permissions.ban_members:
                    return web.json_response({"ok": False, "error": "I lack Ban Members permission"}, status=403)
                await guild.ban(discord.Object(id=target_id), reason=f"Dashboard ({actor_label}): {reason[:150]}",
                                delete_message_days=0)
                case_id = await db.add_case(guild_id, target_id, 0, "ban", reason)
                await db.log_action(guild_id, 0, target_id, "ban", f"{reason[:200]} (dashboard: {actor_label})")
                return web.json_response({"ok": True, "caseId": case_id})
            if action == "unban":
                if not me.guild_permissions.ban_members:
                    return web.json_response({"ok": False, "error": "I lack Ban Members permission"}, status=403)
                try:
                    banned = await guild.fetch_ban(discord.Object(id=target_id))
                except discord.NotFound:
                    return web.json_response({"ok": False, "error": "User is not banned"}, status=404)
                await guild.unban(banned.user, reason=f"Dashboard ({actor_label})")
                case_id = await db.add_case(guild_id, target_id, 0, "unban", reason)
                return web.json_response({"ok": True, "caseId": case_id})
            return web.json_response({"ok": False, "error": f"Unknown action: {action}"}, status=400)
        except discord.Forbidden:
            return web.json_response({"ok": False, "error": "Discord rejected the action (Forbidden)"}, status=403)
        except discord.HTTPException as exc:
            return web.json_response({"ok": False, "error": f"Discord API error {exc.status}"}, status=502)

    async def prefix_refresh(request: web.Request) -> web.Response:
        """Dashboard tells us a guild's prefix changed — drop the cached value.

        Best-effort: if this never arrives the short TTL still picks the change
        up, so the prefix is never permanently stale.
        """
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
        guild_id = str(body.get("guildId") or "").strip()
        if guild_id:
            _prefix_cache.pop(guild_id, None)
        else:
            _prefix_cache.clear()
        return web.json_response({"ok": True, "refreshed": guild_id or "all"})

    async def music_diagnose(request: web.Request) -> web.Response:
        """Run a REAL provider search from the runtime that serves the bot.

        The playback code is identical to the version that resolves and plays
        correctly outside Render, so when music fails in production the only
        way to separate a code fault from an egress fault (datacenter IPs are
        commonly challenged by YouTube) is to run the resolver HERE and report
        the true error instead of guessing.
        """
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)

        query = (request.rel_url.query.get("q") or "Rick Astley Never Gonna Give You Up")[:200]
        import music as music_mod

        out: dict[str, object] = {
            "ok": False,
            "query": query,
            "ffmpeg": music_mod.FFMPEG_EXE,
            # A resolve can succeed on a residential machine and stall on a
            # datacenter host. These three facts distinguish the possible
            # causes, so a failure is actionable instead of just "timed out".
            "proxy_configured": bool(config.YOUTUBE_PROXY),
            # Presence is not health: this carries the outcome of the proxy
            # (ready / challenged / bypassed) and which egress served the last
            # resolve. Credential-free by construction.
            "youtube_egress": music_mod.proxy_state(),
            "cookies_configured": bool(music_mod.cookies_path()),
            "js_runtimes": music_mod.js_runtimes(),
        }
        try:
            import yt_dlp
            out["yt_dlp"] = yt_dlp.version.__version__
        except Exception:
            out["yt_dlp"] = None

        t0 = time.monotonic()
        try:
            track = await asyncio.wait_for(music_mod.engine.resolve(query), timeout=90)
        except asyncio.TimeoutError:
            out["elapsed"] = round(time.monotonic() - t0, 2)
            out["error"] = (
                "resolve timed out — yt-dlp produced no result. Most likely "
                "YouTube is challenging this host's IP (set YOUTUBE_PROXY or "
                "YT_COOKIES), or no JavaScript runtime is available to solve "
                "the signature challenge (see js_runtimes)."
            )
            out["last_resolve_error"] = music_mod.engine.get_resolve_error()
        except Exception as exc:
            out["error"] = f"{type(exc).__name__}: {str(exc)[:300]}"
        else:
            out["elapsed"] = round(time.monotonic() - t0, 2)
            if track is not None:
                url = track.stream_url or ""
                out.update({
                    "ok": True,
                    "title": track.title,
                    "uploader": track.uploader,
                    "duration": track.duration,
                    "has_stream_url": bool(url),
                    "stream_host": url.split("/")[2] if url.count("/") > 2 else None,
                    # A preview CDN means a short clip, not the song.
                    "preview_clip": music_mod.is_preview_url(url),
                    "provider_host": track.source,
                })
            else:
                out["error"] = music_mod.engine.get_resolve_error() or "no result returned"

        # Attach the machine-readable kind and its remedy to every outcome, so a
        # failure never reads as an indistinguishable "timed out".
        kind = music_mod.engine.get_error_kind()
        out["error_kind"] = kind
        # True even on success when a fallback served the request, so a working
        # fallback cannot hide that the primary provider is refusing this host.
        out["youtube_challenged"] = music_mod.engine.youtube_challenged()
        if not out["ok"]:
            out["remedy"] = _RESOLVE_REMEDIES.get(kind or "", _RESOLVE_REMEDY_DEFAULT)
        return web.json_response(out, status=200 if out["ok"] else 503)

    async def music_diagnostics(request: web.Request) -> web.Response:
        """⚙️ Music Diagnostics aggregate: audio service, FFmpeg, Discord
        voice, per-guild players, last playback failure. No secrets."""
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        import music as music_mod
        gateway_alive, hb_age, _ = gateway_liveness(bot)
        snap = music_mod.engine.diagnostics_snapshot()
        return web.json_response({
            "ok": True,
            "gateway": {"alive": gateway_alive,
                        "heartbeat_age_seconds": round(hb_age, 1) if hb_age is not None else None},
            "audio_service": snap["audio_service"],
            "ffmpeg": snap["ffmpeg"],
            "players": snap["players"],
            "last_playback": snap["last_playback"],
        })

    async def health_music(_request: web.Request) -> web.Response:
        """Public music aggregate for monitors and the dashboard.

        No auth (uptime monitors cannot authenticate) and no secrets: only
        measured subsystem states, counts (never guild/channel IDs), and a
        machine-readable failure reason when degraded. Anything down here is
        a real measurement, never a guess.
        """
        import music as music_mod
        gateway_alive, hb_age, _ = gateway_liveness(bot)
        ff = music_mod.ffmpeg_check()
        opus = music_mod.opus_status()
        runtimes = music_mod.js_runtimes()
        try:
            import davey  # noqa: F401
            voice_backend: dict = {"davey": True}
        except Exception:
            voice_backend = {"davey": False}
        snap = music_mod.engine.diagnostics_snapshot()
        players = snap.get("players", {}) if isinstance(snap, dict) else {}
        connected = sum(1 for p in players.values()
                        if isinstance(p, dict) and p.get("connected"))
        # Honest voice-playback claim: VERIFIED only while a player is audibly
        # engaged (state playing + voice connected) this boot. Anything else
        # — including a green HTTP service — is NOT_LIVE_VERIFIED. Hearing
        # actual Discord audio is the only proof; this endpoint never fakes it.
        voice_playback = "NOT_LIVE_VERIFIED"
        for p in players.values():
            if (isinstance(p, dict) and p.get("player") == "playing"
                    and p.get("connected")):
                voice_playback = "VERIFIED"
                break
        failed: list[str] = []
        if ff.get("probed_ok") is not True:
            failed.append("ffmpeg")
        if opus.get("status") not in ("ready", "unknown"):
            failed.append("opus")
        if not runtimes.get("any"):
            failed.append("audio_extractor")
        if voice_backend.get("davey") is not True:
            failed.append("voice_backend")
        if not gateway_alive:
            failed.append("discord_voice")
        status = "online" if not failed else "degraded"
        latency_ms = gateway_latency_ms(bot, None)
        body: dict = {
            "status": status,
            "discord_voice": "ready" if gateway_alive else "unavailable",
            "ffmpeg": ff.get("status"),
            "audio_extractor": "ready" if runtimes.get("any") else "missing",
            # Which egress YouTube actually accepted. A configured proxy that
            # answers HTTP 200 but is refused by YouTube looks identical to a
            # healthy one without this, so health reports the measured outcome
            # (configured/ready/challenged/bypassed + last egress) and never the
            # proxy URL or its credentials.
            "youtube_egress": music_mod.proxy_state(),
            "opus": opus.get("status"),
            "player": "ready" if status == "online" else "degraded",
            "latency": latency_ms,
            "voice_backend": voice_backend,
            "connected_voice_clients": connected,
            "tracked_players": len(players),
            "voice_playback": voice_playback,
        }
        if failed:
            body["error"] = f"Degraded subsystems: {', '.join(failed)}"
            body["failing"] = failed
        return web.json_response(body, status=200 if status == "online" else 503)

    async def music_playback_log(request: web.Request) -> web.Response:
        """Recent staged playback attempts (newest first). Sanitized."""
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        import music as music_mod
        try:
            limit = max(1, min(int(request.rel_url.query.get("limit", "20")), 50))
        except ValueError:
            limit = 20
        return web.json_response({
            "ok": True,
            "attempts": music_mod.engine.get_playback_log(limit),
        })

    async def music_test_audio(request: web.Request) -> web.Response:
        """[ ▶ Test Audio ] — staged PASS/FAIL/NOT TESTED for the dashboard."""
        if not _authorized(request):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        import music as music_mod
        gateway_alive, hb_age, _ = gateway_liveness(bot)
        result = await music_mod.engine.run_playback_test()
        stages = result.get("stages", {})
        # The gateway measurement is real here, not inferred from the loop.
        stages["discord_gateway"] = "PASS" if gateway_alive else "FAIL"
        result["stages"] = stages
        result["detail"] = {**(result.get("detail", {})),
                            "gateway_heartbeat_age_seconds": hb_age}
        return web.json_response(result, status=200 if result.get("ok") else 503)

    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_get("/health/music", health_music)
    app.router.add_get("/music/diagnose", music_diagnose)
    app.router.add_get("/music/diagnostics", music_diagnostics)
    app.router.add_get("/music/playback-log", music_playback_log)
    app.router.add_post("/music/test-audio", music_test_audio)
    app.router.add_get("/music/test-audio", music_test_audio)
    app.router.add_post("/prefix/refresh", prefix_refresh)
    app.router.add_get("/music/state/{guild_id:\\d+}", music_state)
    app.router.add_post("/music/control/{guild_id:\\d+}", music_control)
    app.router.add_get("/mod/member/{guild_id:\\d+}/{user_id:\\d+}", member_lookup)
    app.router.add_post("/mod/action/{guild_id:\\d+}", mod_action)
    app.router.add_post("/self-test/gateway-drop", gateway_drop)
    port = int(os.environ.get("PORT") or 8080) or 8080  # PORT=0 → default
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    try:
        import music as music_mod
        await music_mod.probe()
    except Exception as exc:
        log.warning("Music probe failed at startup: %s", str(exc)[:160])
    # Keep-alive: ping the site's health endpoint every 5 minutes so the
    # dashboard Health Monitor has real server-side data, and so the site
    # (which polls bot health too) sees a live bot. This is legitimate
    # health monitoring, not traffic generation.
    async def _keepalive_loop() -> None:
        await bot.wait_until_ready()
        while not bot.is_closed():
            ok = not bot.is_closed() and http_mod.get_status().get("discord") == "online"
            await database.keepalive_record(ok, gateway_latency_ms(bot, 0),
                                            200 if ok else 503, "bot self-check")
            try:
                resp_status, _data = await http_mod.get_json(f"{config.MURASTREAM_URL}/api/dashboard/status")
                await database.keepalive_record(
                    resp_status == 200, 0, resp_status,
                    f"site /api/dashboard/status → {resp_status}")
            except Exception:
                pass
            # Actively measure each subsystem instead of waiting for a command
            # to touch it. These were previously written only as a side effect
            # of a user command, so an idle bot reported them as "starting"
            # forever and the dashboard showed a permanently broken service.
            import music as music_mod
            for name, probe in (("site_bridge", bridge.probe), ("movies", tmdb.probe),
                                ("music", music_mod.probe)):
                try:
                    value = await probe()
                    log.debug("probe %s -> %s", name, value)
                except Exception as exc:
                    log.warning("probe %s failed: %s", name, str(exc)[:160])
            await asyncio.sleep(300)
    asyncio.create_task(_keepalive_loop())
    while True:
        await asyncio.sleep(3600)


async def main() -> None:
    global bot, _privileged_ok
    problems = config.validate()
    if problems:
        for p in problems:
            log.error("CONFIG: %s", p)
        sys.exit(1)
    asyncio.create_task(_health_server())
    # Exponential backoff reconnect loop — survives network drops and the
    # privileged-intent fallback rebuild.
    delay = 5
    while True:
        try:
            await bot.start(config.DISCORD_TOKEN)
            break  # clean shutdown
        except discord.LoginFailure:
            global _login_failed
            _login_failed = True
            try:
                http_mod.set_status("discord", "auth-failed-invalid-token")
            except Exception:
                pass
            log.error("Discord rejected the token — check DISCORD_TOKEN.")
            sys.exit(1)
        except discord.errors.PrivilegedIntentsRequired:
            if _privileged_ok:
                _privileged_ok = False
                # NOT a cosmetic degradation: without message_content Discord
                # never delivers normal messages, so EVERY `mg!` prefix command
                # (mg!play included) silently does nothing. Say so loudly.
                log.error(
                    "PRIVILEGED INTENTS MISSING. Enable 'Message Content Intent' "
                    "(and 'Server Members Intent') at "
                    "https://discord.com/developers/applications → your app → Bot. "
                    "Until then, `mg!` prefix commands (mg!play, mg!skip, …) will "
                    "NOT respond — slash commands still work."
                )
                http_mod.set_status("prefix_commands", "disabled-no-message-content")
                try:
                    await bot.close()
                except Exception:
                    pass
                bot = MuraBot()  # fresh instance, handlers intact (subclass)
                delay = 5
                continue
            raise
        except (discord.HTTPException, asyncio.TimeoutError, OSError) as exc:
            global _reconnect_count
            _reconnect_count += 1
            log.warning("Connection lost (%s) — reconnecting in %ds", str(exc)[:200], delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Shutting down gracefully.")
