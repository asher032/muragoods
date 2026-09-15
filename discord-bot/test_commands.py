"""Test harness: invokes EVERY slash command callback with mock interactions.

Verifies the critical invariant — every handler either defers or responds
(the anti-"application did not respond" guarantee) — plus exercises real
database/API paths. Run: python test_commands.py
"""

import asyncio
import logging
import os
import sys
from pathlib import Path
from typing import Any

# Windows consoles default to cp1252 — force UTF-8 for ✗/✓ output.
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent / "bot"))

import discord
from discord import app_commands

import config
import database
import net as http_mod

logging.basicConfig(level=logging.CRITICAL)  # silence during test run

PASS: list[str] = []
FAIL: list[str] = []


# ── Mocks ────────────────────────────────────────────────────────────────
class MockResponse:
    def __init__(self):
        self.acked = False
        self.mode = None

    async def defer(self, *, ephemeral: bool = False, thinking: bool = False) -> None:
        self.acked = True
        self.mode = "defer"

    async def send_message(self, *args, **kwargs) -> None:
        self.acked = True
        self.mode = "send_message"

    def is_done(self) -> bool:
        return self.acked


class MockFollowup:
    def __init__(self):
        self.sent: list[Any] = []

    async def send(self, *args, **kwargs) -> Any:
        self.sent.append((args, kwargs))
        return None


class MockAvatar:
    url = "https://cdn.discordapp.com/embed/avatars/0.png"


class MockPermissions:
    manage_guild = True
    manage_messages = True
    manage_channels = True
    kick_members = True
    ban_members = True
    moderate_members = True
    administrator = True
    connect = True
    speak = True

    def __ge__(self, other):
        return True

    def __le__(self, other):
        return True

    def __lt__(self, other):
        return False

    def __gt__(self, other):
        return False


class MockRoles:
    def __init__(self, mention_val=None):
        self.position = 5
        self.mention = mention_val or "<@&000>"
        self.id = 555


class MockUser:
    def __init__(self, uid=123456789012345678):
        self.id = uid
        self.mention = f"<@{uid}>"
        self.name = "TestUser"
        self.display_name = "TestUser"
        self.bot = False
        self.display_avatar = MockAvatar()
        self.voice = None
        self.guild_permissions = MockPermissions()
        self.top_role = MockRoles()
        self.roles = [MockRoles(), MockRoles()]
        self.created_at = discord.utils.utcnow()
        self.joined_at = discord.utils.utcnow()
        self.__str__ = lambda self: "TestUser#0001"


class MockChannel:
    id = 987654321098765432
    name = "general"
    mention = "<#987654321098765432>"

    def permissions_for(self, member):
        p = MockPermissions()
        p.connect = True
        p.speak = True
        return p

    def overwrites_for(self, role):
        return discord.PermissionOverwrite()

    def set_permissions(self, *a, **kw):
        return asyncio.sleep(0, result=None)

    async def purge(self, limit=1):
        return []

    def history(self, limit=50):
        async def gen():
            return
            yield
        return gen()

    async def send(self, *a, **kw):
        return None

    async def delete(self, *a, **kw):
        return None


class MockGuild:
    id = 111111111111111111
    name = "Test Server"
    icon = None
    member_count = 42
    owner_id = 123
    premium_tier = 0
    created_at = discord.utils.utcnow()

    def __init__(self):
        self.channels = [MockChannel()]
        self.roles = [MockRoles()]
        self.members = [MockUser()]
        self.me = MockUser(999)
        self.default_role = MockRoles()
        self.me.top_role = MockRoles()

    def get_channel(self, cid):
        return MockChannel()

    def get_member(self, uid):
        return MockUser(uid)

    async def create_text_channel(self, *a, **kw):
        return MockChannel()




class MockInteraction(discord.Interaction):  # typed but never constructed via API
    pass


def make_interaction(user=None, guild=None) -> Any:
    """Build a duck-typed interaction (avoids discord.Interaction internals)."""
    class I:
        def __init__(self):
            self.user = user or MockUser()
            self.guild = guild or MockGuild()
            self.channel = self.guild.channels[0]
            self.response = MockResponse()
            self.followup = MockFollowup()
            self.client = None
            self.command = None
            self.data = {}
            self.type = discord.InteractionType.application_command
            self.token = "fake"
            self.id = 1
            self.application_id = 1549395794853888020

        @property
        def guild_id(self):
            return self.guild.id

    return I()


# ── Argument synthesis ───────────────────────────────────────────────────
def synth_args(command: app_commands.Command) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    from discord import AppCommandOptionType
    for param in command.parameters:
        name = param.name
        opt_type = param.type  # AppCommandOptionType enum
        if param.choices:
            kwargs[name] = param.choices[0]
            continue
        if param.required is False:
            continue  # let defaults apply
        if opt_type == AppCommandOptionType.user:
            kwargs[name] = MockUser()
        elif opt_type == AppCommandOptionType.integer:
            kwargs[name] = 5 if name == "amount" else 1
        elif opt_type == AppCommandOptionType.string:
            kwargs[name] = "interstellar" if name in ("query", "title") else "test"
        elif opt_type == AppCommandOptionType.channel:
            kwargs[name] = MockChannel()
        elif opt_type == AppCommandOptionType.role:
            kwargs[name] = MockRoles()
        else:
            kwargs[name] = "test"
    return kwargs


async def run() -> int:
    from main import MuraBot

    bot = MuraBot()
    await http_mod.init()
    try:
        await database.connect()
        print("Database: online")
    except Exception as exc:
        # Mongo unreachable from this network — DB-dependent commands will
        # exercise their graceful-failure paths (which is also correct).
        print(f"Database: UNREACHABLE ({type(exc).__name__}) — testing graceful failures")
    for cog in bot.initial_cogs:
        await bot.load_extension(cog)

    total = 0
    for cog_name, cog in bot.cogs.items():
        commands = cog.__cog_app_commands__
        for command in commands:
            if isinstance(command, app_commands.Group):
                for sub in command.commands:
                    total += 1
                    await test_one(f"/{command.name} {sub.name}", cog, sub)
            else:
                total += 1
                await test_one(f"/{command.name}", cog, command)

    print(f"\n{'=' * 60}")
    print(f"TESTED {total} COMMANDS  |  PASS {len(PASS)}  |  FAIL {len(FAIL)}")
    if FAIL:
        print("\nFailures:")
        for f in FAIL:
            print("  X", f)
    print('=' * 60)
    try:
        await database.close()
    except Exception:
        pass
    await http_mod.close()
    return 1 if FAIL else 0


async def test_one(label: str, cog: Any, command: app_commands.Command) -> None:
    interaction = make_interaction()
    kwargs = synth_args(command)
    try:
        callback = command._callback
        await callback(cog, interaction, **kwargs)  # type: ignore[arg-type]
        if interaction.response.acked:
            PASS.append(label)
        else:
            FAIL.append(f"{label} — handler finished WITHOUT acknowledging")
    except Exception as exc:
        # Handlers must catch their own errors and still ack via error embed.
        if interaction.response.acked or interaction.followup.sent:
            PASS.append(f"{label} (failed gracefully: {type(exc).__name__})")
        else:
            FAIL.append(f"{label} — crashed unacknowledged: {type(exc).__name__}: {str(exc)[:80]}")


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
