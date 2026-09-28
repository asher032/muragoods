"""`/economy` group — wallet, rewards, activities, risk, lottery, social.

All state lives in bot/economy.py against Mongo; every mutation is atomic
(guarded updates + unique transaction rows), so concurrent users, restarts
and double-clicks cannot duplicate currency. Group subcommands cost no
top-level slash budget.
"""

import logging
import random

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import utils

log = logging.getLogger("bot.economy")


def _cur(sym: str, amount: int, cfg: dict) -> str:
    name = str(cfg.get("currencyName", "coins"))
    return f"{sym} **{amount:,}** {name}"


async def _cfg(guild_id: int) -> dict:
    return await eco.get_economy_config(database._db, guild_id)


class EconomyGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    eco = app_commands.Group(name="economy", description="Coins, rewards, activities and social")

    async def _ack_ok(self, interaction: discord.Interaction, title: str, text: str):
        await interaction.followup.send(embed=embeds.ok(title, text))

    # ── Wallet ──
    @eco.command(name="deposit", description="Move coins from pocket to bank.")
    @app_commands.describe(amount="How many coins")
    async def deposit(self, interaction: discord.Interaction, amount: int):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.bank_move(
            database._db, interaction.guild.id, interaction.user.id, int(amount or 0), "deposit")
        await interaction.followup.send(
            embed=embeds.ok("🏦 Deposited", f"**{amount:,}** coins secured.")
            if ok else embeds.embed("⚠️ Deposit failed", msg, embeds.WARN), ephemeral=True)

    @eco.command(name="withdraw", description="Move coins from bank to pocket.")
    @app_commands.describe(amount="How many coins")
    async def withdraw(self, interaction: discord.Interaction, amount: int):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.bank_move(
            database._db, interaction.guild.id, interaction.user.id, int(amount or 0), "withdraw")
        await interaction.followup.send(
            embed=embeds.ok("🏦 Withdrawn", f"**{amount:,}** coins in pocket.")
            if ok else embeds.embed("⚠️ Withdraw failed", msg, embeds.WARN), ephemeral=True)

    # ── Timed rewards ──
    async def _timed(self, interaction: discord.Interaction, field: str,
                     cooldown: int, amount: int, label: str, streak_field: str | None = None):
        await interaction.response.defer()
        granted, remaining = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id, field, cooldown)
        if not granted:
            hours, rest = divmod(remaining, 3600)
            mins = rest // 60
            await interaction.followup.send(embed=embeds.embed(
                "⏳ Already claimed",
                f"Come back in {hours}h {mins}m." if hours else f"Come back in {mins}m.",
                embeds.WARN))
            return
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id, amount, field, "discord")
        if streak_field:
            try:
                await database._db.economy.update_one(
                    {"guildId": int(interaction.guild.id), "userId": interaction.user.id},
                    {"$inc": {streak_field: 1}})
            except Exception:
                pass
        await eco.check_quests(database._db, interaction.guild.id, interaction.user.id)
        cfg = await _cfg(interaction.guild.id)
        await interaction.followup.send(embed=embeds.ok(
            f"🎁 {label} claimed!", f"+**{final:,}** {cfg.get('currencyName', 'coins')}."))

    @eco.command(name="daily", description="Claim your daily reward (streak bonus).")
    async def daily(self, interaction: discord.Interaction):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, final, streak, remaining = await eco.claim_daily(
            database._db, interaction.guild.id, interaction.user.id,
            int(cfg.get("dailyAmount", 250)))
        if not granted:
            hours, rest = divmod(remaining, 3600)
            mins = rest // 60
            await interaction.followup.send(embed=embeds.embed(
                "⏳ Already claimed",
                f"Daily streak **{streak}** — back in {hours}h {mins}m." if hours else f"Back in {mins}m.",
                embeds.WARN))
            return
        await interaction.followup.send(embed=embeds.ok(
            "🎁 Daily claimed!", f"+**{final:,}** {cfg.get('currencyName', 'coins')} · streak **{streak}** 🔥"))

    @eco.command(name="weekly", description="Claim your weekly reward.")
    async def weekly(self, interaction: discord.Interaction):
        cfg = await _cfg(interaction.guild.id)
        await self._timed(interaction, "lastWeekly", 7 * 86400,
                          int(cfg.get("weeklyAmount", 1500)), "Weekly", "streakWeekly")

    @eco.command(name="monthly", description="Claim your monthly reward.")
    async def monthly(self, interaction: discord.Interaction):
        cfg = await _cfg(interaction.guild.id)
        await self._timed(interaction, "lastMonthly", 30 * 86400,
                          int(cfg.get("monthlyAmount", 6000)), "Monthly", "streakMonthly")

    @eco.command(name="crime", description="Fictional heist minigame (game coins only).")
    @app_commands.describe(stake="Coins to risk (10-500)")
    async def crime(self, interaction: discord.Interaction, stake: int = 100):
        await interaction.response.defer()
        stake = max(10, min(int(stake or 100), 500))
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        if int(wallet.get("balance", 0)) < stake:
            await interaction.followup.send("Insufficient pocket coins.", ephemeral=True)
            return
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "lastCrime", int(cfg.get("crimeCooldownSec", 1800)))
        if not granted:
            await interaction.followup.send("The heat is on — lay low a while.", ephemeral=True)
            return
        delta, label = eco.play_crime(stake)
        # Server-side settle: debit stake guard, credit winnings.
        ok, _ = await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                      "balance", -stake, "crime_stake", "discord")
        if not ok:
            await interaction.followup.send("Insufficient funds.", ephemeral=True)
            return
        if delta > 0:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", stake + delta, "crime_win", "discord")
            await interaction.followup.send(f"🥷 {label} (profit **+{delta}**).")
        else:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", stake + delta, "crime_push", "discord")
            await interaction.followup.send(f"{label} — stake partly kept.")

    @eco.command(name="config", description="View or set economy config (Manage Server).")
    @app_commands.describe(key="Setting name (empty = view all)", value="New value")
    async def config_cmd(self, interaction: discord.Interaction, key: str = "", value: str = ""):
        await interaction.response.defer(ephemeral=True)
        try:
            is_admin = bool(interaction.user.guild_permissions.manage_guild
                            or interaction.user.guild_permissions.administrator)
        except Exception:
            is_admin = False
        cfg = await _cfg(interaction.guild.id)
        if not key:
            lines = [f"`{k}` = `{v}`" for k, v in sorted(cfg.items()) if k != "multipliers"]
            lines.append(f"`multipliers` = `{cfg.get('multipliers')}`")
            await interaction.followup.send(embed=embeds.embed(
                "⚙️ Economy config", "\n".join(lines)[:1800], embeds.INFO), ephemeral=True)
            return
        if not is_admin:
            await interaction.followup.send("Manage Server only.", ephemeral=True)
            return
        key = (key or "").strip()
        if key not in eco.ECONOMY_DEFAULTS:
            await interaction.followup.send(
                "Keys: " + ", ".join(sorted(eco.ECONOMY_DEFAULTS)), ephemeral=True)
            return
        default = eco.ECONOMY_DEFAULTS[key]
        try:
            parsed: object = int(value) if isinstance(default, int) else value[:60]
            if isinstance(default, int) and not (0 <= int(value) <= 1000000):
                raise ValueError()
        except Exception:
            await interaction.followup.send("Invalid value for that key.", ephemeral=True)
            return
        try:
            await database.set_guild_config(interaction.guild.id, {"economy": {**cfg, key: parsed}})
            await database.audit_config_change(
                interaction.guild.id, str(interaction.user.id), f"economy.{key}={parsed}")
        except Exception:
            await interaction.followup.send("Could not save config.", ephemeral=True)
            return
        await interaction.followup.send(f"Economy `{key}` → `{parsed}`.", ephemeral=True)

    # ── Small activities ──
    @eco.command(name="beg", description="Beg for a few coins.")
    async def beg(self, interaction: discord.Interaction):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "lastBeg", int(cfg.get("begCooldownSec", 300)))
        if not granted:
            await interaction.followup.send("Not now — begging has a short cooldown.", ephemeral=True)
            return
        amount = random.randint(int(cfg.get("begMin", 5)), int(cfg.get("begMax", 100)))
        if random.random() < 0.15:
            await interaction.followup.send(random.choice([
                "Nobody spared a coin. The streets are cold today.",
                "A pigeon judged you and flew away.",
            ]))
            return
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id, amount, "beg", "discord")
        await interaction.followup.send(f"🪙 A kind soul gave you **{final}** coins.")

    @eco.command(name="work", description="Work a shift for coins (hourly).")
    @app_commands.describe(job="Pick a job for flavor")
    @app_commands.choices(job=[
        app_commands.Choice(name="Shift", value="shift"),
        app_commands.Choice(name="Stars", value="stars"),
    ])
    async def work(self, interaction: discord.Interaction, job: str = "shift"):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        if job == "stars":
            wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
            shifts = int(wallet.get("shiftsWorked", 0))
            await interaction.followup.send(f"⭐ You have worked **{shifts}** shifts.", ephemeral=True)
            return
        granted, remaining = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "lastWork", int(cfg.get("workCooldownSec", 3600)))
        if not granted:
            await interaction.followup.send(
                f"Shift over — rest for {remaining // 60}m.", ephemeral=True)
            return
        amount = random.randint(int(cfg.get("workMin", 50)), int(cfg.get("workMax", 300)))
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id, amount, "work", "discord")
        try:
            await database._db.economy.update_one(
                {"guildId": int(interaction.guild.id), "userId": interaction.user.id},
                {"$inc": {"shiftsWorked": 1}})
        except Exception:
            pass
        gig = random.choice(["barista", "courier", "lifeguard", "debugger", "bard"])
        await interaction.followup.send(f"💼 You worked as a {gig} and earned **{final}** coins.")

    async def _activity(self, interaction: discord.Interaction, kind: str,
                        low: int, high: int, verbs: list[str]):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            f"last_{kind}", int(cfg.get("activityCooldownSec", 600)))
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

    @eco.command(name="adventure", description="Spend a ticket on a randomized adventure.")
    async def adventure(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not await eco.remove_item(database._db, interaction.guild.id,
                                     interaction.user.id, "adventure_ticket", 1):
            await interaction.followup.send(
                "You need an Adventure Ticket — check `/inventory shop`.", ephemeral=True)
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

    @eco.command(name="search", description="Search a location for rewards.")
    async def search_cmd(self, interaction: discord.Interaction):
        await self._activity(interaction, "search", 20, 120,
                             ["searched", "🔍 You searched the attic:", "🔍 Behind the couch:"])

    @eco.command(name="dig", description="Dig for items and collectibles.")
    async def dig(self, interaction: discord.Interaction):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "last_dig", int(cfg.get("activityCooldownSec", 600)))
        if not granted:
            await interaction.followup.send("The ground needs time to restock.", ephemeral=True)
            return
        if random.random() < 0.35:
            item = random.choice(["bread", "gem_shard", "speed_fertilizer"])
            await eco.add_item(database._db, interaction.guild.id, interaction.user.id, item, 1)
            await interaction.followup.send(f"⛏️ You dug up **{eco.ITEMS[item]['name']}**!")
        else:
            final, _ = await eco.grant_coins(
                database._db, interaction.guild.id, interaction.user.id,
                random.randint(15, 90), "activity", "discord")
            await interaction.followup.send(f"⛏️ You dug up **{final}** coins.")

    @eco.command(name="tidy", description="Tidy up for a small reward.")
    async def tidy(self, interaction: discord.Interaction):
        await self._activity(interaction, "tidy", 10, 60,
                             ["tidied", "🧹 Sparkling clean:", "🧹 You organized the guild hall:"])

    @eco.command(name="postmemes", description="Post a fictional meme for rewards.")
    async def postmemes(self, interaction: discord.Interaction):
        await self._activity(interaction, "postmemes", 15, 120,
                             ["posted", "📯 Your meme went semi-viral:", "📯 Fresh meme energy:"])

    @eco.command(name="stream", description="Run a fictional stream session.")
    async def stream(self, interaction: discord.Interaction):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "last_stream", int(cfg.get("activityCooldownSec", 600)))
        if not granted:
            await interaction.followup.send("You need rest before the next stream.", ephemeral=True)
            return
        viewers = random.randint(5, 200)
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id,
            viewers * 2, "activity", "discord")
        await interaction.followup.send(
            f"🎥 You streamed to **{viewers}** viewers and earned **{final}** coins.")

    # ── Risk ──
    @eco.command(name="rob", description="Attempt to steal pocket coins (fictional game).")
    @app_commands.describe(user="Target member")
    async def rob(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer()
        if user.id == interaction.user.id or user.bot:
            await interaction.followup.send("Pick another member.", ephemeral=True)
            return
        cfg = await _cfg(interaction.guild.id)
        granted, remaining = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "lastRob", int(cfg.get("robCooldownSec", 3600)))
        if not granted:
            await interaction.followup.send(f"Lay low for {remaining // 60}m.", ephemeral=True)
            return
        target = await eco.get_wallet(database._db, interaction.guild.id, user.id)
        if int(target.get("balance", 0)) < int(cfg.get("robMinTarget", 100)):
            await interaction.followup.send("Target is too broke to rob.", ephemeral=True)
            return
        if random.random() < 0.45:
            take = max(10, int(int(target.get("balance", 0)) * random.uniform(0.05, 0.2)))
            ok, _ = await eco.apply_delta(database._db, interaction.guild.id, user.id,
                                          "balance", -take, "rob_loss", "discord")
            if ok:
                await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                      "balance", take, "rob_win", "discord")
                await interaction.followup.send(f"🥷 You swiped **{take}** coins from {user.mention}!")
            else:
                await interaction.followup.send("They slipped away.", ephemeral=True)
        else:
            fine = random.randint(50, 200)
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", -fine, "rob_fine", "discord")
            await interaction.followup.send(f"🚨 Caught! You paid a **{fine}** coin fine.")

    @eco.command(name="bankrob", description="Join the fictional bank heist pool.")
    @app_commands.describe(stake="Coins to stake in the heist")
    async def bankrob(self, interaction: discord.Interaction, stake: int = 100):
        await interaction.response.defer()
        stake = max(10, min(int(stake or 100), 1000))
        ok, _ = await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                      "balance", -stake, "bankrob_stake", "discord")
        if not ok:
            await interaction.followup.send("Insufficient funds for that stake.", ephemeral=True)
            return
        try:
            pool = await database._db.economy_heist.find_one_and_update(
                {"guildId": int(interaction.guild.id), "status": "open"},
                {"$inc": {"pool": stake, "crew": 1},
                 "$setOnInsert": {"createdAt": eco._now()}},
                upsert=True, return_document=True)
        except Exception:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", stake, "bankrob_refund", "discord")
            await interaction.followup.send("Heist board unavailable — stake refunded.", ephemeral=True)
            return
        crew = int(pool.get("crew", 1))
        if crew >= 3:
            total = int(pool.get("pool", 0))
            winners = crew
            share = total * 2 // max(1, winners)
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", share, "bankrob_win", "discord")
            try:
                await database._db.economy_heist.update_one(
                    {"_id": pool["_id"]}, {"$set": {"status": "done"}})
            except Exception:
                pass
            await interaction.followup.send(
                f"🏦 HEIST SUCCESS! Crew of {crew} splits **{total * 2}** — your cut: **{share}**!")
        else:
            await interaction.followup.send(
                f"🏦 You're in (stake **{stake}**). Crew: **{crew}/3** — the heist fires at 3.")

    # ── Lottery / session / calculate (drops lives at top-level /drops) ──
    @eco.command(name="lottery", description="Buy in-game lottery tickets.")
    @app_commands.describe(tickets="How many tickets")
    async def lottery(self, interaction: discord.Interaction, tickets: int = 1):
        await interaction.response.defer(ephemeral=True)
        cfg = await _cfg(interaction.guild.id)
        count = max(1, min(int(tickets or 1), int(cfg.get("lotteryMaxTickets", 10))))
        ok, msg = await eco.lottery_buy(
            database._db, interaction.guild.id, interaction.user.id,
            count, int(cfg.get("lotteryTicketPrice", 100)))
        if not ok:
            await interaction.followup.send(msg, ephemeral=True)
            return
        state = await eco.lottery_state(database._db, interaction.guild.id)
        await interaction.followup.send(
            f"🎟️ **{count}** ticket(s) in! Pool: **{state['pool']}** — daily draw.", ephemeral=True)

    @eco.command(name="session", description="Start or summarize your earning session.")
    @app_commands.describe(action="start or summary")
    @app_commands.choices(action=[
        app_commands.Choice(name="start", value="start"),
        app_commands.Choice(name="summary", value="summary"),
    ])
    async def session(self, interaction: discord.Interaction, action: str = "start"):
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

    @eco.command(name="calculate", description="Safely evaluate a math expression.")
    @app_commands.describe(equation="e.g. (150*3)+45")
    async def calculate(self, interaction: discord.Interaction, equation: str):
        await interaction.response.defer(ephemeral=True)
        try:
            result = eco.safe_calculate(equation)
        except ValueError as exc:
            await interaction.followup.send(f"Invalid expression: {exc}", ephemeral=True)
            return
        await interaction.followup.send(f"🧮 `{equation[:100]}` = **{result}**", ephemeral=True)

    # ── Prestige / omega ──
    @eco.command(name="prestige", description="Reset wealth for a permanent bonus (confirm to apply).")
    @app_commands.describe(confirm="Type yes to confirm the reset")
    async def prestige(self, interaction: discord.Interaction, confirm: str = ""):
        await interaction.response.defer(ephemeral=True)
        ok, msg, info = await eco.prestige_preview(database._db, interaction.guild.id, interaction.user.id)
        if not ok:
            await interaction.followup.send(msg, ephemeral=True)
            return
        if confirm.strip().lower() not in ("yes", "confirm"):
            await interaction.followup.send(embed=embeds.embed(
                "🔥 Prestige preview",
                f"Level **{info['level']}** → reset {info['resets']}.\n"
                f"Keeps {info['keeps']}.\nBonus: {info['bonus']}.\n\n"
                "Run again with `confirm: yes` — this is irreversible.", embeds.WARN),
                ephemeral=True)
            return
        ok, msg = await eco.prestige_apply(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send(
            "🔥 Prestiged! Permanent +10% coin rewards." if ok else msg, ephemeral=True)

    @eco.command(name="omega", description="Ascend to the Omega tier (confirm to apply).")
    @app_commands.describe(confirm="Type yes to confirm")
    async def omega(self, interaction: discord.Interaction, confirm: str = ""):
        await interaction.response.defer(ephemeral=True)
        if confirm.strip().lower() not in ("yes", "confirm"):
            await interaction.followup.send(embed=embeds.embed(
                "🌀 Omega ascension",
                "Requires **prestige 3 + level 50**. Resets wealth AND prestige, "
                "grants +25% rewards and Omega status.\nRun again with `confirm: yes`.",
                embeds.WARN), ephemeral=True)
            return
        ok, msg = await eco.omega_apply(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send(
            "🌀 Ascended to **Ω Omega**!" if ok else msg, ephemeral=True)

    # ── Trade / friends / marriage ──
    @eco.command(name="trade", description="Trade coins/items securely (create/accept/confirm/cancel).")
    @app_commands.describe(action="create, accept, confirm or cancel", user="Counterparty",
                           coins="Coin offer", items="item:qty,comma,separated", trade_id="Trade ID")
    @app_commands.choices(action=[
        app_commands.Choice(name="create", value="create"),
        app_commands.Choice(name="accept", value="accept"),
        app_commands.Choice(name="confirm", value="confirm"),
        app_commands.Choice(name="cancel", value="cancel"),
    ])
    async def trade(self, interaction: discord.Interaction, action: str,
                    user: discord.Member | None = None,
                    coins: int = 0, items: str = "", trade_id: str = ""):
        await interaction.response.defer(ephemeral=True)
        gid = interaction.guild.id
        me = interaction.user.id

        def parse_items(raw: str) -> dict:
            out: dict[str, int] = {}
            for part in (raw or "").split(","):
                if ":" not in part:
                    continue
                name, qty = part.split(":", 1)
                name, qty = name.strip(), qty.strip()
                if name in eco.ITEMS and qty.isdigit() and int(qty) > 0:
                    out[name] = min(int(qty), 99)
            return out

        if action == "create":
            if not user or user.id == me or user.bot:
                await interaction.followup.send("Pick another member to trade with.", ephemeral=True)
                return
            tid = await eco.trade_create(database._db, gid, me, user.id,
                                         {"coins": max(0, int(coins or 0)),
                                          "items": parse_items(items)})
            await interaction.followup.send(
                f"🤝 Trade **{tid}** opened with {user.mention} — they accept with "
                f"`/economy trade accept`, then either side confirms. Expires in 5 min.",
                ephemeral=True)
        elif action == "accept":
            ok, msg = await eco.trade_accept(
                database._db, gid, trade_id.strip(), me,
                {"coins": max(0, int(coins or 0)), "items": parse_items(items)})
            await interaction.followup.send(
                ("✅ Accepted and locked — confirm with `/economy trade confirm`."
                 if ok else f"⚠️ {msg}"), ephemeral=True)
        elif action == "confirm":
            ok, msg = await eco.trade_confirm(database._db, gid, trade_id.strip(), me)
            await interaction.followup.send(
                "🤝 Trade completed!" if ok else f"⚠️ {msg}", ephemeral=True)
        else:
            ok, msg = await eco.trade_cancel(database._db, gid, trade_id.strip(), me)
            await interaction.followup.send(
                "Trade cancelled, assets returned." if ok else f"⚠️ {msg}", ephemeral=True)

    @eco.command(name="friends", description="Friends list, requests and answers.")
    @app_commands.describe(action="add, list, requests, accept, remove, block", user="Other member")
    @app_commands.choices(action=[
        app_commands.Choice(name="add", value="add"),
        app_commands.Choice(name="list", value="list"),
        app_commands.Choice(name="requests", value="requests"),
        app_commands.Choice(name="accept", value="accept"),
        app_commands.Choice(name="remove", value="remove"),
        app_commands.Choice(name="block", value="block"),
    ])
    async def friends(self, interaction: discord.Interaction, action: str,
                      user: discord.Member | None = None):
        await interaction.response.defer(ephemeral=True)
        gid, me = interaction.guild.id, interaction.user.id
        if action == "add":
            if not user:
                await interaction.followup.send("Pick a member.", ephemeral=True)
                return
            ok, msg = await eco.friend_request(database._db, gid, me, user.id)
            await interaction.followup.send("Friend request sent." if ok else msg, ephemeral=True)
        elif action == "accept":
            if not user:
                await interaction.followup.send("Pick the requester.", ephemeral=True)
                return
            ok, msg = await eco.friend_answer(database._db, gid, me, user.id, True)
            await interaction.followup.send("Friends! 🎉" if ok else msg, ephemeral=True)
        elif action == "remove":
            if user:
                await database._db.economy_social.update_one(
                    {"guildId": int(gid), "userId": me},
                    {"$pull": {"friends": int(user.id)}})
                await interaction.followup.send("Removed.", ephemeral=True)
            else:
                await interaction.followup.send("Pick a member.", ephemeral=True)
        elif action == "block":
            if not user:
                await interaction.followup.send("Pick a member.", ephemeral=True)
                return
            await database._db.economy_social.update_one(
                {"guildId": int(gid), "userId": me},
                {"$addToSet": {"blocked": int(user.id)},
                 "$pull": {"friends": int(user.id), "requests": int(user.id)}},
                upsert=True)
            await interaction.followup.send("Blocked.", ephemeral=True)
        elif action == "requests":
            doc = await eco.social_doc(database._db, gid, me)
            reqs = doc.get("requests", [])[:10]
            await interaction.followup.send(
                "Pending: " + (", ".join(f"<@{r}>" for r in reqs) if reqs else "none"),
                ephemeral=True)
        else:
            doc = await eco.social_doc(database._db, gid, me)
            friends = doc.get("friends", [])[:20]
            await interaction.followup.send(
                "Friends: " + (", ".join(f"<@{f}>" for f in friends) if friends else "none yet"),
                ephemeral=True)

    @eco.command(name="marriage", description="Fictional partnership status and vows.")
    @app_commands.describe(action="status or propose", user="Partner")
    @app_commands.choices(action=[
        app_commands.Choice(name="status", value="status"),
        app_commands.Choice(name="propose", value="propose"),
    ])
    async def marriage(self, interaction: discord.Interaction, action: str = "status",
                       user: discord.Member | None = None):
        await interaction.response.defer(ephemeral=True)
        gid, me = interaction.guild.id, interaction.user.id
        if action == "propose":
            if not user or user.id == me or user.bot:
                await interaction.followup.send("Pick another member.", ephemeral=True)
                return
            ok, msg = await eco.marry(database._db, gid, me, user.id)
            await interaction.followup.send(
                f"💍 {interaction.user.mention} ❤ {user.mention} — partnered!" if ok else msg,
                ephemeral=True)
            return
        doc = await eco.social_doc(database._db, gid, me)
        partner = doc.get("partner")
        await interaction.followup.send(
            f"💍 Partnered with <@{partner}>." if partner else "No partner — propose with `/economy marriage`.",
            ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(EconomyGroup(bot))
