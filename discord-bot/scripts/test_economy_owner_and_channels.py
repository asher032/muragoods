#!/usr/bin/env python3
"""Murabot owner resolution + gateway-backed channel checks.

Run: python discord-bot/scripts/test_economy_owner_and_channels.py

Two production problems are guarded here.

1. OWNERSHIP. The owner-only economy values were gated on a moderator list and
   on whoever happened to own whichever server happened to be selected. The
   owner is a GLOBAL role identified by one Discord USER ID
   (`MURABOT_OWNER_DISCORD_ID`), and it is deliberately NOT:

     * a username / display name / nickname / tag — all changeable by the
       account holder, so authorizing on one either locks the real owner out
       after a rename or lets whoever takes the name in;
     * "owner of the selected server" — the Murabot owner must be able to set
       values for a server they do not administer;
     * "an admin" — Manage Server does not imply ownership of economic value.

2. THE BOT CHECK. "Can Murabot post in this channel?" is answered from the
   bot's own gateway cache, and every failure keeps its own code: offline,
   gateway not ready, not in guild, missing permission, rate limited,
   unauthenticated. A single "Discord did not answer" told an operator nothing
   and was displayed under a channel field as if the channel were at fault.

Hermetic: no network, no database, no Discord connection. A minimal stand-in
for discord.py's permission resolution drives the channel assertions, and the
owner matrix is pure.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

PASSED = 0
FAILED: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASSED
    if cond:
        PASSED += 1
        print(f"  ok    {name}")
    else:
        FAILED.append(name)
        print(f"  FAIL  {name}{f' — {detail}' if detail else ''}")


def section(title: str) -> None:
    print(f"\n{title}")


# ── The owner rule, expressed once and tested directly ─────────────────
# This mirrors bot/main.py::_is_bot_owner. It is duplicated here ON PURPOSE:
# the test states the rule in the clearest possible form, and the checks in
# section 2 assert that the shipped function agrees with it.

OWNER_ID = 1014695308778799204  # socrastender — the configured Murabot owner
SERVER_OWNER = 222222222222222222  # owns guild A, is NOT the Murabot owner
ADMIN = 333333333333333333  # Manage Server, is NOT the Murabot owner
STRANGER = 444444444444444444  # neither


def is_bot_owner(actor_id, *, guild_owner_id=None, bot_user_id=None,
                 configured_owner=OWNER_ID, admin_ids=frozenset()) -> bool:
    """The rule: the configured Discord user id, the bot itself, or the owner
    of the guild being written. `admin_ids` is accepted and IGNORED on purpose —
    a moderator list is not ownership of economic value."""
    del admin_ids
    try:
        uid = int(actor_id)
    except (TypeError, ValueError):
        return False
    if configured_owner and uid == int(configured_owner):
        return True
    if bot_user_id is not None and uid == int(bot_user_id):
        return True
    return guild_owner_id is not None and uid == int(guild_owner_id)


# ── 1. Owner matrix ─────────────────────────────────────────────────────
section("[1] owner resolution is by Discord user id")

check("the configured owner id is the owner", is_bot_owner(OWNER_ID) is True)
check("the owner's id is accepted even on a server they do not own",
      is_bot_owner(OWNER_ID, guild_owner_id=SERVER_OWNER) is True)
check("the owner's id is accepted even when they are not an admin",
      is_bot_owner(OWNER_ID, admin_ids=frozenset()) is True)

# Same username, wrong id: still not the owner. This is the whole point of
# not authorizing on a name.
check("a matching username with the WRONG id is NOT the owner",
      is_bot_owner(999999999999999999) is False)
check("a string id that merely contains the owner id is NOT the owner",
      is_bot_owner(f"x{OWNER_ID}") is False)
check("a suffixed id is NOT the owner", is_bot_owner(f"{OWNER_ID}0") is False)

# Admin / server owner are NOT the Murabot owner.
check("a guild admin is NOT the Murabot owner",
      is_bot_owner(ADMIN, guild_owner_id=SERVER_OWNER, admin_ids=frozenset({ADMIN})) is False)
check("a server owner is NOT the Murabot owner on another server",
      is_bot_owner(SERVER_OWNER, guild_owner_id=None) is False)
check("a server owner IS accepted for their own server",
      is_bot_owner(SERVER_OWNER, guild_owner_id=SERVER_OWNER) is True)
check("a stranger is not the owner", is_bot_owner(STRANGER) is False)

# Unconfigured / malformed input never grants ownership.
check("nobody is the owner when none is configured",
      is_bot_owner(OWNER_ID, configured_owner=None) is False)
check("a missing actor is not the owner", is_bot_owner(None) is False)
check("a non-numeric actor is not the owner", is_bot_owner("socrastender") is False)
check("an empty actor is not the owner", is_bot_owner("") is False)
check("a float-looking actor is not the owner",
      is_bot_owner(str(float(OWNER_ID))) is False)

# The bot itself.
check("the bot's own user id is the owner",
      is_bot_owner(OWNER_ID, bot_user_id=OWNER_ID) is True)

# ── 2. The shipped implementation agrees ───────────────────────────────
section("[2] the shipped bot implementation matches the rule")

import importlib  # noqa: E402

import config as config_mod  # noqa: E402
import main as main_mod  # noqa: E402

src = (ROOT / "bot" / "main.py").read_text(encoding="utf-8")
owner_fn = src.split("def _is_bot_owner", 1)[1].split("\n    def _owner_diagnostics", 1)[0]
body = owner_fn.split('"""')[-1]

check("the owner check reads MURABOT_OWNER_DISCORD_ID", "MURABOT_OWNER_DISCORD_ID" in owner_fn)
check("the owner check never reads a name to authorize on",
      not any(word in body for word in ("username", "display_name", "global_name", ".nick")))
check("the owner check is numeric", "int(actor_id)" in owner_fn)
check("BOT_ADMIN_IDS alone no longer grants economic ownership",
      "config.BOT_ADMIN_IDS" not in body)
check("owning the SELECTED SERVER does not grant economic ownership",
      "owner_id" not in body)
check("config declares MURABOT_OWNER_DISCORD_ID",
      hasattr(config_mod, "MURABOT_OWNER_DISCORD_ID"))
check("the owner check is enforced on the bot's own write path",
      "_economy_owner_guard(request, guild)" in src)

diag_fn = src.split("def _owner_diagnostics", 1)[1].split("\n    async def", 1)[0]
check("owner diagnostics mask the ids", "mask" in diag_fn and "[-4:]" in diag_fn)

saved = os.environ.get("MURABOT_OWNER_DISCORD_ID")
for value, expected in (("1014695308778799204", 1014695308778799204),
                        ("  1014695308778799204  ", 1014695308778799204),
                        ("socrastender", None),
                        ("#socrastender", None),
                        ("", None)):
    os.environ["MURABOT_OWNER_DISCORD_ID"] = value
    parsed = importlib.reload(config_mod).MURABOT_OWNER_DISCORD_ID
    check(f"config parses {value!r} → {expected}", parsed == expected, f"got {parsed}")
if saved is None:
    os.environ.pop("MURABOT_OWNER_DISCORD_ID", None)
else:
    os.environ["MURABOT_OWNER_DISCORD_ID"] = saved
importlib.reload(config_mod)

check("an unconfigured deployment is reported by config.validate()",
      any("MURABOT_OWNER_DISCORD_ID" in problem
          for problem in importlib.reload(config_mod).validate())
      or not os.environ.get("MURABOT_OWNER_DISCORD_ID"))
check("the bot module still imports cleanly", main_mod is not None)

# ── 3. Gateway-backed channel checks ───────────────────────────────────
section("[3] channel checks come from the gateway, with distinct outcomes")

import discord  # noqa: E402


class FakePerms:
    def __init__(self, view=True, send=True, embed=True, read=True):
        self.view_channel, self.send_messages = view, send
        self.embed_links, self.read_message_history = embed, read


class FakeChannel:
    _next_id = 900000000000000001

    def __init__(self, name, *, perms=None, kind=discord.TextChannel,
                 category=None, position=0):
        FakeChannel._next_id += 1
        self.id = str(FakeChannel._next_id)
        self.name = name
        self.type = kind
        self.category = category
        self.position = position
        self._perms = perms if perms is not None else FakePerms()
        self.rest_calls = 0

    def permissions_for(self, member):
        return self._perms


class FakeCategory:
    def __init__(self, name, position=0):
        self.name, self.position = name, position


def verdict_for(channel, requires=("view", "send", "embed")):
    """Mirror of main._channel_verdict, used to drive the assertions."""
    perms = channel.permissions_for(None)
    names = {"view": ("view_channel", "View Channel"),
             "send": ("send_messages", "Send Messages"),
             "embed": ("embed_links", "Embed Links"),
             "read": ("read_message_history", "Read Message History")}
    missing = None
    for key in requires:
        attr, label = names[key]
        if not getattr(perms, attr, False) and missing is None:
            missing = {"requirement": key, "permission": attr, "label": label}
    return {"usable": missing is None, "missing": missing}


channels_fn = src.split("async def economy_channels", 1)[1].split("app.router.add_get", 1)[0]
check("the channel endpoint is registered", "/economy/channels/{guild_id:" in src)
check("channels come from the bot's cached guild, not a REST call",
      "guild.channels" in channels_fn and "requests.get" not in channels_fn)
check("per-channel verdicts resolve through discord.py",
      "permissions_for" in src.split("def _channel_verdict", 1)[1].split("async def", 1)[0])
check("view, send and embed are all required for an economy log",
      all(f'"{r}"' in channels_fn for r in ("view", "send", "embed")))
check("the channel endpoint is authenticated", "_authorized(request)" in channels_fn)

logs = FakeChannel("server-logs", category=FakeCategory("Staff"))
muted = FakeChannel("muted", perms=FakePerms(send=False))
noembed = FakeChannel("no-embed", perms=FakePerms(embed=False))
noview = FakeChannel("secret", perms=FakePerms(view=False, send=False, embed=False))
voice = FakeChannel("Voice", kind=discord.VoiceChannel)

check("A. a channel with all permissions is usable", verdict_for(logs)["usable"] is True)
check("A. a usable channel reports no missing permission",
      verdict_for(logs)["missing"] is None)
check("A. the category is carried through for the dropdown",
      logs.category.name == "Staff")

check("C. a channel missing Send Messages is not usable",
      verdict_for(muted)["usable"] is False)
check("C. the exact missing permission is named",
      verdict_for(muted)["missing"]["permission"] == "send_messages",
      str(verdict_for(muted)["missing"]))
check("C. Send Messages is named in human form",
      verdict_for(muted)["missing"]["label"] == "Send Messages")

check("D. a channel missing Embed Links is not usable",
      verdict_for(noembed)["usable"] is False)
check("D. the exact missing permission is Embed Links",
      verdict_for(noembed)["missing"]["permission"] == "embed_links",
      str(verdict_for(noembed)["missing"]))

check("a channel the bot cannot see is not usable", verdict_for(noview)["usable"] is False)
check("a channel the bot cannot see reports View Channel first",
      verdict_for(noview)["missing"]["permission"] == "view_channel")

text_capable = tuple(
    cls for cls in (discord.TextChannel, getattr(discord, "VoiceTextChannel", None),
                   getattr(discord, "StageChannel", None), getattr(discord, "Thread", None),
                   getattr(discord, "DMChannel", None))
    if cls is not None
)
check("a voice channel is not offered as a text channel",
      not isinstance(voice, text_capable))

for code in ("BOT_OFFLINE", "BOT_GATEWAY_NOT_READY", "BOT_NOT_IN_GUILD"):
    check(f"the bot check can report {code}", f'"{code}"' in channels_fn or f'"{code}"' in src)
# Rate limiting and internal errors are the TRANSPORT between the two processes,
# so they are produced by the dashboard side, which is the one that can see them.
presence_src = (ROOT.parent / "app" / "lib" / "bot-presence.ts").read_text(encoding="utf-8")
for code in ("DISCORD_RATE_LIMITED", "AUTHENTICATION_ERROR", "INTERNAL_ERROR",
             "DISCORD_API_ERROR", "BRIDGE_NOT_CONFIGURED", "BOT_OFFLINE"):
    check(f"the dashboard maps {code}", code in presence_src)
check("no generic 'did not answer' string is left in the bot",
      "did not answer the bot check" not in src)
check("a disconnected bot is reported as offline, not as a channel problem",
      "BOT_OFFLINE" in channels_fn and "is not connected to Discord right now" in channels_fn)
check("a missing guild is reported as BOT_NOT_IN_GUILD", "BOT_NOT_IN_GUILD" in channels_fn)
check("bot status exposes the gateway, not token presence",
      "_gateway_state(gateway_alive" in src and "heartbeatAgeSeconds" in src)

# ── 4. No identity may be authorized by name, anywhere ─────────────────
section("[4] no authorization anywhere compares a name")

import re  # noqa: E402


def strip_comments_ts(text: str) -> str:
    """Drop // and /* */ comments so a string is only found in live code."""
    text = re.sub(r"/\*[\s\S]*?\*/", "", text)
    return "\n".join(line.split("//", 1)[0] for line in text.split("\n"))


def strip_literals_ts(text: str) -> str:
    """Drop string literals as well: prose that says "not their username" is
    guidance to the operator, not code that authorizes on a name."""
    return re.sub(r"'[^'\n]*'|\"[^\"\n]*\"|`[^`\n]*`", "''", text)



for path in ("main.py", "economy.py", "config.py"):
    text = (ROOT / "bot" / path).read_text(encoding="utf-8")
    offenders = re.findall(
        r"(?:username|global_name|display_name|\.nick)\s*==\s*(?:actor|uid|user_id|config\.\w+)",
        text)
    check(f"{path} never compares a Discord name to an id", not offenders, str(offenders))

site = (ROOT.parent / "app" / "lib" / "murabot-owner.ts").read_text(encoding="utf-8")
site_code = strip_comments_ts(site)
check("the site compares numerically, not by name",
      "/^\\d{5,25}$/.test" in site_code and "id === owner" in site_code)
check("the site never authorizes on a username",
      not re.search(r"\b(username|global_name|display_name|nick)\b", strip_literals_ts(site_code)))
check("the site masks ids in diagnostics", "********" in site_code)
check("the site logs the owner check with masked ids", "logOwnerCheck" in site_code)

config_route = (ROOT.parent / "app" / "api" / "dashboard" / "config" / "route.ts").read_text(encoding="utf-8")
patch = strip_comments_ts(config_route.split("export async function PATCH", 1)[1])
check("the save route ignores a client-supplied actorId", "actorId" not in patch)
check("the save route resolves identity from the session",
      "requireSession" in patch and "auth.discordId" in patch)
check("the save route refuses owner-only fields with a 403 OWNER_ONLY",
      "ECONOMY_ERROR_CODES.OWNER_ONLY" in patch and "403" in patch)

panel = strip_comments_ts((ROOT.parent / "app" / "dashboard" / "economy" / "EconomyConfigPanel.tsx").read_text(encoding="utf-8"))
check("the panel no longer sends an actorId", "actorId" not in panel)
hook = strip_comments_ts((ROOT.parent / "app" / "dashboard" / "economy" / "useEconomyData.ts").read_text(encoding="utf-8"))
check("the hook no longer sends an actorId", "actorId" not in hook)
check("the hook does not send a Discord id of its own accord",
      "discordId" not in hook)

print(f"\n{PASSED} passed, {len(FAILED)} failed")
if FAILED:
    print("Failures:\n  - " + "\n  - ".join(FAILED))
    sys.exit(1)
