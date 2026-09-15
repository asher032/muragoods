"""Bot entrypoint — loads cogs, syncs the command tree, resilient startup."""

import asyncio
import logging
import sys
from pathlib import Path

# Make sibling modules importable regardless of how the bot is launched.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import discord
from discord.ext import commands

import config
import database

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logging.getLogger("discord").setLevel(logging.WARNING)
log = logging.getLogger("bot.main")

# Flipped to False if Discord rejects the privileged-intent request; the bot
# then restarts without them (automod message-scan + welcome events disabled).
_privileged_ok = True


def build_bot() -> commands.Bot:
    intents = discord.Intents.default()
    if _privileged_ok:
        intents.message_content = True   # automod scans messages
        intents.members = True           # welcome events
    bot = commands.Bot(
        command_prefix=commands.when_mentioned,  # prefix unused; slash only
        intents=intents,
        help_command=None,
        allowed_mentions=discord.AllowedMentions(everyone=False, roles=False, replied_user=False),
    )
    bot.initial_cogs = [
        "cogs.murastream",
        "cogs.watchtogether",
        "cogs.music",
        "cogs.moderation",
        "cogs.muragoods",
    ]
    return bot


bot = build_bot()


@bot.event
async def setup_hook() -> None:
    await database.connect()
    for cog in bot.initial_cogs:
        try:
            await bot.load_extension(cog)
            log.info("Loaded %s", cog)
        except Exception:
            log.exception("Failed to load %s", cog)
    # Global slash sync (first propagation can take up to an hour).
    synced = await bot.tree.sync()
    log.info("Synced %d global slash commands", len(synced))


@bot.event
async def on_ready() -> None:
    activity = discord.Activity(type=discord.ActivityType.watching, name=config.BOT_ACTIVITY)
    status = {
        "online": discord.Status.online,
        "idle": discord.Status.idle,
        "dnd": discord.Status.do_not_disturb,
        "invisible": discord.Status.invisible,
    }.get(config.BOT_STATUS.lower(), discord.Status.online)
    await bot.change_presence(activity=activity, status=status)
    log.info(
        "Logged in as %s (%s) - %d guilds - intents: %s",
        bot.user, getattr(bot.user, "id", "?"), len(bot.guilds),
        "full" if _privileged_ok else "reduced (no message-content/members)",
    )


@bot.event
async def on_guild_join(guild: discord.Guild) -> None:
    # Instant per-guild command availability on join.
    try:
        await bot.tree.sync(guild=guild)
    except discord.HTTPException:
        log.warning("Guild sync failed for %s", guild.id)


@bot.tree.error
async def on_app_command_error(interaction: discord.Interaction, error: Exception) -> None:
    if isinstance(error, discord.app_commands.CheckFailure):
        return
    log.exception("Command error in %s", interaction.command)
    msg = "Something went wrong running that command. The error has been logged."
    if isinstance(error, discord.app_commands.CommandOnCooldown):
        msg = f"Slow down — try again in {error.retry_after:.0f}s."
    try:
        if interaction.response.is_done():
            await interaction.followup.send(msg, ephemeral=True)
        else:
            await interaction.response.send_message(msg, ephemeral=True)
    except discord.HTTPException:
        pass


async def _health_server() -> None:
    """Tiny HTTP endpoint for host healthchecks (Render/Docker)."""
    from aiohttp import web

    async def health(_request: web.Request) -> web.Response:
        ok = not bot.is_closed()
        return web.json_response({"ok": ok, "guilds": len(bot.guilds)}, status=200 if ok else 503)

    app = web.Application()
    app.router.add_get("/health", health)
    # Render/other hosts set $PORT; default 8080 for local + Docker healthcheck.
    import os
    port = int(os.environ.get("PORT", "8080"))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    log.info("Health endpoint on :%d/health", port)
    while True:
        await asyncio.sleep(3600)


async def run_bot() -> None:
    """Start the bot; on privileged-intent rejection restart once with reduced intents."""
    global bot, _privileged_ok
    try:
        await bot.start(config.DISCORD_TOKEN)
    except discord.errors.PrivilegedIntentsRequired:
        if not _privileged_ok:
            raise
        _privileged_ok = False
        log.warning(
            "Privileged intents are not enabled in the Developer Portal — "
            "restarting WITHOUT them. Everything works except automod message "
            "scanning and welcome messages. To enable: discord.com/developers/"
            "applications -> your app -> Bot -> Privileged Gateway Intents."
        )
        await bot.close()
        bot = build_bot()
        await bot.start(config.DISCORD_TOKEN)


async def main() -> None:
    problems = config.validate()
    if problems:
        for p in problems:
            log.error("CONFIG: %s", p)
        sys.exit(1)
    asyncio.create_task(_health_server())
    # Exponential backoff reconnect loop — survives network drops.
    delay = 5
    while True:
        try:
            await run_bot()
        except discord.LoginFailure:
            log.error("Discord rejected the token — check DISCORD_TOKEN.")
            sys.exit(1)
        except (discord.HTTPException, asyncio.TimeoutError, OSError) as exc:
            log.warning("Connection lost (%s) — reconnecting in %ds", str(exc)[:200], delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)
        else:
            delay = 5


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Shutting down gracefully.")
