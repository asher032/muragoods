"""Jobs — clock in, play a shift minigame, earn coins.

`/jobs list` browses all 39 jobs with salaries, work items, limits and
unlock progress. `/jobs shift` opens a job browser (39 jobs don't fit in a
slash-choice list) and starts a REAL playable minigame — never an instant
payout. Every result is validated server-side in bot/jobs.py against the
stored challenge, paid once (atomic shift consume), and recorded in work
history. `/jobs history` and `/jobs resign` round out progression.
"""

import asyncio
import logging
import time

import discord
from discord import app_commands
from discord.ext import commands

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
                    "This isn't your shift — start your own with `/jobs shift`.",
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
    """39 jobs don't fit in slash choices (25 max) — browse pages of 10."""

    def __init__(self, guild_id: int, user_id: int, page: int, total: int):
        super().__init__(timeout=120)
        self.guild_id = guild_id
        self.user_id = user_id
        self.page = page
        self.total = total
        self.chosen: str | None = None
        start = page * JOBS_PER_PAGE
        for job_id in jb.JOB_ORDER[start:start + JOBS_PER_PAGE]:
            job = jb.JOBS[job_id]
            locked = total < int(job["unlock"])
            self.add_item(JobButton(job, locked))
        nav_row = 1 if len(self.children) > 5 else 0
        if page > 0:
            self.add_item(NavButton("◀ Prev", page - 1, nav_row))
        if start + JOBS_PER_PAGE < len(jb.JOB_ORDER):
            self.add_item(NavButton("Next ▶", page + 1, nav_row))

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.user_id:
            try:
                await interaction.response.send_message(
                    "Browse your own jobs with `/jobs shift`.", ephemeral=True)
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
    def __init__(self, job: dict, locked: bool):
        super().__init__(label=f"{job['icon']} {job['name']}"[:80],
                         style=discord.ButtonStyle.secondary,
                         disabled=locked)
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
                    "This is your application — browse your own with `/jobs shift`.",
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


class JobsCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    jobs = app_commands.Group(name="jobs", description="Clock in for a paid shift minigame")

    @jobs.command(name="list", description="Browse all jobs, salaries and unlocks.")
    async def jobs_list(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is None:
            await interaction.followup.send("Jobs only run inside a server.", ephemeral=True)
            return
        total = await jb.total_completed(database._db, interaction.guild.id, interaction.user.id)
        emp = await jb.get_employment(database._db, interaction.guild.id, interaction.user.id)
        lines = []
        for job_id in jb.JOB_ORDER:
            job = jb.JOBS[job_id]
            mark = "✅ " if emp == job_id else ""
            if total >= int(job["unlock"]):
                lines.append(
                    f"{mark}{job['icon']} **{job['name']}** — {jb.fmt_coins(int(job['salary']))}/shift · "
                    f"{job['workItem']} · {int(job['shiftsPerDay'])}/day · {int(job['cooldownMin'])}m")
            else:
                lines.append(f"🔒 **{job['name']}** — {total}/{int(job['unlock'])} shifts")
        # 39 rows exceed one embed — chunk into pages of 10.
        chunks = [lines[i:i + 10] for i in range(0, len(lines), 10)]
        for i, chunk in enumerate(chunks):
            await interaction.followup.send(embed=embeds.embed(
                f"💼 Jobs ({total} shifts worked)" + (f" — {i + 1}/{len(chunks)}" if len(chunks) > 1 else ""),
                "\n".join(chunk) + ("\n\nStart one with `/jobs shift`." if i == len(chunks) - 1 else ""),
                embeds.GOLD), ephemeral=True)

    @jobs.command(name="shift", description="Start a paid work shift (plays a minigame).")
    async def jobs_shift(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is None:
            await interaction.followup.send("Jobs only run inside a server.", ephemeral=True)
            return
        total = await jb.total_completed(database._db, interaction.guild.id, interaction.user.id)
        browser = JobBrowser(interaction.guild.id, interaction.user.id, 0, total)
        await interaction.followup.send(embed=browser.page_embed(), view=browser, ephemeral=True)
        await browser.wait()
        if not browser.chosen:
            return
        job_def = jb.JOBS.get(browser.chosen)
        if not job_def:
            return
        cfg = await _cfg(interaction.guild.id)
        overrides = {}
        try:
            raw = cfg.get("jobCooldownOverrides") or {}
            if isinstance(raw, dict):
                overrides = {str(k): int(v) for k, v in raw.items()}
        except (TypeError, ValueError):
            pass
        disabled = set()
        try:
            raw_d = cfg.get("disabledJobs") or []
            if isinstance(raw_d, list):
                disabled = {str(x) for x in raw_d}
        except (TypeError, ValueError):
            pass

        # ── Employment gate: apply BEFORE any mini-game can launch ────
        emp = await jb.get_employment(database._db, interaction.guild.id,
                                      interaction.user.id)
        gate_msg: discord.Message | None = None
        while True:
            view = ApplyStartView(interaction.guild.id, interaction.user.id,
                                  job_def, emp == job_def["id"])
            emb = employment_embed(job_def, emp)
            if gate_msg is None:
                gate_msg = await interaction.followup.send(
                    embed=emb, view=view, ephemeral=True, wait=True)
            else:
                await gate_msg.edit(embed=emb, view=view)
            await view.wait()
            if view.action == "apply":
                ok, res = await jb.apply_for_job(
                    database._db, interaction.guild.id, interaction.user.id,
                    job_def["id"], disabled)
                if not ok:
                    err = str(res.get("error") or "Could not apply.")
                    if err == "locked":
                        err = (f"🔒 Locked — requires {res.get('required')} "
                               f"completed shifts ({res.get('progress')} so far).")
                    await gate_msg.edit(
                        embed=embeds.embed("❌ Application refused", err,
                                           embeds.ERROR), view=None)
                    return
                emp = job_def["id"]
                continue
            if view.action == "start":
                if emp != job_def["id"]:
                    # Start stays disabled unless employed — belt and braces.
                    await gate_msg.edit(
                        embed=embeds.embed(
                            "❌ You don't have a job!",
                            "> Apply for a job first before you can start a shift.",
                            embeds.ERROR), view=None)
                    return
                try:
                    await gate_msg.delete()
                except discord.HTTPException:
                    pass
                break
            # Cancel or 90s timeout — take the dead buttons off the message.
            try:
                if view.action is None:
                    await gate_msg.edit(
                        embed=embeds.embed("⏱️ Timed out",
                                           "Run `/jobs shift` to apply or start a shift.",
                                           embeds.WARN),
                        view=None)
                else:
                    await gate_msg.delete()
            except discord.HTTPException:
                pass
            return

        ok, payload = await jb.start_shift(
            database._db, interaction.guild.id, interaction.user.id,
            browser.chosen, overrides, disabled)
        if not ok:
            err = str(payload.get("error") or "Try again.")
            if err == "cooldown":
                err = (f"You can work again in "
                       f"{jb.fmt_duration(int(payload.get('remaining', 0)))}.")
            elif err == "locked":
                err = (f"🔒 Locked — requires {payload.get('required')} completed shifts "
                       f"({payload.get('progress')} so far).")
            elif err == "daily":
                err = "✓ Daily shifts complete — come back tomorrow."
            elif err == "no_job":
                err = ("You don't have a job! Apply for a job first before "
                       "you can start a shift.")
            elif err == "wrong_job":
                active = str(payload.get("activeJobId") or "")
                active_name = jb.JOBS.get(active, {}).get("name", active)
                chosen_name = jb.JOBS.get(str(browser.chosen), {}).get(
                    "name", browser.chosen)
                err = (f"You work as {active_name} — apply for {chosen_name} "
                       "to work that shift.")
            await interaction.followup.send(f"💼 {err}", ephemeral=True)
            return
        challenge = payload["challenge"]
        game = payload["job"]["game"]
        timeout_s = 48.0
        view: ShiftView
        if game == "order":
            view = OrderShiftView(interaction.guild.id, interaction.user.id,
                                  payload["token"], payload["job"], challenge, timeout_s)
            await view.start(interaction)
        elif game == "reaction":
            view = ReactionShiftView(interaction.guild.id, interaction.user.id,
                                     payload["token"], payload["job"], challenge, timeout_s)
            await view.start(
                interaction,
                f"{payload['job']['icon']} **{payload['job']['name']} shift** — "
                f"tap the instant it turns green (you have "
                f"{int(challenge.get('windowMs', 900))}ms).")
        elif game == "memory":
            view = MemoryShiftView(interaction.guild.id, interaction.user.id,
                                   payload["token"], payload["job"], challenge, timeout_s)
            await view.start(interaction)
        elif game == "choice":
            view = ChoiceShiftView(interaction.guild.id, interaction.user.id,
                                   payload["token"], payload["job"], challenge, timeout_s)
            await view.start(interaction)
        elif game == "timing":
            view = TimingShiftView(interaction.guild.id, interaction.user.id,
                                   payload["token"], payload["job"], challenge, timeout_s)
            await view.start(interaction)
        else:
            await interaction.followup.send("Unknown minigame — try again.", ephemeral=True)

    @jobs.command(name="history", description="Show your recent work shifts.")
    async def jobs_history(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is None:
            await interaction.followup.send("Jobs only run inside a server.", ephemeral=True)
            return
        rows = await jb.history(database._db, interaction.guild.id,
                                interaction.user.id, 10)
        if not rows:
            await interaction.followup.send(
                "📋 No shifts yet — clock in with `/jobs shift`.", ephemeral=True)
            return
        lines = []
        for r in rows:
            job = jb.JOBS.get(r.get("jobId") or "", {})
            mark = "✓" if r.get("won") else "✕"
            result = "Successful shift" if r.get("won") else "Sub-par shift"
            when = r.get("consumedAt")
            stamp = when.strftime("%m-%d %H:%M") if hasattr(when, "strftime") else "?"
            reason = "" if r.get("won") else f" — {r.get('reason') or ''}"
            lines.append(
                f"{mark} {job.get('icon', '💼')} **{job.get('name', r.get('jobId'))}**\n"
                f"+ {jb.fmt_coins(int(r.get('payout') or 0))} · {result} · "
                f"{r.get('game', '')} mini-game · {stamp}{reason}")
        await interaction.followup.send(embed=embeds.embed(
            "📋 Work History", "\n\n".join(lines), embeds.INFO), ephemeral=True)

    @jobs.command(name="resign", description="Resign from a job (resets its promotion).")
    @app_commands.describe(job="Job to resign from (only jobs with progress are listed)")
    async def jobs_resign(self, interaction: discord.Interaction, job: str):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is None:
            await interaction.followup.send("Jobs only run inside a server.", ephemeral=True)
            return
        ok, res = await jb.resign(database._db, interaction.guild.id,
                                  interaction.user.id, job)
        await interaction.followup.send(
            f"💼 {res.get('message') if ok else res.get('error')}", ephemeral=True)

    @jobs_resign.autocomplete("job")
    async def jobs_resign_ac(self, interaction: discord.Interaction,
                             current: str) -> list[app_commands.Choice[str]]:
        try:
            if interaction.guild is None:
                return []
            coll = database._db.job_progress
            cur = coll.find({"guildId": int(interaction.guild.id),
                             "userId": int(interaction.user.id),
                             "successes": {"$gt": 0}}).sort("successes", -1).limit(25)
            rows = await cur.to_list(25)
            # The ACTIVE job must always be resignable, even at 0 wins
            # (fresh application) — it holds the employment slot.
            emp = await jb.get_employment(database._db, interaction.guild.id,
                                          interaction.user.id)
            if emp and not any(r.get("jobId") == emp for r in rows):
                rows.insert(0, {"jobId": emp, "successes": 0})
            out = []
            for r in rows:
                job = jb.JOBS.get(r.get("jobId") or "")
                if not job:
                    continue
                if current.lower() not in job["name"].lower():
                    continue
                out.append(app_commands.Choice(
                    name=f"{job['icon']} {job['name']}"[:100], value=job["id"]))
            return out
        except Exception:
            return []


async def setup(bot: commands.Bot):
    await bot.add_cog(JobsCog(bot))
