"""`/work` — the single user-facing employment & earning system.

This cog owns the whole `/work` group. It used to be two parallel systems:
`/work` (a simple instant-payout shift plus activity commands) and `/jobs`
(the employment-gated shift minigame with 39 jobs, salaries and unlocks).
One feature now has one command, so the jobs commands moved here and the
`/jobs` group was removed.

  /work shift      employment-gated, plays the job's real minigame
  /work list       browse all jobs, salaries and unlock progress
  /work history    recent shifts
  /work resign     resign from a job
  /work stars      work achievements
  /work session    earning session tracker
  /work vacation   protection mode
  /work event      server events
  /work beg/tidy/postmemes/stream/adventure   free-reward activities

`/friends` hosts the friendship system plus partnerships. All rewards are
computed and paid server-side via bot/economy.py — nothing here hardcodes an
amount, and no command lets a user change economic values.
"""

import logging
import random

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import jobs as jb

# safe_int is the shared "coerce a stored value, never raise" helper. It lives
# in leveling_sys (bot/jobs.py is stdlib-only so it cannot host it).
import leveling_sys as lv

# The shift minigame UI (job browser, apply/start gate, the five games).
from cogs import jobs as shift_views

log = logging.getLogger("bot.work")


async def _cfg(guild_id: int) -> dict:
    return await eco.get_economy_config(database._db, guild_id)


class WorkCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    work = app_commands.Group(
        name="work",
        description="Employment, shifts, jobs, sessions and server events")
    friends = app_commands.Group(name="friends", description="In-game friendship system")

    # ── Jobs: browse, work, history, resign ────────────────────────
    @work.command(name="list", description="Browse all jobs, salaries and unlocks.")
    async def work_list(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is None:
            await interaction.followup.send("Work only runs inside a server.", ephemeral=True)
            return
        total = await jb.total_completed(database._db, interaction.guild.id,
                                         interaction.user.id)
        emp = await jb.get_employment(database._db, interaction.guild.id,
                                      interaction.user.id)
        lines = []
        for job_id in jb.JOB_ORDER:
            job = jb.JOBS[job_id]
            mark = "✅ " if emp == job_id else ""
            unlock = int(job["unlock"])
            if total >= unlock:
                lines.append(
                    f"{mark}{job['icon']} **{job['name']}** — "
                    f"{jb.fmt_coins(int(job['salary']))}/shift · {job['workItem']} · "
                    f"{int(job['shiftsPerDay'])}/day · {int(job['cooldownMin'])}m")
            else:
                lines.append(f"🔒 **{job['name']}** — {total}/{unlock} shifts")
        # 39 rows exceed one embed — chunk into pages of 10.
        chunks = [lines[i:i + 10] for i in range(0, len(lines), 10)]
        for i, chunk in enumerate(chunks):
            await interaction.followup.send(embed=embeds.embed(
                f"💼 Jobs ({total} shifts worked)"
                + (f" — {i + 1}/{len(chunks)}" if len(chunks) > 1 else ""),
                "\n".join(chunk)
                + ("\n\nStart one with `/work shift`." if i == len(chunks) - 1 else ""),
                embeds.GOLD), ephemeral=True)

    @work.command(name="shift", description="Start a paid work shift (plays a minigame).")
    async def work_shift(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is None:
            await interaction.followup.send("Work only runs inside a server.", ephemeral=True)
            return
        total = await jb.total_completed(database._db, interaction.guild.id,
                                         interaction.user.id)
        browser = shift_views.JobBrowser(interaction.guild.id, interaction.user.id,
                                         0, total)
        await interaction.followup.send(embed=browser.page_embed(), view=browser,
                                        ephemeral=True)
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
            view = shift_views.ApplyStartView(interaction.guild.id, interaction.user.id,
                                              job_def, emp == job_def["id"])
            emb = shift_views.employment_embed(job_def, emp)
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
                            "💼 No Job",
                            "You don't have a job yet.\n"
                            "Apply for a job first before starting a shift.",
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
                                           "Run `/work shift` to apply or start a shift.",
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
                err = ("💼 No Job\nYou don't have a job yet.\n"
                       "Apply for a job first before starting a shift — "
                       "browse with `/work list`.")
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
        views = {
            "order": shift_views.OrderShiftView,
            "reaction": shift_views.ReactionShiftView,
            "memory": shift_views.MemoryShiftView,
            "choice": shift_views.ChoiceShiftView,
            "timing": shift_views.TimingShiftView,
        }
        factory = views.get(game)
        if factory is None:
            await interaction.followup.send("Unknown minigame — try again.", ephemeral=True)
            return
        view = factory(interaction.guild.id, interaction.user.id,
                       payload["token"], payload["job"], challenge, timeout_s)
        if game == "reaction":
            await view.start(
                interaction,
                f"{payload['job']['icon']} **{payload['job']['name']} shift** — "
                f"tap the instant it turns green (you have "
                f"{int(challenge.get('windowMs', 900))}ms).")
        else:
            await view.start(interaction)

    @work.command(name="history", description="Show your recent work shifts.")
    async def work_history(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is None:
            await interaction.followup.send("Work only runs inside a server.", ephemeral=True)
            return
        rows = await jb.history(database._db, interaction.guild.id,
                                interaction.user.id, 10)
        if not rows:
            await interaction.followup.send(
                "📋 No shifts yet — clock in with `/work shift`.", ephemeral=True)
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

    @work.command(name="resign", description="Resign from a job (resets its promotion).")
    @app_commands.describe(job="Job to resign from (only jobs with progress are listed)")
    async def work_resign(self, interaction: discord.Interaction, job: str):
        await interaction.response.defer(ephemeral=True)
        if interaction.guild is None:
            await interaction.followup.send("Work only runs inside a server.", ephemeral=True)
            return
        ok, res = await jb.resign(database._db, interaction.guild.id,
                                  interaction.user.id, job)
        await interaction.followup.send(
            f"💼 {res.get('message') if ok else res.get('error')}", ephemeral=True)

    @work_resign.autocomplete("job")
    async def work_resign_ac(self, interaction: discord.Interaction,
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

    # ── stars ──
    @work.command(name="stars", description="View collected work achievements/stars.")
    async def work_stars(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        shifts = lv.safe_int(wallet.get("shiftsWorked"), 0)
        stars = min(5, shifts // 5)
        await interaction.followup.send(
            f"⭐ Shifts **{shifts}** · Stars **{'★' * stars}{'☆' * (5 - stars)}** "
            "(1 star per 5 shifts).", ephemeral=True)

    # ── shared activity helper ──
    async def _activity(self, interaction: discord.Interaction, kind: str,
                        low: int, high: int, verbs: list[str]):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            f"last_{kind}", lv.safe_int(cfg.get("activityCooldownSec"), 600, low=5, high=86400))
        if not granted:
            await interaction.followup.send("That spot is empty for now — try again later.", ephemeral=True)
            return
        if random.random() < 0.2:
            await interaction.followup.send(f"You {verbs[0]} but found nothing this time.")
            return
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id,
            random.randint(low, high), "activity", "discord")
        await eco.check_quests(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send(f"{random.choice(verbs[1:])} **+{final}** coins.")

    @work.command(name="beg", description="Beg for a few coins (short cooldown).")
    async def work_beg(self, interaction: discord.Interaction):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "lastBeg", lv.safe_int(cfg.get("begCooldownSec"), 300, low=5, high=86400))
        if not granted:
            await interaction.followup.send("Not now — begging has a short cooldown.", ephemeral=True)
            return
        beg_lo = lv.safe_int(cfg.get("begMin"), 5, low=0, high=10_000_000)
        beg_hi = lv.safe_int(cfg.get("begMax"), 100, low=beg_lo, high=10_000_000)
        amount = random.randint(beg_lo, beg_hi)
        if random.random() < 0.15:
            await interaction.followup.send(random.choice([
                "Nobody spared a coin. The streets are cold today.",
                "A pigeon judged you and flew away.",
            ]))
            return
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id, amount, "beg", "discord")
        await interaction.followup.send(f"🪙 A kind soul gave you **{final}** coins.")

    @work.command(name="tidy", description="Tidy up for a small reward.")
    async def work_tidy(self, interaction: discord.Interaction):
        await self._activity(interaction, "tidy", 10, 60,
                             ["tidied", "🧹 Sparkling clean:", "🧹 You organized the guild hall:"])

    @work.command(name="postmemes", description="Post a fictional meme for rewards.")
    async def work_postmemes(self, interaction: discord.Interaction):
        await self._activity(interaction, "postmemes", 15, 120,
                             ["posted", "📯 Your meme went semi-viral:", "📯 Fresh meme energy:"])

    @work.command(name="stream", description="Run a fictional stream session.")
    async def work_stream(self, interaction: discord.Interaction):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "last_stream", lv.safe_int(cfg.get("activityCooldownSec"), 600, low=5, high=86400))
        if not granted:
            await interaction.followup.send("You need rest before the next stream.", ephemeral=True)
            return
        viewers = random.randint(5, 200)
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id,
            viewers * 2, "activity", "discord")
        await interaction.followup.send(
            f"🎥 You streamed to **{viewers}** viewers and earned **{final}** coins.")

    @work.command(name="adventure", description="Spend a ticket on a randomized adventure.")
    async def work_adventure(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not await eco.remove_item(database._db, interaction.guild.id,
                                     interaction.user.id, "adventure_ticket", 1):
            await interaction.followup.send(
                "You need an Adventure Ticket — check `/shop view`.", ephemeral=True)
            return
        roll = random.random()
        if roll < 0.55:
            final, _ = await eco.grant_coins(
                database._db, interaction.guild.id, interaction.user.id,
                random.randint(100, 400), "activity", "discord")
            await interaction.followup.send(f"🗺️ Adventure complete! Loot: **{final}** coins.")
        elif roll < 0.8:
            item = random.choice(["bread", "gem_shard", "speed_fertilizer"])
            await eco.add_item(database._db, interaction.guild.id, interaction.user.id, item, 1)
            await interaction.followup.send(f"🗺️ Adventure complete! Found: **{eco.ITEMS[item]['name']}**.")
        else:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "gems", 1, "activity", "discord")
            await interaction.followup.send("🗺️ Legendary adventure! Earned **1 gem** 💎.")

    @work.command(name="session", description="Start or summarize your earning session.")
    @app_commands.describe(action="start or summary")
    @app_commands.choices(action=[
        app_commands.Choice(name="start", value="start"),
        app_commands.Choice(name="summary", value="summary"),
    ])
    async def work_session(self, interaction: discord.Interaction, action: str = "start"):
        await interaction.response.defer(ephemeral=True)
        if action == "summary":
            doc = await eco.session_end(database._db, interaction.guild.id, interaction.user.id)
            if not doc:
                await interaction.followup.send("No active session — start one first.", ephemeral=True)
                return
            await interaction.followup.send(embed=embeds.embed(
                "📈 Session summary",
                f"Earned **{doc.get('earned', 0)}** · Spent **{doc.get('spent', 0)}** · "
                f"Items **{doc.get('items', 0)}** · Activities **{doc.get('activities', 0)}**.",
                embeds.INFO), ephemeral=True)
            return
        await eco.session_start(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send("Session tracking started.", ephemeral=True)

    @work.command(name="vacation", description="Vacation / protection mode (freezes streaks).")
    @app_commands.describe(days="Start vacation for N days (1-14, empty = status)")
    async def work_vacation(self, interaction: discord.Interaction, days: int = 0):
        await interaction.response.defer(ephemeral=True)
        if days:
            ok, msg = await eco.vacation_set(
                database._db, interaction.guild.id, interaction.user.id, int(days))
            await interaction.followup.send(
                f"🏖️ Vacation active for **{min(max(int(days), 1), 14)}** days — "
                "daily streaks are protected while away." if ok else f"⚠️ {msg}",
                ephemeral=True)
            return
        cur = await eco.vacation_get(database._db, interaction.guild.id, interaction.user.id)
        if cur["active"]:
            await interaction.followup.send(
                f"🏖️ Vacation active until <t:{int(cur['until'].timestamp())}:R>.", ephemeral=True)
        else:
            await interaction.followup.send(
                "No vacation active — start with `/work vacation days:3` (1–14).", ephemeral=True)

    @work.command(name="event", description="Server event: status, donate, pool.")
    @app_commands.describe(action="status, donate or pool", quantity="Coins to donate",
                           gems="Gems to donate")
    @app_commands.choices(action=[
        app_commands.Choice(name="status", value="status"),
        app_commands.Choice(name="donate", value="donate"),
        app_commands.Choice(name="pool", value="pool"),
    ])
    async def work_event(self, interaction: discord.Interaction, action: str = "status",
                         quantity: int = 100, gems: int = 0):
        await interaction.response.defer()
        if action == "donate":
            ok, msg = await eco.serverevent_donate(
                database._db, interaction.guild.id, interaction.user.id,
                int(quantity or 0), int(gems or 0))
            await interaction.followup.send(
                f"🎉 Donated **{int(quantity or 0)}** (+{int(gems or 0)} gems)! {msg}"
                if ok and msg != "ok" else ("🎉 Donated!" if ok else f"⚠️ {msg}"))
            return
        state = await eco.serverevent_get(database._db, interaction.guild.id)
        if not state["open"]:
            await interaction.followup.send(
                "No active event — donate with `/work event action:donate` to start the Server Festival!")
            return
        pct = min(100, round(100 * state["pool"] / max(1, state["goal"])))
        await interaction.followup.send(embed=embeds.embed(
            f"🎉 {state.get('name', 'Server Festival')}",
            f"Pool **{state['pool']:,}** / **{state['goal']:,}** ({pct}%) · "
            f"**{state['donors']}** donors.\nContribute: `/work event action:donate`.",
            embeds.GOLD))

    # ── Friends + partnerships ──
    @friends.command(name="add", description="Send a friend request.")
    @app_commands.describe(user="Who to befriend")
    async def friends_add(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.friend_request(database._db, interaction.guild.id,
                                           interaction.user.id, user.id)
        await interaction.followup.send("💌 Request sent!" if ok else f"⚠️ {msg}", ephemeral=True)

    @friends.command(name="remove", description="Remove a friend.")
    @app_commands.describe(user="Who to remove")
    async def friends_remove(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        try:
            await database._db.economy_social.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)},
                {"$pull": {"friends": int(user.id)}})
            await database._db.economy_social.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(user.id)},
                {"$pull": {"friends": int(interaction.user.id)}})
        except Exception:
            pass
        await interaction.followup.send("Removed.", ephemeral=True)

    @friends.command(name="list", description="Show your friends.")
    async def friends_list(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        doc = await eco.social_doc(database._db, interaction.guild.id, interaction.user.id)
        friends = doc.get("friends", [])[:20]
        await interaction.followup.send(
            "Friends: " + (", ".join(f"<@{f}>" for f in friends) if friends else "none yet — `/friends add`!"),
            ephemeral=True)

    @friends.command(name="requests", description="Show pending requests.")
    async def friends_requests(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        doc = await eco.social_doc(database._db, interaction.guild.id, interaction.user.id)
        reqs = doc.get("requests", [])[:10]
        await interaction.followup.send(
            "Pending: " + (", ".join(f"<@{r}>" for r in reqs) if reqs else "none"),
            ephemeral=True)

    @friends.command(name="accept", description="Accept a friend request.")
    @app_commands.describe(user="The requester")
    async def friends_accept(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.friend_answer(database._db, interaction.guild.id,
                                          interaction.user.id, user.id, True)
        await interaction.followup.send("Friends! 🎉" if ok else f"⚠️ {msg}", ephemeral=True)

    @friends.command(name="decline", description="Decline a friend request.")
    @app_commands.describe(user="The requester")
    async def friends_decline(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.friend_answer(database._db, interaction.guild.id,
                                          interaction.user.id, user.id, False)
        await interaction.followup.send("Declined." if ok else f"⚠️ {msg}", ephemeral=True)

    @friends.command(name="marry", description="Fictional partnership: status, propose, leave.")
    @app_commands.describe(action="status, propose or leave", user="Partner for propose")
    @app_commands.choices(action=[
        app_commands.Choice(name="status", value="status"),
        app_commands.Choice(name="propose", value="propose"),
        app_commands.Choice(name="leave", value="leave"),
    ])
    async def friends_marry(self, interaction: discord.Interaction, action: str = "status",
                            user: discord.Member | None = None):
        await interaction.response.defer(ephemeral=True)
        gid, me = interaction.guild.id, interaction.user.id
        if action == "propose":
            if not user or user.id == me or user.bot:
                await interaction.followup.send("Pick another member.", ephemeral=True)
                return
            ok, msg = await eco.marry(database._db, gid, me, user.id)
            await interaction.followup.send(
                f"💍 {interaction.user.mention} ❤ {user.mention} — partnered! "
                "Shared perk: matching profile titles." if ok else msg, ephemeral=True)
            return
        if action == "leave":
            try:
                doc = await eco.social_doc(database._db, gid, me)
                partner = doc.get("partner")
                await database._db.economy_social.update_one(
                    {"guildId": int(gid), "userId": int(me)}, {"$set": {"partner": None}})
                if partner:
                    await database._db.economy_social.update_one(
                        {"guildId": int(gid), "userId": int(partner)}, {"$set": {"partner": None}})
            except Exception:
                pass
            await interaction.followup.send("Partnership ended.", ephemeral=True)
            return
        doc = await eco.social_doc(database._db, gid, me)
        partner = doc.get("partner")
        await interaction.followup.send(
            f"💍 Partnered with <@{partner}> — milestones unlock shared titles." if partner
            else "No partner — propose with `/friends marry action:propose`.", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(WorkCog(bot))
