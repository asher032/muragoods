"""Economy core — short commands, no prefix required.

`/economy` is admin-only (`config`). Everything users touch lives as a
direct command: /deposit, /withdraw, /weekly, /monthly, /quests,
/calculate, /trade, /lottery, /advancements.

All state lives in bot/economy.py against Mongo; every mutation is atomic
(guarded updates + unique transaction rows), so concurrent users, restarts
and double-clicks cannot duplicate currency.
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds

log = logging.getLogger("bot.economy")


async def _cfg(guild_id: int) -> dict:
    return await eco.get_economy_config(database._db, guild_id)


class EconomyCore(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    # ── Admin configuration (the ONLY /economy subcommand) ──
    eco = app_commands.Group(name="economy", description="Economy administration")

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

    # ── Wallet ──
    @app_commands.command(name="deposit", description="Move coins from pocket to bank.")
    @app_commands.describe(amount="How many coins")
    async def deposit(self, interaction: discord.Interaction, amount: int):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.bank_move(
            database._db, interaction.guild.id, interaction.user.id, int(amount or 0), "deposit")
        await interaction.followup.send(
            embed=embeds.ok("🏦 Deposited", f"**{amount:,}** coins secured.")
            if ok else embeds.embed("⚠️ Deposit failed", msg, embeds.WARN), ephemeral=True)

    @app_commands.command(name="withdraw", description="Move coins from bank to pocket.")
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

    @app_commands.command(name="weekly", description="Claim your weekly reward.")
    async def weekly(self, interaction: discord.Interaction):
        cfg = await _cfg(interaction.guild.id)
        await self._timed(interaction, "lastWeekly", 7 * 86400,
                          int(cfg.get("weeklyAmount", 1500)), "Weekly", "streakWeekly")

    @app_commands.command(name="monthly", description="Claim your monthly reward.")
    async def monthly(self, interaction: discord.Interaction):
        cfg = await _cfg(interaction.guild.id)
        await self._timed(interaction, "lastMonthly", 30 * 86400,
                          int(cfg.get("monthlyAmount", 6000)), "Monthly", "streakMonthly")

    @app_commands.command(name="quests", description="Quest progress — earn rewards for milestones.")
    async def quests(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        newly = await eco.check_quests(database._db, gid, uid)
        progress = await eco.quest_progress(database._db, gid, uid)
        lines = []
        for qid, quest in eco.QUESTS.items():
            have = progress.get(quest["check"], 0)
            done = have >= quest["target"]
            lines.append(f"{'✅' if done else '🔒'} **{quest['name']}** "
                         f"{min(have, quest['target'])}/{quest['target']} — {quest['desc']} "
                         f"(+{quest['reward']})")
        extra = f"\n🎉 Just completed: {', '.join(newly)}" if newly else ""
        await interaction.followup.send(embed=embeds.embed(
            "📜 Quests", "\n".join(lines) + extra, embeds.GOLD), ephemeral=True)

    @app_commands.command(name="calculate", description="Safely evaluate a math expression.")
    @app_commands.describe(equation="e.g. (150*3)+45")
    async def calculate(self, interaction: discord.Interaction, equation: str):
        await interaction.response.defer(ephemeral=True)
        try:
            result = eco.safe_calculate(equation)
        except ValueError as exc:
            await interaction.followup.send(f"Invalid expression: {exc}", ephemeral=True)
            return
        await interaction.followup.send(f"🧮 `{equation[:100]}` = **{result}**", ephemeral=True)

    # ── Trade (secure: confirm, lock, timeout, cancel) ──
    trade = app_commands.Group(name="trade", description="Secure item/currency trading")

    def _parse_items(self, raw: str) -> dict:
        out: dict[str, int] = {}
        for part in (raw or "").split(","):
            if ":" not in part:
                continue
            name, qty = part.split(":", 1)
            name, qty = name.strip(), qty.strip()
            if name in eco.ITEMS and qty.isdigit() and int(qty) > 0:
                out[name] = min(int(qty), 99)
        return out

    @trade.command(name="create", description="Open a trade (assets lock on accept).")
    @app_commands.describe(user="Counterparty", coins="Coin offer", items="item:qty,...")
    async def trade_create(self, interaction: discord.Interaction, user: discord.Member,
                           coins: int = 0, items: str = ""):
        await interaction.response.defer(ephemeral=True)
        if user.id == interaction.user.id or user.bot:
            await interaction.followup.send("Pick another member.", ephemeral=True)
            return
        tid = await eco.trade_create(database._db, interaction.guild.id, interaction.user.id,
                                     user.id, {"coins": max(0, int(coins or 0)),
                                               "items": self._parse_items(items)})
        await interaction.followup.send(
            f"🤝 Trade **{tid}** opened with {user.mention} — they run "
            f"`/trade accept trade_id:{tid}`, then either side `/trade confirm`. (5 min)",
            ephemeral=True)

    @trade.command(name="accept", description="Accept and lock both sides.")
    @app_commands.describe(trade_id="Trade ID", coins="Your coin offer", items="item:qty,...")
    async def trade_accept(self, interaction: discord.Interaction, trade_id: str,
                           coins: int = 0, items: str = ""):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.trade_accept(
            database._db, interaction.guild.id, trade_id.strip(), interaction.user.id,
            {"coins": max(0, int(coins or 0)), "items": self._parse_items(items)})
        await interaction.followup.send(
            "✅ Locked — confirm with `/trade confirm`." if ok else f"⚠️ {msg}",
            ephemeral=True)

    @trade.command(name="confirm", description="Swap locked assets (idempotent).")
    @app_commands.describe(trade_id="Trade ID")
    async def trade_confirm(self, interaction: discord.Interaction, trade_id: str):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.trade_confirm(database._db, interaction.guild.id,
                                          trade_id.strip(), interaction.user.id)
        await interaction.followup.send("🤝 Completed!" if ok else f"⚠️ {msg}", ephemeral=True)

    @trade.command(name="cancel", description="Cancel and return locked assets.")
    @app_commands.describe(trade_id="Trade ID")
    async def trade_cancel(self, interaction: discord.Interaction, trade_id: str):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.trade_cancel(database._db, interaction.guild.id,
                                         trade_id.strip(), interaction.user.id)
        await interaction.followup.send(
            "Cancelled, assets returned." if ok else f"⚠️ {msg}", ephemeral=True)

    # ── Lottery ──
    lottery = app_commands.Group(name="lottery", description="In-game lottery (coins only)")

    @lottery.command(name="buy", description="Purchase lottery entries.")
    @app_commands.describe(tickets="How many tickets")
    async def lottery_buy(self, interaction: discord.Interaction, tickets: int = 1):
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
            f"🎟️ **{count}** in! Pool **{state['pool']}** · {state['tickets']} tickets · daily draw.",
            ephemeral=True)

    @lottery.command(name="auto", description="Configure automatic entries.")
    @app_commands.describe(tickets="Auto tickets per round (0 = off)")
    async def lottery_auto(self, interaction: discord.Interaction, tickets: int = 0):
        await interaction.response.defer(ephemeral=True)
        ok, _ = await eco.lottery_auto(
            database._db, interaction.guild.id, interaction.user.id, int(tickets or 0))
        await interaction.followup.send(
            f"🎟️ Auto entries → **{max(0, min(int(tickets or 0), 10))}** per round." if ok
            else "Could not save.", ephemeral=True)

    @lottery.command(name="status", description="Pool, odds, drawings and winners.")
    async def lottery_status(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        state = await eco.lottery_state(database._db, interaction.guild.id)
        auto_n = await eco.lottery_auto_get(database._db, interaction.guild.id, interaction.user.id)
        try:
            past = await database._db.economy_lottery.find(
                {"guildId": int(interaction.guild.id), "status": "done"}
            ).sort("completedAt", -1).limit(3).to_list(3)
        except Exception:
            past = []
        winners = " · ".join(f"<@{p.get('winner')}> (+{int(p.get('pool', 0))})" for p in past) or "no draws yet"
        await interaction.followup.send(embed=embeds.embed(
            "🎟️ Lottery",
            f"Pool **{state['pool']}** · tickets **{state['tickets']}**\n"
            f"Your auto: **{auto_n}**\nWinners: {winners}\n"
            "Odds scale with tickets held; draws are server-side and logged.",
            embeds.GOLD), ephemeral=True)

    # ── Advancements ──
    advancements = app_commands.Group(name="advancements", description="Prestige and Omega")

    @advancements.command(name="prestige", description="Reset wealth for permanent perks (confirm).")
    @app_commands.describe(confirm="Type yes to confirm the irreversible reset")
    async def adv_prestige(self, interaction: discord.Interaction, confirm: str = ""):
        await interaction.response.defer(ephemeral=True)
        ok, msg, info = await eco.prestige_preview(
            database._db, interaction.guild.id, interaction.user.id)
        if not ok:
            await interaction.followup.send(msg, ephemeral=True)
            return
        if confirm.strip().lower() not in ("yes", "confirm"):
            await interaction.followup.send(embed=embeds.embed(
                "🔥 Prestige — READ CAREFULLY",
                f"Level **{info['level']}** → RESET {info['resets']}.\n"
                f"KEEPS {info['keeps']}.\nBonus: {info['bonus']}.\n\n"
                "⚠️ IRREVERSIBLE. Run again with `confirm: yes`.", embeds.WARN),
                ephemeral=True)
            return
        ok, msg = await eco.prestige_apply(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send(
            "🔥 Prestiged! +10% coin rewards forever." if ok else msg, ephemeral=True)

    @advancements.command(name="omega", description="High-tier ascension (cosmetic/game items).")
    @app_commands.describe(confirm="Type yes to confirm")
    async def adv_omega(self, interaction: discord.Interaction, confirm: str = ""):
        await interaction.response.defer(ephemeral=True)
        if confirm.strip().lower() not in ("yes", "confirm"):
            await interaction.followup.send(embed=embeds.embed(
                "🌀 Omega ascension — READ CAREFULLY",
                "Requires **prestige 3 + level 50**. Resets wealth AND prestige. "
                "Grants +25% rewards, Omega title, never pay-to-win.\n"
                "Run again with `confirm: yes`.", embeds.WARN), ephemeral=True)
            return
        ok, msg = await eco.omega_apply(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send("🌀 **Ω Omega** achieved!" if ok else msg, ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(EconomyCore(bot))
