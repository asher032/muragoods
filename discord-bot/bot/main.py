"""Bot entrypoint — loads cogs, syncs once, resilient startup, health endpoint."""

import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timedelta
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

    async def on_ready(self) -> None:
        http_mod.set_status("discord", "online")
        # "ready" = the music cog loaded, NOT that playback is proven. Reporting
        # "online" here would be a claim, not a measurement. The real verdict --
        # provider reachability, ffmpeg, resolver errors -- comes from
        # GET /music/diagnose, which actually performs a resolve.
        http_mod.set_status("music", "ready")
        log.info("Music subsystem ready (playback not yet exercised; see /music/diagnose)")
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
    """Tiny HTTP endpoint for host healthchecks (Render/Docker) + the
    music-state/control bridge the dashboard uses for REAL player data."""
    from aiohttp import web

    def _authorized(request: web.Request) -> bool:
        secret = config.BRIDGE_SECRET
        if not secret:
            return False
        return request.headers.get("Authorization", "") == f"Bearer {secret}"

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
        # Make the privileged-intent state explicit: if message_content could
        # not be requested, prefix commands are dead and the dashboard must be
        # able to show that instead of pretending the bot is fully healthy.
        if not _privileged_ok:
            statuses = {**statuses, "prefix_commands": "disabled-no-message-content"}
        return web.json_response({
            "ok": ok,
            "guilds": len(bot.guilds),
            # Real guild IDs the bot is currently present in — the dashboard uses
            # this to report "bot installed / not installed" per server instead
            # of guessing.
            "guild_ids": [str(g.id) for g in bot.guilds],
            "subsystems": statuses,
            "bot_version": bot_version,
            "latency": latency_ms,
            "uptime_seconds": round(uptime),
            "last_heartbeat": last_hb,
            "reconnect_count": _reconnect_count,
            "shard_count": shard_count,
        }, status=200 if ok else 503)

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
        return web.json_response({
            "ok": True,
            "connected": connected,
            "state": state,
            "voiceChannel": vc.channel.name if connected and vc.channel else None,
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

        out: dict[str, object] = {"ok": False, "query": query, "ffmpeg": music_mod.FFMPEG_EXE}
        try:
            import yt_dlp
            out["yt_dlp"] = yt_dlp.version.__version__
        except Exception:
            out["yt_dlp"] = None

        t0 = time.monotonic()
        try:
            track = await asyncio.wait_for(music_mod.engine.resolve(query), timeout=60)
        except asyncio.TimeoutError:
            out["error"] = "resolve timed out after 60s"
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
                })
            else:
                out["error"] = music_mod.engine.get_resolve_error() or "no result returned"

        return web.json_response(out, status=200 if out["ok"] else 503)

    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_get("/music/diagnose", music_diagnose)
    app.router.add_post("/prefix/refresh", prefix_refresh)
    app.router.add_get("/music/state/{guild_id:\\d+}", music_state)
    app.router.add_post("/music/control/{guild_id:\\d+}", music_control)
    app.router.add_get("/mod/member/{guild_id:\\d+}/{user_id:\\d+}", member_lookup)
    app.router.add_post("/mod/action/{guild_id:\\d+}", mod_action)
    port = int(os.environ.get("PORT") or 8080) or 8080  # PORT=0 → default
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    http_mod.set_status("music", "ready")
    log.info("Music subsystem ready (playback not yet exercised; see /music/diagnose)")
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
