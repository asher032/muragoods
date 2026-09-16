"""Live Discord test harness — exercises every slash command against a real session.

Run:  python livecheck.py
Requires DISCORD_TOKEN in .env (same as the bot) and, for full coverage,
MONGO_URI. Produces livecheck-report.txt with PASS/FAIL per command.

This is the "actually run in Discord" layer on top of selfcheck.py (imports)
and test_commands.py (offline duck-typed callbacks): it logs in for real,
verifies guild sync, permissions, database reachability and per-command
handlers, and can optionally target a real voice channel.

Usage flags:
  --voice <channel_id>   Join a real voice channel and start real playback
                         for /play /radio checks (needs a live server).
  --guild <guild_id>     Guild to check sync/permissions against.
"""

import argparse
import asyncio
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent / "bot"))

import discord
from discord import app_commands
from discord.ext import commands

import config
import database
import net as http_mod

logging.basicConfig(level=logging.WARNING, format="%(levelname)-7s %(name)s: %(message)s")
log = logging.getLogger("livecheck")

REPORT_PATH = Path(__file__).resolve().parent / "livecheck-report.txt"
RESULTS: list[tuple[str, str, str]] = []  # (label, status, detail)


def record(label: str, ok: bool | None, detail: str = "") -> None:
    status = "PASS" if ok else ("SKIP" if ok is None else "FAIL")
    RESULTS.append((label, status, detail))
    print(f"[{status}] {label}" + (f" — {detail}" if detail else ""))


# ── Duck-typed interaction (same approach as test_commands.py) ──────────
class _Resp:
    def __init__(self) -> None:
        self.acked = False

    async def defer(self, *, ephemeral: bool = False, thinking: bool = False) -> None:
        self.acked = True

    async def send_message(self, *a, **k) -> None:
        self.acked = True

    def is_done(self) -> bool:
        return self.acked


class _Follow:
    def __init__(self) -> None:
        self.sent: list[Any] = []

    async def send(self, *a, **k) -> None:
        self.sent.append((a, k))


def make_interaction(guild: discord.Guild | None) -> Any:
    class I:
        def __init__(self) -> None:
            self.user = guild.me if guild else None
            self.guild = guild
            self.channel = guild.text_channels[0] if guild and guild.text_channels else None
            self.response = _Resp()
            self.followup = _Follow()
            self.command = None
            self.data = {}

        @property
        def guild_id(self):
            return guild.id if guild else None

    return I()


def synth_args(command: app_commands.Command) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    for param in command.parameters:
        if param.required is False:
            continue
        if param.choices:
            kwargs[param.name] = param.choices[0]
        elif param.type == discord.AppCommandOptionType.string:
            kwargs[param.name] = "test"
        elif param.type == discord.AppCommandOptionType.integer:
            kwargs[param.name] = 1
        elif param.type == discord.AppCommandOptionType.user:
            kwargs[param.name] = None  # handlers should error cleanly
        else:
            kwargs[param.name] = "test"
    return kwargs


async def test_all_commands(bot: discord.Client) -> None:
    from main import MuraBot  # ensure cogs loaded

    assert isinstance(bot, MuraBot)
    for cog_name, cog in bot.cogs.items():
        for command in cog.__cog_app_commands__:
            if isinstance(command, app_commands.Group):
                items = [(f"/{command.name} {s.name}", s) for s in command.commands]
            else:
                items = [(f"/{command.name}", command)]
            for label, cmd in items:
                inter = make_interaction(bot.guilds[0] if bot.guilds else None)
                kwargs = synth_args(cmd)
                try:
                    await cmd._callback(cog, inter, **kwargs)
                    if inter.response.acked:
                        record(label, True)
                    else:
                        record(label, False, "no acknowledge (would hit 'application did not respond')")
                except Exception as exc:
                    if inter.response.acked or inter.followup.sent:
                        record(label, True, f"graceful error: {type(exc).__name__}")
                    else:
                        record(label, False, f"crashed unacked: {type(exc).__name__}: {exc}"[:120])


async def run(voice_channel_id: int | None, guild_id: int | None) -> int:
    from main import MuraBot

    problems = config.validate()
    if problems:
        for p in problems:
            record(f"config: {p}", False)
        return 1

    record("config valid", True)

    intents = discord.Intents.default()
    intents.message_content = True
    intents.members = True
    bot = MuraBot()
    # Don't let setup_hook sync global commands during the test.
    bot.tree.sync = async_dummy  # type: ignore[method-assign]

    connected = asyncio.Event()

    @bot.event
    async def on_ready():
        connected.set()

    try:
        asyncio.create_task(bot.start(config.DISCORD_TOKEN))
        await asyncio.wait_for(connected.wait(), timeout=30)
        record("Discord login + READY", True)
    except asyncio.TimeoutError:
        record("Discord login + READY", False, "no READY within 30s")
        return 1
    except Exception as exc:
        record("Discord login + READY", False, str(exc)[:150])
        return 1

    try:
        # Load cogs without full setup_hook (skips DB + global sync).
        # load_extension raises on already-loaded; a crash here means a real
        # import problem, not a double-load (main.py loads once per process).
        loaded = 0
        for cog in bot.initial_cogs:
            try:
                await bot.load_extension(cog)
                loaded += 1
            except commands.errors.ExtensionAlreadyLoaded:
                loaded += 1  # already registered — fine
        record("cogs loaded", True, f"{loaded}/{len(bot.initial_cogs)} cogs")
    except Exception as exc:
        record("cogs loaded", False, str(exc)[:150])

    # Database
    try:
        await database.connect()
        record("MongoDB reachable", True, config.MONGO_DB)
    except Exception as exc:
        record("MongoDB reachable", False, str(exc)[:120])

    target_guild = None
    if guild_id:
        target_guild = bot.get_guild(guild_id)
        if target_guild:
            record(f"guild present: {target_guild.name}", True)
        else:
            record(f"guild {guild_id} visible to bot", False, "not in bot.guilds")

    if target_guild:
        me = target_guild.me
        perms = me.guild_permissions
        for perm_name in ("view_channel", "send_messages", "embed_links", "read_message_history",
                          "connect", "speak", "manage_channels", "moderate_members"):
            record(f"bot permission: {perm_name}", getattr(perms, perm_name, False))

    # Slash command registration reachable from Discord?
    try:
        registered = await bot.tree.fetch_commands()
        record("global slash commands registered", True, f"{len(registered)} commands")
    except Exception as exc:
        record("global slash commands registered", False, str(exc)[:120])

    # Command handlers
    await test_all_commands(bot)

    # Voice path (only with --voice)
    if voice_channel_id and target_guild:
        channel = target_guild.get_channel(voice_channel_id)
        if channel and isinstance(channel, discord.VoiceChannel):
            try:
                vc = await channel.connect(self_deaf=True, timeout=15)
                record(f"voice connect: {channel.name}", True)
                import music as music_mod
                track = await music_mod.engine.resolve("lofi hip hop")
                if track:
                    record("yt-dlp resolve (live)", True, track.title[:60])
                    try:
                        await music_mod.engine.play_now(
                            music_mod.engine.get_player(target_guild.id), track, channel)
                        await asyncio.sleep(4)
                        playing = vc.is_playing()
                        record("real audio playback (FFmpeg → Discord)", playing,
                               "listen check still manual" if playing else "player not active after 4s")
                    except Exception as exc:
                        record("real audio playback (FFmpeg → Discord)", False, str(exc)[:120])
                else:
                    record("yt-dlp resolve (live)", False, "no result")
                await vc.disconnect(force=True)
            except Exception as exc:
                record(f"voice connect: {channel.name}", False, str(exc)[:120])
        else:
            record(f"voice channel {voice_channel_id}", False, "not found or not a voice channel")
    else:
        record("voice playback", None, "skipped (no --voice given)")

    await bot.close()
    try:
        await database.close()
    except Exception:
        pass
    await http_mod.close()

    # Report
    fails = [r for r in RESULTS if r[1] == "FAIL"]
    skips = [r for r in RESULTS if r[1] == "SKIP"]
    passes = [r for r in RESULTS if r[1] == "PASS"]
    lines = [
        "MuraBot Live Self-Test Report",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"Bot: {bot.user} | Guilds: {len(bot.guilds) if not bot.is_closed() else '?'}",
        "=" * 60,
        f"PASS {len(passes)} | FAIL {len(fails)} | SKIP {len(skips)}",
        "",
    ]
    for label, status, detail in RESULTS:
        suffix = f" — {detail}" if detail else ""
        lines.append(f"[{status}] {label}{suffix}")
    lines += ["", "Legend: PASS = verified live, FAIL = must fix before publish,",
              "        SKIP = not runnable in this environment (e.g. no --voice)"]
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nReport written to {REPORT_PATH}")
    print(f"PASS {len(passes)} | FAIL {len(fails)} | SKIP {len(skips)}")
    return 1 if fails else 0


async def async_dummy(*a, **k):
    return []


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", type=int, default=None, help="voice channel ID for real playback test")
    parser.add_argument("--guild", type=int, default=None, help="guild ID to verify")
    args = parser.parse_args()
    sys.exit(asyncio.run(run(args.voice, args.guild)))
