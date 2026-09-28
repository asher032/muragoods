"""Interactive `/help` — registry-driven command browser.

One message, live components, zero hardcoded command lists:
  - category dropdown (StringSelectMenu) + paginated command pages (10/page)
  - per-command select for details (usage, options, permissions, examples)
  - search modal (name/description search, paginated)
  - Home / Close / Prev / Next buttons (no button literally named Back)
  - owner-only interaction (another user's click is rejected, menu preserved)
  - expiry disables components with a re-run hint, never an unhandled error

Everything renders from the bot's REAL app-command tree at invocation time:
new commands appear automatically, removed ones vanish. Categories come from
a small cog/name map with a Utility fallback — the mapping is routing, the
COMMANDS are registry.
"""

import logging
import math

import discord
from discord import app_commands
from discord.ext import commands

import utils

log = logging.getLogger("bot.help")

PAGE_SIZE = 10
# Component views die server-side at timeout while the message can look
# alive (a missed expiry edit leaves a clickable-but-dead menu whose clicks
# silently time out). 15 minutes keeps menus usable without masking expiry.
VIEW_TIMEOUT = 900.0

# ── Categories ────────────────────────────────────────────────────────
CATEGORIES: tuple[tuple[str, str, str], ...] = (
    ("overview", "🏠 Overview", "What Murabot does and where to start."),
    ("music", "🎵 Music", "Playback, queue, filters, radio and voice."),
    ("moderation", "🛡️ Moderation", "Warns, mutes, kicks, bans, notes, purge and lockdown."),
    ("security", "🔐 Security", "Anti-raid, lockdowns and server protection."),
    ("leveling", "📈 Leveling", "XP, ranks and leaderboards."),
    ("economy", "💰 Economy", "Currency, shop, inventory, quests, pets, farming, fishing and more."),
    ("fun", "🎮 Fun", "Games, polls, avatars and playful commands."),
    ("tickets", "🎫 Tickets", "Private support ticket channels."),
    ("giveaways", "🎁 Giveaways", "Timed prize giveaways."),
    ("suggestions", "💡 Suggestions", "Server suggestions and voting."),
    ("reminders", "⏰ Reminders", "Personal and channel reminders."),
    ("reputation", "⭐ Reputation", "Rep scores and leaderboards."),
    ("murastream", "🎬 Murastream", "Movies, shows, anime and watch together."),
    ("utility", "⚙️ Utility", "Info, ping and miscellaneous helpers."),
    ("setup", "🤖 Bot Setup", "Health, dashboard access and server setup."),
)
CATEGORY_IDS = tuple(c[0] for c in CATEGORIES)

# Cog qualified-name → category. Mixed cogs are split per command below.
_COG_CATEGORY: tuple[tuple[str, str], ...] = (
    ("MusicCog", "music"), ("Music", "music"),
    ("ModerationCog", "moderation"), ("ModerationGroup", "moderation"),
    ("NotesGroup", "moderation"), ("PurgeGroup", "moderation"),
    ("LockdownGroup", "security"), ("SecurityCog", "security"),
    ("LevelingCog", "leveling"),
    ("EconomyCog", "economy"), ("TicketsCog", "tickets"),
    ("MurastreamCog", "murastream"), ("MediaCommands", "murastream"),
    ("WatchTogether", "murastream"),
    ("FunCog", "fun"),
    ("HelpCog", "setup"),
)

# Exact command-path → category overrides (mixed cogs + special homes).
# Paths look like "/notes setnote", "/purge bot", "/security lockdown".
_NAME_OVERRIDES: tuple[tuple[str, str], ...] = (
    ("/notes", "moderation"), ("/purge", "moderation"),
    ("/lockdown", "security"), ("/security", "security"),
    ("/moderation", "moderation"),
    ("/debug", "setup"), ("/permissionaudit", "setup"),
    ("/status", "setup"), ("/dashboard", "setup"), ("/help", "setup"),
    ("/giveaway", "giveaways"), ("/reroll", "giveaways"),
    ("/suggest", "suggestions"), ("/suggestions", "suggestions"),
    ("/remind", "reminders"), ("/reminder", "reminders"),
    ("/rep", "reputation"), ("/repleaderboard", "reputation"),
    ("/achievements", "leveling"),
    ("/case", "moderation"), ("/cases", "moderation"),
    ("/ticket", "tickets"),
    ("/balance", "economy"), ("/daily", "economy"), ("/weekly", "economy"),
    ("/shop", "economy"), ("/inventory", "economy"), ("/quests", "economy"),
    ("/pay", "economy"), ("/fish", "economy"), ("/farm", "economy"),
    ("/work", "economy"), ("/pet", "economy"), ("/pets", "economy"),
    ("/rank", "leveling"), ("/leaderboard", "leveling"), ("/xp", "leveling"),
    ("/watchtogether", "murastream"),
)

# Curated permission notes for well-known actions (the registry exposes
# names/options, not Discord permission semantics). Unknown commands show —.
_USER_PERMS: tuple[tuple[str, str], ...] = (
    ("/moderation ban", "Ban Members"), ("/moderation softban", "Ban Members"),
    ("/moderation tempban", "Ban Members"), ("/moderation unban", "Ban Members"),
    ("/moderation kick", "Kick Members"),
    ("/moderation mute", "Manage Roles"), ("/moderation hardmute", "Manage Roles"),
    ("/moderation unmute", "Manage Roles"), ("/moderation warn", "Manage Roles"),
    ("/moderation warns", "Manage Roles"), ("/moderation removewarning", "Manage Roles"),
    ("/moderation clearwarnings", "Manage Roles"),
    ("/moderation timeout", "Timeout Members"), ("/moderation removetimeout", "Timeout Members"),
    ("/notes", "Manage Server"), ("/purge", "Manage Server"), ("/moderation cleanup", "Manage Server"),
    ("/lockdown", "Manage Channels"),
)
_BOT_PERMS: tuple[tuple[str, str], ...] = (
    ("/moderation ban", "Ban Members"), ("/moderation softban", "Ban Members"),
    ("/moderation tempban", "Ban Members"), ("/moderation unban", "Ban Members"),
    ("/moderation kick", "Kick Members"),
    ("/moderation mute", "Manage Roles"), ("/moderation hardmute", "Manage Roles"),
    ("/moderation unmute", "Manage Roles"),
    ("/moderation timeout", "Timeout Members"), ("/moderation removetimeout", "Timeout Members"),
    ("/lockdown", "Manage Channels"),
    ("/purge", "Manage Messages, Read History"),
    ("/play", "View Channel, Connect, Speak"),
)


def _lookup(table: tuple[tuple[str, str], ...], path: str) -> str:
    for prefix, value in table:
        if path == prefix or path.startswith(prefix + " ") or path.startswith(prefix + "/"):
            return value
    return ""


# ── Registry ──────────────────────────────────────────────────────────
def _param_info(param) -> dict:
    try:
        required = bool(getattr(param, "required", False))
    except Exception:
        required = False
    choices = []
    try:
        for choice in (getattr(param, "choices", None) or [])[:10]:
            choices.append(str(getattr(choice, "name", choice)))
    except Exception:
        pass
    return {
        "name": str(getattr(param, "name", "?")),
        "description": str(getattr(param, "description", "") or "")[:100],
        "required": required,
        "choices": choices,
    }


def _walk(commands_list, trail: tuple = ()) -> list:
    """Flatten the app-command tree: groups recurse, commands become entries.

    A bare group (parent with no callback of its own) is NOT an entry — only
    real invokable commands/subcommands count.
    """
    entries: list[dict] = []
    for cmd in commands_list or []:
        name = str(getattr(cmd, "name", "?"))
        path = "/" + " ".join([*trail, name]).strip()
        children = list(getattr(cmd, "commands", []) or [])
        if children:
            entries.extend(_walk(children, (*trail, name)))
            continue
        params = []
        try:
            for param in (getattr(cmd, "parameters", None) or []):
                params.append(_param_info(param))
        except Exception:
            pass
        cog_name = ""
        try:
            binding = getattr(cmd, "binding", None)
            cog_name = type(binding).__name__ if binding is not None else ""
        except Exception:
            pass
        entries.append({
            "path": path,
            "name": name,
            "description": str(getattr(cmd, "description", "") or "No description.")[:200],
            "params": params,
            "cog": cog_name,
        })
    return entries


def categorize(entry: dict) -> str:
    path = entry.get("path", "")
    hit = _lookup(_NAME_OVERRIDES, path)
    if hit:
        return hit
    cog = entry.get("cog", "")
    for cog_name, category in _COG_CATEGORY:
        if cog_name.lower() in cog.lower() and cog:
            return category
    top = path.split(" ")[0].lstrip("/")
    for cog_name, category in _COG_CATEGORY:
        if cog_name.lower() == top:
            return category
    return "utility"


def build_index(bot) -> dict[str, list[dict]]:
    """{category_id: [entries]} from the LIVE tree, sorted by path."""
    try:
        top = list(bot.tree.get_commands())
    except Exception:
        return {}
    index: dict[str, list[dict]] = {cid: [] for cid in CATEGORY_IDS if cid != "overview"}
    for entry in _walk(top):
        if entry["path"] == "/help":
            continue  # the browser never lists itself
        index.setdefault(categorize(entry), []).append(entry)
    for entries in index.values():
        entries.sort(key=lambda e: e["path"])
    return {cid: entries for cid, entries in index.items() if entries}


def search_index(index: dict[str, list[dict]], query: str) -> list[dict]:
    q = (query or "").strip().lower().lstrip("/")
    if not q:
        return []
    scored: list[tuple[int, dict]] = []
    for entries in index.values():
        for entry in entries:
            path = entry["path"].lower()
            desc = entry.get("description", "").lower()
            if q == path.lstrip("/").split(" ")[0] or q == path.lstrip("/"):
                score = 0
            elif path.lstrip("/").startswith(q):
                score = 1
            elif q in path:
                score = 2
            elif q in desc:
                score = 3
            else:
                continue
            scored.append((score, entry))
    scored.sort(key=lambda item: (item[0], item[1]["path"]))
    return [entry for _, entry in scored]


def paginate(items: list, page: int, size: int = PAGE_SIZE) -> tuple[list, int, int]:
    """Slice + clamp. Returns (page_items, page_index, total_pages)."""
    total = max(1, math.ceil(len(items) / size)) if items else 1
    page = max(0, min(page, total - 1))
    return items[page * size:(page + 1) * size], page, total


def usage_line(entry: dict) -> str:
    parts = []
    for param in entry.get("params", []):
        name = param.get("name", "?")
        parts.append(f"<{name}>" if param.get("required") else f"[{name}]")
    return f"{entry['path']}" + (f" {' '.join(parts)}" if parts else "")


# ── Rendering ─────────────────────────────────────────────────────────
def overview_embed() -> discord.Embed:
    e = utils.base_embed(
        "🤖 Murabot",
        "Your multipurpose Discord bot for music, moderation, tickets, "
        "economy, leveling and movie nights.\n\n"
        "**Select a category below to explore commands.**")
    rows = [
        ("🎵 Music", "Playback, queue, radio"),
        ("🛡️ Moderation", "Warns, mutes, bans, notes"),
        ("🔐 Security", "Anti-raid and lockdowns"),
        ("📈 Leveling", "XP and ranks"),
        ("💰 Economy", "Currency, shop, quests"),
        ("🎮 Fun", "Games and playful commands"),
        ("🎫 Tickets", "Support channels"),
        ("🎁 Giveaways", "Timed prizes"),
        ("⭐ Reputation", "Rep and leaderboards"),
        ("🎬 Murastream", "Movies, shows, anime"),
        ("⚙️ Utilities", "Info and helpers"),
    ]
    for name, desc in rows:
        e.add_field(name=name, value=desc, inline=True)
    e.add_field(name="🌐 Dashboard",
                value="[Open the web dashboard](https://muragoods.vercel.app/dashboard)",
                inline=False)
    return e


def category_embed(category_id: str, entries: list[dict], page: int) -> tuple[discord.Embed, int]:
    label = next((c[1] for c in CATEGORIES if c[0] == category_id), category_id)
    page_items, page, total = paginate(entries, page)
    e = utils.base_embed(f"{label} Commands",
                         f"Page {page + 1}/{total} — pick a command below for details."
                         if total > 1 else "Pick a command below for details.")
    if not page_items:
        e.add_field(name="No commands available",
                    value="This category is empty right now.", inline=False)
    for entry in page_items:
        e.add_field(name=entry["path"],
                    value=entry.get("description", "No description.")[:150],
                    inline=False)
    return e, total


def detail_embed(entry: dict, category_id: str) -> discord.Embed:
    e = utils.base_embed(f"`{entry['path']}`",
                         entry.get("description", "No description."))
    e.add_field(name="Usage", value=f"`{usage_line(entry)}`", inline=False)
    params = entry.get("params", [])
    if params:
        lines = []
        for param in params[:10]:
            req = "required" if param.get("required") else "optional"
            line = f"`{param.get('name')}` — {param.get('description') or req} ({req})"
            if param.get("choices"):
                line += f" [{', '.join(param['choices'][:5])}]"
            lines.append(line)
        e.add_field(name="Options", value="\n".join(lines)[:1000], inline=False)
    user_perm = _lookup(_USER_PERMS, entry["path"]) or "—"
    bot_perm = _lookup(_BOT_PERMS, entry["path"]) or "—"
    e.add_field(name="Permissions", value=f"User: {user_perm}\nBot: {bot_perm}", inline=False)
    cat_label = next((c[1] for c in CATEGORIES if c[0] == category_id), category_id)
    e.add_field(name="Category", value=f"{cat_label} — use the menu to return.", inline=False)
    return e


def search_embed(query: str, results: list[dict], page: int) -> tuple[discord.Embed, int]:
    page_items, page, total = paginate(results, page)
    e = utils.base_embed(f"🔎 Search: {query[:60]}",
                         f"Page {page + 1}/{total} — {len(results)} result(s).")
    for entry in page_items:
        e.add_field(name=entry["path"],
                    value=entry.get("description", "No description.")[:150],
                    inline=False)
    return e, total


class CategoryButton(discord.ui.Button):
    """One category tile. Buttons are the primary category navigation:
    same dispatch as selects but immune to select-specific payload issues,
    and every press re-verifies against the live registry."""

    def __init__(self, owner_id: int, category_id: str, label: str):
        self.owner_id = owner_id
        self.category_id = category_id
        emoji, _, short = label.partition(" ")
        super().__init__(style=discord.ButtonStyle.secondary,
                         label=short or label,
                         emoji=emoji or None,
                         custom_id=f"help:cat:{category_id}")

    async def callback(self, interaction: discord.Interaction):
        view: HelpView = self.view  # type: ignore[assignment]
        if not await view.check_owner(interaction):
            return
        try:
            await view.show_category(interaction, self.category_id, 0)
        except Exception:
            log.exception("Help category render failed")
            await view._send_error(interaction, "Could not open that category. Try again.")


def category_buttons(owner_id: int) -> list[CategoryButton]:
    """15 categories across rows 0-2 (5 per row, the Discord maximum)."""
    buttons: list[CategoryButton] = []
    for idx, (cid, label, _desc) in enumerate(CATEGORIES):
        buttons.append(CategoryButton(owner_id, cid, label))
    return buttons


class CommandSelect(discord.ui.Select):
    def __init__(self, owner_id: int, entries: list[dict], context: str):
        self.owner_id = owner_id
        self.context = context  # "cat:<id>:<page>" or "search:<q>:<page>"
        options = [
            discord.SelectOption(label=e["path"][:100],
                                 value=e["path"],
                                 description=e.get("description", "")[:100])
            for e in entries[:25]
        ]
        super().__init__(placeholder="Select a command for details",
                         options=options,
                         disabled=not options)

    async def callback(self, interaction: discord.Interaction):
        view: HelpView = self.view  # type: ignore[assignment]
        if not await view.check_owner(interaction):
            return
        try:
            await view.show_detail(interaction, self.values[0], self.context)
        except Exception:
            log.exception("Help detail render failed")
            await view._send_error(interaction, "Could not open that command. Try again.")


class SearchModal(discord.ui.Modal, title="Search commands"):
    query = discord.ui.TextInput(label="Which command are you looking for?",
                                 placeholder="play", max_length=60)

    def __init__(self, view: "HelpView"):
        super().__init__()
        self.help_view = view

    async def on_submit(self, interaction: discord.Interaction):
        if not await self.help_view.check_owner(interaction):
            return
        await self.help_view.show_search(interaction, str(self.query.value), 0)


class HelpView(discord.ui.View):
    def __init__(self, bot: commands.Bot, owner_id: int):
        super().__init__(timeout=VIEW_TIMEOUT)
        self.bot_ref = bot
        self.owner_id = owner_id
        self.index = build_index(bot)
        self.mode = "home"
        self.category = ""
        self.page = 0
        self.detail_path = ""
        self.return_to = ""
        self.search_query = ""
        self._rebuild(show_home=False)

    async def check_owner(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.owner_id:
            try:
                await interaction.response.send_message(
                    "This help menu belongs to another user.", ephemeral=True)
            except Exception:
                pass
            return False
        return True

    async def on_timeout(self) -> None:
        for child in self.children:
            try:
                child.disabled = True
            except Exception:
                pass
        try:
            if hasattr(self, "message") and self.message is not None:
                await self.message.edit(
                    content="This help menu has expired. Run /help again.",
                    view=self)
        except Exception:
            pass

    def _action_row(self, page: int = 0, total: int = 1, show_nav: bool = False,
                    detail: bool = False, detail_label: str = "",
                    show_home: bool = True):
        # Row 4 holds at most 5 buttons: [prev next] + search + home/return + close.
        # The Page X/Y indicator lives in the embed text (a disabled button
        # would consume a slot for zero function).
        items = []
        if detail:
            back_btn = discord.ui.Button(
                label=f"⬅️ Return{(' to ' + detail_label) if detail_label else ''}"[:80],
                style=discord.ButtonStyle.secondary,
                custom_id="help:act:return")
            back_btn.callback = self._on_return  # type: ignore[method-assign]
            items.append(back_btn)
        elif show_nav and total > 1:
            prev_btn = discord.ui.Button(emoji="⬅️", style=discord.ButtonStyle.secondary,
                                         custom_id="help:nav:prev",
                                         disabled=page <= 0)
            prev_btn.callback = self._on_prev  # type: ignore[method-assign]
            next_btn = discord.ui.Button(emoji="➡️", style=discord.ButtonStyle.secondary,
                                         custom_id="help:nav:next",
                                         disabled=page >= total - 1)
            next_btn.callback = self._on_next  # type: ignore[method-assign]
            items.extend([prev_btn, next_btn])
        search_btn = discord.ui.Button(emoji="🔎", label="Search",
                                       style=discord.ButtonStyle.primary,
                                       custom_id="help:act:search")
        search_btn.callback = self._on_search  # type: ignore[method-assign]
        home_btn = discord.ui.Button(emoji="🏠", label="Home",
                                     style=discord.ButtonStyle.secondary,
                                     custom_id="help:act:home")
        home_btn.callback = self._on_home  # type: ignore[method-assign]
        close_btn = discord.ui.Button(emoji="❌", label="Close",
                                      style=discord.ButtonStyle.danger,
                                      custom_id="help:act:close")
        close_btn.callback = self._on_close  # type: ignore[method-assign]
        items.extend([search_btn, close_btn])
        if show_home:
            items.insert(-1, home_btn)
        return items

    def _rebuild(self, extra_select=None, page: int = 0, total: int = 1,
                 show_nav: bool = False, detail: bool = False, detail_label: str = "",
                 show_home: bool = True):
        self.clear_items()
        for btn in category_buttons(self.owner_id):
            self.add_item(btn)
        if extra_select is not None:
            self.add_item(extra_select)
        for btn in self._action_row(page=page, total=total, show_nav=show_nav,
                                    detail=detail, detail_label=detail_label,
                                    show_home=show_home):
            self.add_item(btn)

    async def _send_error(self, interaction: discord.Interaction, text: str) -> None:
        """Error path that can never itself leave the interaction unacked."""
        try:
            if not interaction.response.is_done():
                await interaction.response.send_message(text, ephemeral=True)
            else:
                await interaction.followup.send(text, ephemeral=True)
        except Exception:
            pass

    async def _ack(self, interaction: discord.Interaction) -> None:
        try:
            if not interaction.response.is_done():
                await interaction.response.defer()
        except Exception:
            pass

    async def _safe_edit(self, interaction: discord.Interaction, **kwargs) -> bool:
        """Answer with a single edit roundtrip FIRST (clears the component
        spinner immediately), then fall back to defer+edit. The old
        defer-then-edit order left the spinner hanging forever whenever the
        edit leg failed after a successful defer."""
        try:
            if not interaction.response.is_done():
                await interaction.response.edit_message(**kwargs)
            else:
                await interaction.edit_original_response(**kwargs)
            return True
        except Exception:
            pass
        try:
            if not interaction.response.is_done():
                await interaction.response.defer()
        except Exception:
            pass
        try:
            await interaction.edit_original_response(**kwargs)
            return True
        except Exception:
            pass
        try:
            if hasattr(self, "message") and self.message is not None:
                await self.message.edit(**kwargs)
            return True
        except Exception:
            return False

    async def show_home(self, interaction: discord.Interaction):
        self.mode = "home"
        self._rebuild(show_home=False)
        await self._safe_edit(interaction, embed=overview_embed(), view=self)

    async def show_category(self, interaction: discord.Interaction, category_id: str, page: int):
        entries = self.index.get(category_id, [])
        embed, total = category_embed(category_id, entries, page)
        page_items, page, _ = paginate(entries, page)
        self.mode = "category"
        self.category = category_id
        self.page = page
        cmd_select = CommandSelect(self.owner_id, page_items, f"cat:{category_id}:{page}")
        self._rebuild(extra_select=cmd_select, page=page, total=total,
                      show_nav=total > 1)
        await self._safe_edit(interaction, embed=embed, view=self)

    async def show_detail(self, interaction: discord.Interaction, path: str, context: str):
        entry = None
        for entries in self.index.values():
            for cand in entries:
                if cand["path"] == path:
                    entry = cand
                    break
            if entry:
                break
        if entry is None:
            try:
                await interaction.response.send_message(
                    "That command is no longer available.", ephemeral=True)
            except Exception:
                pass
            return
        category_id = categorize(entry)
        self.mode = "detail"
        self.detail_path = path
        self.return_to = context
        cat_label = next((c[1] for c in CATEGORIES if c[0] == category_id), "")
        self._rebuild(detail=True, detail_label=cat_label)
        await self._safe_edit(interaction, embed=detail_embed(entry, category_id), view=self)

    async def show_search(self, interaction: discord.Interaction, query: str, page: int):
        results = search_index(self.index, query)
        self.mode = "search"
        self.search_query = query
        self.page = page
        if not results:
            self._rebuild()
            await self._safe_edit(
                interaction,
                embed=utils.base_embed("🔎 Search",
                                       f"No commands match `{query[:60]}`. Try another word."),
                view=self)
            return
        embed, total = search_embed(query, results, page)
        page_items, page, _ = paginate(results, page)
        self.page = page
        cmd_select = CommandSelect(self.owner_id, page_items, f"search:{query}:{page}")
        self._rebuild(extra_select=cmd_select, page=page, total=total,
                      show_nav=total > 1)
        await self._safe_edit(interaction, embed=embed, view=self)

    async def _current_entries(self) -> tuple[str, list[dict]]:
        if self.mode == "category":
            return "category", self.index.get(self.category, [])
        if self.mode == "search":
            return "search", search_index(self.index, self.search_query)
        return "", []

    async def _guarded_nav(self, interaction: discord.Interaction, work) -> None:
        """Nav buttons answer with a single edit roundtrip (via show_* and
        _safe_edit). A render failure becomes an error note, never silence."""
        if not await self.check_owner(interaction):
            return
        try:
            await work()
        except Exception:
            log.exception("Help navigation failed")
            await self._send_error(interaction, "That action failed. Try again.")

    async def _on_prev(self, interaction: discord.Interaction):
        async def work():
            kind, _ = await self._current_entries()
            page = max(0, self.page - 1)
            if kind == "category":
                await self.show_category(interaction, self.category, page)
            elif kind == "search":
                await self.show_search(interaction, self.search_query, page)
            else:
                await self.show_home(interaction)
        await self._guarded_nav(interaction, work)

    async def _on_next(self, interaction: discord.Interaction):
        async def work():
            kind, _ = await self._current_entries()
            page = self.page + 1
            if kind == "category":
                await self.show_category(interaction, self.category, page)
            elif kind == "search":
                await self.show_search(interaction, self.search_query, page)
            else:
                await self.show_home(interaction)
        await self._guarded_nav(interaction, work)

    async def _on_search(self, interaction: discord.Interaction):
        if not await self.check_owner(interaction):
            return
        try:
            await interaction.response.send_modal(SearchModal(self))
        except Exception:
            pass

    async def _on_home(self, interaction: discord.Interaction):
        async def work():
            await self.show_home(interaction)
        await self._guarded_nav(interaction, work)

    async def _on_return(self, interaction: discord.Interaction):
        async def work():
            if self.return_to.startswith("search:"):
                _, _, page = self.return_to.rpartition(":")
                try:
                    await self.show_search(interaction, self.search_query, int(page or 0))
                    return
                except Exception:
                    pass
            if self.return_to.startswith("cat:"):
                _, rest = self.return_to.split(":", 1)
                cid, _, page = rest.rpartition(":")
                try:
                    await self.show_category(interaction, cid or self.category, int(page or 0))
                    return
                except Exception:
                    pass
            await self.show_home(interaction)
        await self._guarded_nav(interaction, work)

    async def _on_close(self, interaction: discord.Interaction):
        if not await self.check_owner(interaction):
            return
        for child in self.children:
            try:
                child.disabled = True
            except Exception:
                pass
        try:
            await interaction.response.edit_message(
                content="Help closed. Run /help anytime to browse commands.",
                embed=None, view=self)
        except Exception:
            try:
                if hasattr(self, "message") and self.message is not None:
                    await self.message.edit(
                        content="Help closed. Run /help anytime to browse commands.",
                        embed=None, view=self)
            except Exception:
                pass
        self.stop()


def _failure_tag(exc: BaseException) -> str:
    """Compact Discord failure fingerprint for the user-visible note.

    Includes the HTTP status, the Discord JSON error code, and the first
    error field path (e.g. components.3) — enough to name the rejected
    part, and nothing secret (Discord error bodies never carry tokens).
    """
    status = getattr(exc, "status", "?")
    code = getattr(exc, "code", "?")
    detail = ""
    try:
        import json as _json

        text = getattr(exc, "text", "") or ""
        if text:
            body = _json.loads(text)
            errs = body.get("errors", {}) if isinstance(body, dict) else {}
            paths: list[str] = []

            def walk(node, prefix=""):
                if isinstance(node, dict):
                    for key, val in node.items():
                        if key.startswith("_"):
                            continue
                        walk(val, f"{prefix}{key}." if prefix else f"{key}.")
                        if isinstance(val, dict) and "_errors" in val:
                            paths.append(prefix + key)
                elif isinstance(node, list):
                    for idx, val in enumerate(node):
                        walk(val, f"{prefix}{idx}.")

            walk(errs)
            if paths:
                detail = ",".join(paths[:3])
    except Exception:
        pass
    tag = f"{type(exc).__name__}/{status}/{code}"
    return tag + (f"/{detail}" if detail else "")


class HelpCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="help", description="Browse Murabot commands by category.")
    @app_commands.describe(category="Jump straight to a category (optional)")
    @app_commands.choices(category=[
        app_commands.Choice(name=label, value=cid) for cid, label, _desc in CATEGORIES if cid != "overview"
    ])
    async def help_command(self, interaction: discord.Interaction, category: str = ""):
        # Canonical pattern FIRST: response.send_message registers the view
        # against the interaction for component dispatch. Only if that
        # fails (already-acked edge) fall back to defer + followup WITH
        # wait=True — without wait the followup returns no message, the
        # view binds to message None, and every select silently dies.
        if not isinstance(category, str):
            category = str(getattr(category, "value", category) or "")
        cid = category.strip().lower()
        if cid and cid not in CATEGORY_IDS:
            cid = ""
        try:
            view = HelpView(self.bot, interaction.user.id)
            if cid:
                # Component-free direct render: works even if every UI
                # control on the message were broken.
                entries = view.index.get(cid, [])
                embed, total = category_embed(cid, entries, 0)
                page_items, page, _ = paginate(entries, 0)
                view.mode = "category"
                view.category = cid
                view.page = page
                view._rebuild(
                    extra_select=CommandSelect(view.owner_id, page_items, f"cat:{cid}:{page}")
                    if page_items else None,
                    page=page, total=total, show_nav=total > 1)
                await interaction.response.send_message(embed=embed, view=view)
            else:
                await interaction.response.send_message(embed=overview_embed(), view=view)
            try:
                view.message = await interaction.original_response()
            except Exception:
                pass
            return
        except Exception as first_err:
            log.exception("Help direct send failed, trying deferred followup")
            first_name = _failure_tag(first_err)
        try:
            await interaction.response.defer()
        except Exception:
            pass
        try:
            view = HelpView(self.bot, interaction.user.id)
            if cid:
                entries = view.index.get(cid, [])
                embed, total = category_embed(cid, entries, 0)
                page_items, page, _ = paginate(entries, 0)
                view.mode = "category"
                view.category = cid
                view.page = page
                view._rebuild(
                    extra_select=CommandSelect(view.owner_id, page_items, f"cat:{cid}:{page}")
                    if page_items else None,
                    page=page, total=total, show_nav=total > 1)
                await interaction.followup.send(embed=embed, view=view, wait=True)
            else:
                await interaction.followup.send(embed=overview_embed(), view=view, wait=True)
            try:
                view.message = await interaction.original_response()
            except Exception:
                pass
        except Exception as second_err:
            log.exception("Help failed to send")
            try:
                await interaction.followup.send(
                    embed=utils.base_embed(
                        "⚠️ Help unavailable",
                        f"Could not open the browser "
                        f"(send:{first_name}, retry:{_failure_tag(second_err)}). "
                        f"Please report the parenthesized part."),
                    ephemeral=True)
            except Exception:
                pass


async def setup(bot: commands.Bot):
    await bot.add_cog(HelpCog(bot))
