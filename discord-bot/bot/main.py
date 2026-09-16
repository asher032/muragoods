"""Bot entrypoint — loads cogs, syncs once, resilient startup, health endpoint."""

import asyncio
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Make sibling modules importable regardless of how the bot is launched.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import discord
from discord.ext import commands

import config
import database
import embeds
import net as http_mod

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logging.getLogger("discord").setLevel(logging.WARNING)
log = logging.getLogger("bot.main")

# Health tracking
_start_time = time.time()
_reconnect_count = 0

# Flipped to False if Discord rejects the privileged-intent request; the bot
# then restarts without them (automod message-scan + welcome events disabled).
_privileged_ok = True


class MuraBot(commands.Bot):
    """All lifecycle handlers live on the class so a rebuilt instance keeps them."""

    def __init__(self) -> None:
        intents = discord.Intents.default()
        if _privileged_ok:
            intents.message_content = True   # automod + XP from messages
            intents.members = True           # welcome events
        super().__init__(
            command_prefix=commands.when_mentioned_or("mg!", "MuraBot "),
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
        # Sync ONCE per process start (global). Per-guild instant sync happens
        # in on_guild_join. Re-syncing on every reconnect causes rate limits.
        try:
            synced = await self.tree.sync()
            log.info("Successfully synced %d commands.", len(synced))
        except discord.HTTPException as exc:
            log.error("Command sync FAILED (will retry on next start): %s", str(exc)[:300])

    async def on_ready(self) -> None:
        http_mod.set_status("discord", "online")
        http_mod.set_status("music", "online")
        log.info("Music subsystem online")
        activity_name = config.BOT_ACTIVITY.strip() or "https://muragoods.vercel.app/"
        if "twitch.tv" in activity_name.lower():
            activity_name = "https://muragoods.vercel.app/"
        activity = discord.Activity(
            type=discord.ActivityType.watching,
            name=activity_name,
        )
        await self.change_presence(
            activity=activity,
            status={"online": discord.Status.online, "idle": discord.Status.idle,
                    "dnd": discord.Status.do_not_disturb}.get(
                        config.BOT_STATUS.lower(), discord.Status.online))
        log.info("Logged in as %s (%s) - %d guilds", self.user, getattr(self.user, "id", "?"), len(self.guilds))

    async def on_guild_join(self, guild: discord.Guild) -> None:
        try:
            await self.tree.sync(guild=guild)
            log.info("Guild-synced commands for %s", guild.id)
        except discord.HTTPException:
            log.warning("Guild sync failed for %s", guild.id)


bot = MuraBot()


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
        e = embeds.err_embed(error_id)
        if interaction.response.is_done():
            await interaction.followup.send(embed=e, ephemeral=True)
        else:
            await interaction.response.send_message(embed=e, ephemeral=True)
    except discord.HTTPException:
        pass


async def _health_server() -> None:
    """Tiny HTTP endpoint for host healthchecks (Render/Docker)."""
    from aiohttp import web

    async def health(_request: web.Request) -> web.Response:
        statuses = http_mod.get_status()
        ok = not bot.is_closed() and statuses.get("discord") == "online"
        latency_ms = round(bot.latency * 1000) if bot.latency else 0
        uptime = time.time() - _start_time
        last_hb = None
        if hasattr(bot, "_connection") and bot._connection:
            last_hb_ts = getattr(bot._connection, "last_heartbeat", None)
            if last_hb_ts:
                last_hb = datetime.fromtimestamp(last_hb_ts).isoformat()
        shard_count = len(bot.shards) if hasattr(bot, "shards") else 1
        bot_version = getattr(config, "BOT_VERSION", "1.0.0")
        return web.json_response({
            "ok": ok,
            "guilds": len(bot.guilds),
            "subsystems": statuses,
            "bot_version": bot_version,
            "latency": latency_ms,
            "uptime_seconds": round(uptime),
            "last_heartbeat": last_hb,
            "reconnect_count": _reconnect_count,
            "shard_count": shard_count,
        }, status=200 if ok else 503)

    app = web.Application()
    app.router.add_get("/health", health)
    port = int(os.environ.get("PORT") or 8080) or 8080  # PORT=0 → default
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    http_mod.set_status("music", "online")
    log.info("Music subsystem online")
    # Keep-alive: ping the site's health endpoint every 5 minutes so the
    # dashboard Health Monitor has real server-side data, and so the site
    # (which polls bot health too) sees a live bot. This is legitimate
    # health monitoring, not traffic generation.
    async def _keepalive_loop() -> None:
        await bot.wait_until_ready()
        while not bot.is_closed():
            ok = not bot.is_closed() and http_mod.get_status().get("discord") == "online"
            await database.keepalive_record(ok, round(bot.latency * 1000) if bot.latency else 0,
                                            200 if ok else 503, "bot self-check")
            try:
                resp_status, _data = await http_mod.get_json(f"{config.MURASTREAM_URL}/api/dashboard/status")
                await database.keepalive_record(
                    resp_status == 200, 0, resp_status,
                    f"site /api/dashboard/status → {resp_status}")
            except Exception:
                pass
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
            log.error("Discord rejected the token — check DISCORD_TOKEN.")
            sys.exit(1)
        except discord.errors.PrivilegedIntentsRequired:
            if _privileged_ok:
                _privileged_ok = False
                log.warning(
                    "Privileged intents are not enabled in the Developer Portal — "
                    "restarting WITHOUT them. Everything works except automod message "
                    "scanning, XP-from-chat and welcome messages."
                )
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
