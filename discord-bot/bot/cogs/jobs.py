"""Shift minigame VIEWS — the interactive UI behind `/work shift`.

This module holds the Discord UI for the job/shift minigames: the job
browser, the apply/start gate, and the four playable shift games (order,
reaction, memory, choice, timing). The COMMANDS themselves live in
cogs/work.py, which owns the single `/work` group — `/jobs` and `/work`
were two parallel systems for one feature, and the user-facing surface is
now just `/work`.

`/work shift` opens a job browser (39 jobs don't fit in a slash-choice
list) and starts a REAL playable minigame — never an instant payout. Every
result is validated server-side in bot/jobs.py against the stored challenge,
paid once (atomic shift consume), and recorded in work history.

The game logic, catalog and payouts live in bot/jobs.py; this file is only
the presentation layer.
"""

import asyncio
import logging
import time

import discord
from discord import app_commands

import database
import economy as eco
import embeds
import jobs as jb
import utils

log = logging.getLogger("bot.jobs")

JOBS_PER_PAGE = 10


async def _cfg(guild_id: int) -> dict:
    return await eco.get_economy_config(database._db, guild_id)


def _fail_rate(cfg: dict) -> float:
    return jb.fail_rate_for(cfg)


def _result_embed(job: dict, won: bool, reason: str, payout: int,
                  fired: bool = False) -> discord.Embed:
    if won:
        return embeds.embed(
            "🎉 Great work!",
            f"You completed your shift successfully.\n\n"
            f"**You were given:**\n- {jb.fmt_coins(payout)} for your shift",
            embeds.GOLD)
    extra = "\n\n🔥 Fired after 5 straight failures — promotion progress reset." if fired else ""
    return embeds.embed(
        "❌ Terrible work!",
        f"You lost the mini-game because {reason}.{extra}\n\n"
        f"**You were given:**\n- {jb.fmt_coins(payout)}\nfor a sub-par shift",
        embeds.ERROR)


class ShiftView(utils.SafeView):
    """Base shift view: owner-only clicks, single completion, expiry."""

    def __init__(self, guild_id: int, user_id: int, token: str,
                 job: dict, challenge: dict, timeout_s: float):
        super().__init__(timeout=timeout_s)
        self.guild_id = guild_id
        self.user_id = user_id
        self.token = token
        self.job = job
        self.challenge = challenge
        self.done = False
        self.message: discord.Message | None = None

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.user_id:
            try:
                await interaction.response.send_message(
                    "This isn't your shift — start your own with `/work shift`.",
                    ephemeral=True)
            except discord.HTTPException:
                pass
            return False
        if self.done:
            try:
                await interaction.response.send_message(
                    "This shift already ended.", ephemeral=True)
            except discord.HTTPException:
                pass
            return False
        return True

    async def _finish(self, interaction: discord.Interaction | None,
                      attempt: dict) -> None:
        """Validate + pay + show the result card. Idempotent per shift."""
        if self.done:
            return
        self.done = True
        self.stop()
        for child in self.children:
            child.disabled = True

        async def credit(amount: int):
            return await eco.grant_coins(
                database._db, self.guild_id, self.user_id, amount, "job", "discord")

        try:
            cfg = await _cfg(self.guild_id)
            ok, res = await jb.complete_shift(
                database._db, self.guild_id, self.user_id, self.token,
                attempt, credit, _fail_rate(cfg))
        except Exception:
            log.exception("Shift completion failed")
            ok, res = False, {"error": "Shift failed — try again."}
        if not ok:
            embed = embeds.embed("⏱️ Shift over", str(res.get("error") or "Try again."),
                                 embeds.WARN)
        else:
            embed = _result_embed(self.job, bool(res.get("won")),
                                  str(res.get("reason") or "the shift failed"),
                                  int(res.get("payout") or 0),
                                  bool(res.get("fired")))
        try:
            if interaction is not None and not interaction.response.is_done():
                await interaction.response.edit_message(embed=embed, view=self)
            elif self.message is not None:
                await self.message.edit(embed=embed, view=self)
            elif interaction is not None:
                await interaction.followup.send(embed=embed, ephemeral=True)
        except discord.HTTPException:
            pass

    async def on_timeout(self) -> None:
        if self.done:
            return
        self.done = True

        async def credit(amount: int):
            return await eco.grant_coins(
                database._db, self.guild_id, self.user_id, amount, "job", "discord")

        try:
            cfg = await _cfg(self.guild_id)
            await jb.complete_shift(database._db, self.guild_id, self.user_id,
                                    self.token, {}, credit, _fail_rate(cfg))
        except Exception:
            pass
        for child in self.children:
            child.disabled = True
        try:
            if self.message is not None:
                await self.message.edit(
                    content="⏱️ Shift expired — you ran out of time.", view=self)
        except discord.HTTPException:
            pass


class OrderShiftView(ShiftView):
    """Assemble the ticket order with the labeled buttons. Wrong tap fails."""

    def __init__(self, *args):
        super().__init__(*args)
        self.clicks: list[int] = []
        self._started_ms = 0
        for pos, label in enumerate(self.challenge.get("labels") or []):
            self.add_item(OrderButton(label, pos))

    def ticket_text(self) -> str:
        return " → ".join(self.challenge.get("ticket") or [])

    async def press(self, interaction: discord.Interaction, pos: int) -> None:
        await self._safe(interaction, lambda: self._press(interaction, pos))

    async def _press(self, interaction: discord.Interaction, pos: int) -> None:
        answer = self.challenge.get("answer") or []
        if pos in self.clicks:
            await interaction.response.defer()
            return
        self.clicks.append(pos)
        for child in self.children:
            if isinstance(child, OrderButton) and child.pos in self.clicks:
                child.disabled = True
        step = len(self.clicks) - 1
        if len(self.clicks) >= len(answer) or pos != answer[step]:
            await interaction.response.defer()
            await self._finish(interaction, {
                "clicks": list(self.clicks),
                "elapsedMs": int(time.time() * 1000) - self._started_ms})
        else:
            await interaction.response.edit_message(view=self)

    async def start(self, interaction: discord.Interaction) -> None:
        self._started_ms = int(time.time() * 1000)
        self.message = await interaction.followup.send(
            f"{self.job['icon']} **{self.job['name']} shift** — assemble in ticket order:\n"
            f"🎟 {' → '.join(self.challenge.get('ticket') or [])}",
            view=self, wait=True)


class OrderButton(discord.ui.Button):
    def __init__(self, label: str, pos: int):
        super().__init__(label=label[:80] or "•", style=discord.ButtonStyle.secondary)
        self.pos = pos

    async def callback(self, interaction: discord.Interaction):
        view: OrderShiftView = self.view  # type: ignore
        await view.press(interaction, self.pos)


class ReactionShiftView(ShiftView):
    """Tap the instant the light turns green. Early taps fail."""

    def __init__(self, *args):
        super().__init__(*args)
        self.green_at_ms = 0
        self._t0 = 0
        self.button = ReactionButton()
        self.add_item(self.button)

    async def start(self, interaction: discord.Interaction, text: str) -> None:
        self._t0 = int(time.time() * 1000)
        self.message = await interaction.followup.send(text, view=self, wait=True)
        delay_s = max(0.0, (int(self.challenge.get("delayMs", 2000))) / 1000.0)
        asyncio.get_running_loop().create_task(self._turn_green(delay_s))

    async def _turn_green(self, delay_s: float) -> None:
        try:
            await asyncio.sleep(delay_s)
            if self.done:
                return
            self.green_at_ms = int(time.time() * 1000)
            self.button.style = discord.ButtonStyle.success
            self.button.label = "TAP!"
            if self.message is not None:
                await self.message.edit(view=self)
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    async def tap(self, interaction: discord.Interaction) -> None:
        await self._safe(interaction, lambda: self._tap(interaction))

    async def _tap(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer()
        now_ms = int(time.time() * 1000)
        if not self.green_at_ms:
            await self._finish(interaction, {"reactedEarly": True,
                                             "elapsedMs": now_ms - self._t0})
        else:
            await self._finish(interaction, {"elapsedMs": now_ms - self.green_at_ms})


class ReactionButton(discord.ui.Button):
    def __init__(self):
        super().__init__(label="WAIT…", style=discord.ButtonStyle.danger)

    async def callback(self, interaction: discord.Interaction):
        view: ReactionShiftView = self.view  # type: ignore
        await view.tap(interaction)


class MemoryShiftView(ShiftView):
    """Memorize the lineup, then replay it with the icon buttons."""

    def __init__(self, *args):
        super().__init__(*args)
        self.picks: list[int] = []
        self._started_ms = 0
        self.icons: list[str] = list(self.challenge.get("icons") or [])
        self.pool: list[str] = list(self.challenge.get("pool") or [])
        for idx, emoji in enumerate(self.pool):
            btn = MemoryButton(emoji, idx)
            btn.disabled = True
            self.add_item(btn)

    async def start(self, interaction: discord.Interaction) -> None:
        self._started_ms = int(time.time() * 1000)
        shown = "  ".join(self.icons)
        self.message = await interaction.followup.send(
            f"{self.job['icon']} **{self.job['name']} shift** — memorize this lineup…\n\n# {shown}",
            view=self, wait=True)
        await asyncio.sleep(5)
        if self.done:
            return
        for child in self.children:
            child.disabled = False
        try:
            if self.message is not None:
                await self.message.edit(
                    content=f"{self.job['icon']} **{self.job['name']} shift** — replay the lineup "
                            f"in order ({len(self.icons)} items):",
                    view=self)
        except discord.HTTPException:
            pass

    async def pick(self, interaction: discord.Interaction, idx: int) -> None:
        await self._safe(interaction, lambda: self._pick(interaction, idx))

    async def _pick(self, interaction: discord.Interaction, idx: int) -> None:
        self.picks.append(idx)
        await interaction.response.defer()
        if len(self.picks) >= len(self.icons):
            await self._finish(interaction, {
                "clicks": list(self.picks),
                "elapsedMs": int(time.time() * 1000) - self._started_ms})


class MemoryButton(discord.ui.Button):
    def __init__(self, emoji: str, idx: int):
        super().__init__(label=" ", emoji=emoji, style=discord.ButtonStyle.secondary)
        self.idx = idx

    async def callback(self, interaction: discord.Interaction):
        view: MemoryShiftView = self.view  # type: ignore
        await view.pick(interaction, self.idx)


class ChoiceShiftView(ShiftView):
    """Answer the job question before the view times out."""

    def __init__(self, *args):
        super().__init__(*args)
        self._started_ms = 0
        for idx, opt in enumerate(self.challenge.get("options") or []):
            self.add_item(ChoiceButton(str(opt)[:80], idx))

    async def pick(self, interaction: discord.Interaction, idx: int) -> None:
        await self._safe(interaction, lambda: self._pick(interaction, idx))

    async def _pick(self, interaction: discord.Interaction, idx: int) -> None:
        await interaction.response.defer()
        await self._finish(
            interaction, {"pick": idx,
                          "elapsedMs": int(time.time() * 1000) - self._started_ms})

    async def start(self, interaction: discord.Interaction) -> None:
        self._started_ms = int(time.time() * 1000)
        question = str(self.challenge.get("question") or "Choose wisely.")
        self.message = await interaction.followup.send(
            f"{self.job['icon']} **{self.job['name']} shift**\n\n**{question}**",
            view=self, wait=True)


class ChoiceButton(discord.ui.Button):
    def __init__(self, opt: str, idx: int):
        super().__init__(label=opt, style=discord.ButtonStyle.secondary)
        self.idx = idx

    async def callback(self, interaction: discord.Interaction):
        view: ChoiceShiftView = self.view  # type: ignore
        await view.pick(interaction, self.idx)


class TimingShiftView(ShiftView):
    """Stop the sweeping beacon inside the green zone."""

    def __init__(self, *args):
        super().__init__(*args)
        self.sweep_start_ms = 0
        self._task: asyncio.Task | None = None
        self.add_item(TimingStopButton())

    def _bar(self, pos_ms: int) -> str:
        zone = self.challenge.get("zone") or [0, 0]
        period = int(self.challenge.get("periodMs", 2000) or 2000)
        width = 20
        lo = int(zone[0] / period * width)
        hi = int(zone[1] / period * width)
        cur = int((pos_ms % period) / period * width)
        cells = []
        for i in range(width):
            if i == cur:
                cells.append("🟡")
            elif lo <= i <= hi:
                cells.append("🟩")
            else:
                cells.append("⬛")
        return "".join(cells)

    async def start(self, interaction: discord.Interaction) -> None:
        self.sweep_start_ms = int(time.time() * 1000)
        self.message = await interaction.followup.send(
            f"{self.job['icon']} **{self.job['name']} shift** — stop inside the green zone!\n"
            f"{self._bar(0)}",
            view=self, wait=True)
        self._task = asyncio.get_running_loop().create_task(self._sweep())

    async def _sweep(self) -> None:
        try:
            # 4 edits/sec stays well under Discord's edit rate limits.
            while not self.done:
                await asyncio.sleep(0.25)
                if self.done or self.message is None:
                    continue
                pos = int(time.time() * 1000) - self.sweep_start_ms
                try:
                    await self.message.edit(
                        content=f"{self.job['icon']} **{self.job['name']} shift** — stop inside the green zone!\n"
                                f"{self._bar(pos)}",
                        view=self)
                except discord.HTTPException:
                    break
        except asyncio.CancelledError:
            pass

    async def stop(self, interaction: discord.Interaction) -> None:
        await self._safe(interaction, lambda: self._stop(interaction))

    async def _stop(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer()
        if self._task is not None:
            self._task.cancel()
        await self._finish(interaction, {
            "elapsedMs": int(time.time() * 1000) - self.sweep_start_ms})


class TimingStopButton(discord.ui.Button):
    def __init__(self):
        super().__init__(label="⏹ STOP", style=discord.ButtonStyle.danger)

    async def callback(self, interaction: discord.Interaction):
        view: TimingShiftView = self.view  # type: ignore
        await view.stop(interaction)


class JobBrowser(utils.SafeView):
    """39 jobs don't fit in slash choices (25 max) — browse pages of 10.

    Layout is explicit because discord.py caps an action row at 5 components.
    The job buttons are auto-placed by add_item() into rows 0 and 1 (five
    each), so the nav buttons cannot share row 1 — forcing them there raised
    `ValueError: item would not fit at row 1 (6 > 5 width)` in the
    constructor, before any button existed. That made /work shift fail for
    every member, every time, regardless of stored data.
    """

    #: Discord allows at most 5 components per action row and 5 action rows.
    PER_ROW = 5
    MAX_ROWS = 5

    def __init__(self, guild_id: int, user_id: int, page: int, total: int):
        super().__init__(timeout=120)
        self.guild_id = guild_id
        self.user_id = user_id
        self.page = page
        self.total = total
        self.chosen: str | None = None
        start = page * JOBS_PER_PAGE
        page_jobs = jb.JOB_ORDER[start:start + JOBS_PER_PAGE]
        for index, job_id in enumerate(page_jobs):
            job = jb.JOBS[job_id]
            locked = total < int(job["unlock"])
            self.add_item(JobButton(job, locked, row=index // self.PER_ROW))
        # Nav goes on the first row the job buttons did not fill.
        nav_row = -(-len(page_jobs) // self.PER_ROW)
        if nav_row >= self.MAX_ROWS:
            nav_row = self.MAX_ROWS - 1
        if page > 0:
            self.add_item(NavButton("◀ Prev", page - 1, nav_row))
        if start + JOBS_PER_PAGE < len(jb.JOB_ORDER):
            self.add_item(NavButton("Next ▶", page + 1, nav_row))

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.user_id:
            try:
                await interaction.response.send_message(
                    "Browse your own jobs with `/work shift`.", ephemeral=True)
            except discord.HTTPException:
                pass
            return False
        return True

    def page_embed(self) -> discord.Embed:
        lines = []
        start = self.page * JOBS_PER_PAGE
        for job_id in jb.JOB_ORDER[start:start + JOBS_PER_PAGE]:
            job = jb.JOBS[job_id]
            if self.total >= int(job["unlock"]):
                lines.append(
                    f"{job['icon']} **{job['name']}** — {jb.fmt_coins(int(job['salary']))}/shift\n"
                    f"{job['workItem']} · {int(job['shiftsPerDay'])}/day · {int(job['cooldownMin'])}m cooldown")
            else:
                lines.append(
                    f"🔒 **{job['name']}** — requires {int(job['unlock'])} shifts "
                    f"({self.total}/{int(job['unlock'])})")
        return embeds.embed(
            f"💼 Choose a job (page {self.page + 1}/{(len(jb.JOB_ORDER) + JOBS_PER_PAGE - 1) // JOBS_PER_PAGE})",
            "\n\n".join(lines), embeds.GOLD)


class JobButton(discord.ui.Button):
    def __init__(self, job: dict, locked: bool, row: int = 0):
        super().__init__(label=f"{job['icon']} {job['name']}"[:80],
                         style=discord.ButtonStyle.secondary,
                         disabled=locked, row=row)
        self.job_id = job["id"]

    async def callback(self, interaction: discord.Interaction):
        view: JobBrowser = self.view  # type: ignore
        view.chosen = self.job_id
        view.stop()
        try:
            await interaction.response.defer()
        except discord.HTTPException:
            pass


class NavButton(discord.ui.Button):
    def __init__(self, label: str, page: int, row: int):
        super().__init__(label=label, style=discord.ButtonStyle.primary, row=row)
        self.page = page

    async def callback(self, interaction: discord.Interaction):
        view: JobBrowser = self.view  # type: ignore
        try:
            await interaction.response.defer()
        except discord.HTTPException:
            pass
        nxt = JobBrowser(view.guild_id, view.user_id, self.page, view.total)
        try:
            await interaction.edit_original_response(embed=nxt.page_embed(), view=nxt)
        except discord.HTTPException:
            pass


class ApplyStartView(utils.SafeView):
    """Employment gate shown before any shift: the user must Apply (when
    not yet employed in the chosen job) before Start Shift unlocks."""

    def __init__(self, guild_id: int, user_id: int, job: dict, employed: bool):
        super().__init__(timeout=90)
        self.guild_id = guild_id
        self.user_id = user_id
        self.job = job
        self.employed = employed
        self.action: str | None = None
        if not employed:
            self.add_item(ApplyButton(job))
        self.add_item(StartShiftButton(enabled=employed))
        self.add_item(CancelButton())

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.user_id:
            try:
                await interaction.response.send_message(
                    "This is your application — browse your own with `/work shift`.",
                    ephemeral=True)
            except discord.HTTPException:
                pass
            return False
        return True


def employment_embed(job: dict, employed_job: str | None) -> discord.Embed:
    if employed_job == job["id"]:
        status = "✅ **Employed** — you're cleared to start this shift."
    elif employed_job:
        name = jb.JOBS.get(str(employed_job), {}).get("name", employed_job)
        status = (f"🔄 You currently work as **{name}** — applying switches "
                  f"your job (old progression is kept).")
    else:
        status = ("💼 **Unemployed** — you must apply for this job before "
                  "you can start a shift and earn salary.")
    lines = [
        status, "",
        f"Salary: {jb.fmt_coins(int(job['salary']))} / shift",
        f"Work item: {job['workItem']} · {int(job['shiftsPerDay'])}/day · "
        f"{int(job['cooldownMin'])}m cooldown",
        (f"Unlock: {int(job['unlock'])} completed shifts"
         if int(job["unlock"]) else "Unlock: open"),
    ]
    return embeds.embed(f"{job['icon']} {job['name']} — job application",
                        "\n".join(lines), embeds.GOLD)


class ApplyButton(discord.ui.Button):
    def __init__(self, job: dict):
        super().__init__(label=f"Apply for {job['name']}"[:80],
                         style=discord.ButtonStyle.success, emoji="📝")
        self.job = job

    async def callback(self, interaction: discord.Interaction):
        view: ApplyStartView = self.view  # type: ignore
        view.action = "apply"
        view.stop()
        try:
            await interaction.response.defer()
        except discord.HTTPException:
            pass


class StartShiftButton(discord.ui.Button):
    def __init__(self, enabled: bool):
        super().__init__(label="Start Shift", style=discord.ButtonStyle.primary,
                         emoji="▶", disabled=not enabled)

    async def callback(self, interaction: discord.Interaction):
        view: ApplyStartView = self.view  # type: ignore
        view.action = "start"
        view.stop()
        try:
            await interaction.response.defer()
        except discord.HTTPException:
            pass


class CancelButton(discord.ui.Button):
    def __init__(self):
        super().__init__(label="Cancel", style=discord.ButtonStyle.secondary)

    async def callback(self, interaction: discord.Interaction):
        view: ApplyStartView = self.view  # type: ignore
        view.action = "cancel"
        view.stop()
        try:
            await interaction.response.defer()
        except discord.HTTPException:
            pass
