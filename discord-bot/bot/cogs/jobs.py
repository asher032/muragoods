"""Jobs — clock in, play a shift minigame, earn coins.

`/jobs list` shows the five jobs. `/jobs shift` opens a REAL playable
minigame (buttons, timeouts, phases — never an instant payout). Every result
is validated server-side in bot/jobs.py against the stored challenge, paid
once (atomic shift consume), and recorded in work history. `/jobs history`
shows past shifts.
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


async def _cfg(guild_id: int) -> dict:
    return await eco.get_economy_config(database._db, guild_id)


def _job_cooldown(cfg: dict) -> int:
    try:
        return max(60, min(86400, int(cfg.get("jobCooldownSec", 3600))))
    except (TypeError, ValueError):
        return 3600


def _result_embed(job: dict, won: bool, reason: str, payout: int) -> discord.Embed:
    if won:
        return embeds.embed(
            "🎉 Great work!",
            f"You completed your shift as a {job['name']} successfully.\n\n"
            f"**You were given:**\n- {jb.fmt_coins(payout)} for your shift",
            embeds.GOLD)
    return embeds.embed(
        "❌ Terrible work!",
        f"You lost the mini-game because {reason}.\n\n"
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
            ok, res = await jb.complete_shift(
                database._db, self.guild_id, self.user_id, self.token, attempt, credit)
        except Exception:
            log.exception("Shift completion failed")
            ok, res = False, {"error": "Shift failed — try again."}
        if not ok:
            embed = embeds.embed("⏱️ Shift over", str(res.get("error") or "Try again."),
                                 embeds.WARN)
        else:
            embed = _result_embed(self.job, bool(res.get("won")),
                                  str(res.get("reason") or "the shift failed"),
                                  int(res.get("payout") or 0))
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
        # No interaction to answer with — the atomic consume + deadline check
        # records the timeout loss server-side; just close the board.
        if self.done:
            return
        self.done = True

        async def credit(amount: int):
            return await eco.grant_coins(
                database._db, self.guild_id, self.user_id, amount, "job", "discord")

        try:
            await jb.complete_shift(database._db, self.guild_id, self.user_id,
                                    self.token, {}, credit)
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
    """Tap the numbered tickets in ascending order. Wrong tap fails."""

    def __init__(self, *args):
        super().__init__(*args)
        self.clicks: list[int] = []
        seq = self.challenge.get("sequence") or []
        for n in seq:
            self.add_item(OrderButton(n))

    async def press(self, interaction: discord.Interaction, n: int) -> None:
        await self._safe(interaction, lambda: self._press(interaction, n))

    async def _press(self, interaction: discord.Interaction, n: int) -> None:
        expected = sorted(self.challenge.get("sequence") or [])
        if n in self.clicks:
            await interaction.response.defer()
            return
        self.clicks.append(n)
        for child in self.children:
            if isinstance(child, OrderButton) and child.n in self.clicks:
                child.disabled = True
        if len(self.clicks) >= len(expected) or n != expected[len(self.clicks) - 1]:
            await interaction.response.defer()
            await self._finish(interaction, {
                "clicks": list(self.clicks),
                "elapsedMs": int(time.time() * 1000) - self._started_ms})
        else:
            await interaction.response.edit_message(view=self)

    _started_ms = 0

    async def start(self, interaction: discord.Interaction, text: str) -> None:
        self._started_ms = int(time.time() * 1000)
        # wait=True returns the real followup message (original_response
        # would point at the deferred placeholder instead).
        self.message = await interaction.followup.send(text, view=self, wait=True)


class OrderButton(discord.ui.Button):
    def __init__(self, n: int):
        super().__init__(label=str(n), style=discord.ButtonStyle.secondary)
        self.n = n

    async def callback(self, interaction: discord.Interaction):
        view: OrderShiftView = self.view  # type: ignore
        await view.press(interaction, self.n)


class ReactionShiftView(ShiftView):
    """Tap the instant the light turns green. Early taps fail."""

    def __init__(self, *args):
        super().__init__(*args)
        self.green_at_ms = 0
        self.button = ReactionButton()
        self.add_item(self.button)

    async def start(self, interaction: discord.Interaction, text: str) -> None:
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

    _t0 = 0

    async def arm(self) -> None:
        self._t0 = int(time.time() * 1000)


class ReactionButton(discord.ui.Button):
    def __init__(self):
        super().__init__(label="WAIT…", style=discord.ButtonStyle.danger)

    async def callback(self, interaction: discord.Interaction):
        view: ReactionShiftView = self.view  # type: ignore
        await view.tap(interaction)


class MemoryShiftView(ShiftView):
    """Memorize the order, then remake it with the drink buttons."""

    def __init__(self, *args):
        super().__init__(*args)
        self.picks: list[int] = []
        self.icons: list[str] = list(self.challenge.get("icons") or [])
        for idx, emoji in enumerate(jb.MEMORY_ICONS):
            self.add_item(MemoryButton(emoji, idx))
        for child in self.children:
            child.disabled = True

    async def start(self, interaction: discord.Interaction) -> None:
        shown = "  ".join(self.icons)
        self.message = await interaction.followup.send(
            f"{self.job['icon']} **{self.job['name']} shift** — memorize this order…\n\n# {shown}",
            view=self, wait=True)
        await asyncio.sleep(5)
        if self.done:
            return
        for child in self.children:
            child.disabled = False
        try:
            if self.message is not None:
                await self.message.edit(
                    content=f"{self.job['icon']} **{self.job['name']} shift** — remake the order "
                            f"({len(self.icons)} drinks, in order):",
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

    _started_ms = 0

    async def arm(self) -> None:
        self._started_ms = int(time.time() * 1000)


class MemoryButton(discord.ui.Button):
    def __init__(self, emoji: str, idx: int):
        super().__init__(label=" ", emoji=emoji, style=discord.ButtonStyle.secondary)
        self.idx = idx

    async def callback(self, interaction: discord.Interaction):
        view: MemoryShiftView = self.view  # type: ignore
        await view.pick(interaction, self.idx)


class ChoiceShiftView(ShiftView):
    """Ship the correct build before the view times out."""

    def __init__(self, *args):
        super().__init__(*args)
        for idx, opt in enumerate(self.challenge.get("options") or []):
            self.add_item(ChoiceButton(opt, idx))

    async def pick(self, interaction: discord.Interaction, idx: int) -> None:
        await self._safe(interaction, lambda: self._pick(interaction, idx))

    async def _pick(self, interaction: discord.Interaction, idx: int) -> None:
        await interaction.response.defer()
        await self._finish(
            interaction, {"pick": idx,
                          "elapsedMs": int(time.time() * 1000) - self._started_ms})

    _started_ms = 0

    async def start(self, interaction: discord.Interaction, text: str) -> None:
        self._started_ms = int(time.time() * 1000)
        self.message = await interaction.followup.send(text, view=self, wait=True)


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
        stop = TimingStopButton()
        self.add_item(stop)

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


class JobsCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    jobs = app_commands.Group(name="jobs", description="Clock in for a paid shift minigame")

    @jobs.command(name="list", description="Browse available jobs and payouts.")
    async def jobs_list(self, interaction: discord.Interaction):
        lines = []
        for job_id in jb.JOB_ORDER:
            job = jb.JOBS[job_id]
            lines.append(
                f"{job['icon']} **{job['name']}** ({job['difficulty']})\n"
                f"{job['desc']}\n"
                f"Pay: {jb.fmt_coins(job['payMin'])}–{jb.fmt_coins(job['payMax']).replace('⏣ ', '')}")
        await interaction.response.send_message(embed=embeds.embed(
            "💼 Jobs — complete the shift minigame to earn ⏣",
            "\n\n".join(lines) + "\n\nStart one with `/jobs shift`.",
            embeds.GOLD), ephemeral=True)

    @jobs.command(name="shift", description="Start a paid work shift (plays a minigame).")
    @app_commands.describe(job="Which job to work")
    @app_commands.choices(job=[
        app_commands.Choice(name="🍔 Fast Food Worker", value="fastfood"),
        app_commands.Choice(name="📦 Warehouse Worker", value="warehouse"),
        app_commands.Choice(name="☕ Café Worker", value="cafe"),
        app_commands.Choice(name="💻 Computer Technician", value="technician"),
        app_commands.Choice(name="🎮 Game Tester", value="gametester"),
    ])
    async def jobs_shift(self, interaction: discord.Interaction, job: str):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is None:
            await interaction.followup.send("Jobs only run inside a server.", ephemeral=True)
            return
        cfg = await _cfg(interaction.guild.id)
        ok, payload = await jb.start_shift(
            database._db, interaction.guild.id, interaction.user.id,
            job, _job_cooldown(cfg))
        if not ok:
            err = str(payload.get("error") or "Try again.")
            if err == "cooldown":
                err = (f"You can work again in "
                       f"{jb.fmt_duration(int(payload.get('remaining', 0)))}.")
            await interaction.followup.send(f"💼 {err}", ephemeral=True)
            return
        challenge = payload["challenge"]
        game = payload["job"]["game"]
        timeout_s = float(int(payload["job"].get("timeSec", 20)) + 8)
        view: ShiftView
        if game == "order":
            view = OrderShiftView(interaction.guild.id, interaction.user.id,
                                  payload["token"], payload["job"], challenge, timeout_s)
            shown = "  ".join(f"**{n}**" for n in (challenge.get("sequence") or []))
            await view.start(
                interaction,
                f"{payload['job']['icon']} **{payload['job']['name']} shift** — "
                f"tap the tickets in order: {shown}")
        elif game == "reaction":
            view = ReactionShiftView(interaction.guild.id, interaction.user.id,
                                     payload["token"], payload["job"], challenge, timeout_s)
            await view.arm()
            await view.start(
                interaction,
                f"{payload['job']['icon']} **{payload['job']['name']} shift** — "
                f"tap the instant it turns green (you have "
                f"{int(challenge.get('windowMs', 900))}ms).")
        elif game == "memory":
            view = MemoryShiftView(interaction.guild.id, interaction.user.id,
                                   payload["token"], payload["job"], challenge, timeout_s)
            await view.arm()
            await view.start(interaction)
        elif game == "choice":
            view = ChoiceShiftView(interaction.guild.id, interaction.user.id,
                                   payload["token"], payload["job"], challenge, timeout_s)
            await view.start(
                interaction,
                f"{payload['job']['icon']} **{payload['job']['name']} shift** — "
                f"ship the correct build!")
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
            when = r.get("consumedAt")
            stamp = when.strftime("%m-%d %H:%M") if hasattr(when, "strftime") else "?"
            lines.append(
                f"{job.get('icon', '💼')} {job.get('name', r.get('jobId'))} "
                f"{mark} +{jb.fmt_coins(int(r.get('payout') or 0))} · {stamp}")
        await interaction.followup.send(embed=embeds.embed(
            "📋 Work History", "\n".join(lines), embeds.INFO), ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(JobsCog(bot))
