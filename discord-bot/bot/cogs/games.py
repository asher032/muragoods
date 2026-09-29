"""`/games` group — wager minigames on the shared wallet engine.

Every game: bet validated server-side (min/max/balance), outcome from pure
engine functions, guarded atomic debit/credit. No negative balances, no
client-side amounts — the payout math lives in bot/economy.py.
"""

import logging
import random
import time

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import rewards as rw
import utils

log = logging.getLogger("bot.games")


class GamesGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    games = app_commands.Group(name="minigames", description="Wager minigames")

    async def _wager(self, interaction: discord.Interaction, bet: int):
        """Validate + lock the stake. Returns (cfg, wallet, stake) or sends
        the reason and returns None."""
        cfg = await eco.get_economy_config(database._db, interaction.guild.id)
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        ok, reason = eco.validate_bet(int(wallet.get("balance", 0)), int(bet or 0), cfg)
        if not ok:
            await interaction.followup.send(reason, ephemeral=True)
            return None
        stake = int(bet)
        locked, _ = await eco.apply_delta(
            database._db, interaction.guild.id, interaction.user.id,
            "balance", -stake, "game_stake", "discord")
        if not locked:
            await interaction.followup.send("Insufficient funds.", ephemeral=True)
            return None
        return cfg, wallet, stake

    async def _settle(self, interaction: discord.Interaction, stake: int, delta: int, label: str):
        """Credit winnings (delta includes stake-back where applicable)."""
        if delta > 0:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", delta, "game_win", "discord")
            await interaction.followup.send(embed=embeds.ok("🎉 You won!", f"{label}\n+**{delta}** coins."))
        elif delta == 0:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", stake, "game_push", "discord")
            await interaction.followup.send(f"{label}\nPush — stake returned.")
        else:
            await interaction.followup.send(embed=embeds.embed(
                "😞 You lost", f"{label}\n**{-delta}** coins.", embeds.WARN))

    @games.command(name="slots", description="Spin the slots.")
    @app_commands.describe(bet="Coins to wager")
    async def slots(self, interaction: discord.Interaction, bet: int):
        await interaction.response.defer()
        pre = await self._wager(interaction, bet)
        if not pre:
            return
        _, _, stake = pre
        delta, label = eco.play_slots(stake)
        await self._settle(interaction, stake, delta, f"🎰 `{label}`")

    @games.command(name="cointoss", description="Heads or tails.")
    @app_commands.describe(bet="Coins to wager", guess="heads or tails")
    @app_commands.choices(guess=[
        app_commands.Choice(name="heads", value="heads"),
        app_commands.Choice(name="tails", value="tails"),
    ])
    async def cointoss(self, interaction: discord.Interaction, bet: int, guess: str):
        await interaction.response.defer()
        pre = await self._wager(interaction, bet)
        if not pre:
            return
        _, _, stake = pre
        try:
            delta, label = eco.play_cointoss(stake, guess)
        except ValueError as exc:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", stake, "game_refund", "discord")
            await interaction.followup.send(str(exc), ephemeral=True)
            return
        await self._settle(interaction, stake, delta, f"🪙 Landed **{label}**")

    @games.command(name="highlow", description="Will the roll be high or low?")
    @app_commands.describe(bet="Coins to wager", guess="high or low")
    @app_commands.choices(guess=[
        app_commands.Choice(name="high", value="high"),
        app_commands.Choice(name="low", value="low"),
    ])
    async def highlow(self, interaction: discord.Interaction, bet: int, guess: str):
        await interaction.response.defer()
        pre = await self._wager(interaction, bet)
        if not pre:
            return
        _, _, stake = pre
        try:
            delta, label = eco.play_highlow(stake, guess)
        except ValueError as exc:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", stake, "game_refund", "discord")
            await interaction.followup.send(str(exc), ephemeral=True)
            return
        await self._settle(interaction, stake, delta, f"🎲 {label}")

    @games.command(name="roulette", description="Red/black/even/odd or a number.")
    @app_commands.describe(bet="Coins to wager", pick="red, black, even, odd or 0-36")
    async def roulette(self, interaction: discord.Interaction, bet: int, pick: str):
        await interaction.response.defer()
        pre = await self._wager(interaction, bet)
        if not pre:
            return
        _, _, stake = pre
        try:
            delta, label = eco.play_roulette(stake, pick)
        except ValueError as exc:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", stake, "game_refund", "discord")
            await interaction.followup.send(str(exc), ephemeral=True)
            return
        await self._settle(interaction, stake, delta, f"🎡 {label}")

    @games.command(name="blackjack", description="Beat the dealer (simplified).")
    @app_commands.describe(bet="Coins to wager")
    async def blackjack(self, interaction: discord.Interaction, bet: int):
        await interaction.response.defer()
        pre = await self._wager(interaction, bet)
        if not pre:
            return
        _, _, stake = pre
        player, dealer, outcome = eco.play_blackjack_hand()
        label = f"You **{player}** — dealer **{dealer}**"
        if outcome == "win":
            await self._settle(interaction, stake, stake, f"🃏 {label}")
        elif outcome == "push":
            await self._settle(interaction, stake, 0, f"🃏 {label}")
        elif outcome == "bust":
            await self._settle(interaction, stake, -stake, f"🃏 Bust! {label}")
        else:
            await self._settle(interaction, stake, -stake, f"🃏 Dealer wins. {label}")

    @games.command(name="snakeeyes", description="Roll for snake eyes (10x).")
    @app_commands.describe(bet="Coins to wager")
    async def snakeeyes(self, interaction: discord.Interaction, bet: int):
        await interaction.response.defer()
        pre = await self._wager(interaction, bet)
        if not pre:
            return
        _, _, stake = pre
        delta, label = eco.play_snakeeyes(stake)
        await self._settle(interaction, stake, delta, f"🎲 {label}")

    @games.command(name="crime", description="Fictional heist minigame (game coins only).")
    @app_commands.describe(stake="Coins to risk (10-500)")
    async def crime(self, interaction: discord.Interaction, stake: int = 100):
        await interaction.response.defer()
        stake = max(10, min(int(stake or 100), 500))
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        if int(wallet.get("balance", 0)) < stake:
            await interaction.followup.send("Insufficient pocket coins.", ephemeral=True)
            return
        cfg = await eco.get_economy_config(database._db, interaction.guild.id)
        granted, _ = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "lastCrime", int(cfg.get("crimeCooldownSec", 1800)))
        if not granted:
            await interaction.followup.send("The heat is on — lay low a while.", ephemeral=True)
            return
        delta, label = eco.play_crime(stake)
        ok, _ = await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                      "balance", -stake, "crime_stake", "discord")
        if not ok:
            await interaction.followup.send("Insufficient funds.", ephemeral=True)
            return
        if delta > 0:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", stake + delta, "crime_win", "discord")
            # Item drop only on a successful crime, via the shared service.
            grant = None
            try:
                grant = await rw.roll_item_reward(
                    database._db, interaction.guild.id, interaction.user.id, "crime", cfg,
                    idempotency_key=f"crime:{int(time.time()) // max(1, eco.safe_int(cfg.get('crimeCooldownSec'), 1800))}")
            except Exception:
                log.warning("crime item reward failed", exc_info=True)
            e = embeds.embed("🥷 Crime Successful", f"{label} (profit **+{delta}**).", embeds.OK)
            pair = rw.reward_field([grant] if grant else None)
            if pair:
                e.add_field(name="You also found", value=pair[1], inline=False)
            await interaction.followup.send(embed=e)
        else:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", stake + delta, "crime_push", "discord")
            await interaction.followup.send(f"{label} — stake partly kept.")

    @games.command(name="rob", description="Attempt to steal pocket coins (fictional game).")
    @app_commands.describe(user="Target member")
    async def rob(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer()
        if user.id == interaction.user.id or user.bot:
            await interaction.followup.send("Pick another member.", ephemeral=True)
            return
        cfg = await eco.get_economy_config(database._db, interaction.guild.id)
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
                # A successful rob may leave something behind. Never guaranteed.
                grant = None
                try:
                    grant = await rw.roll_item_reward(
                        database._db, interaction.guild.id, interaction.user.id, "rob", cfg,
                        idempotency_key=f"rob:{int(time.time()) // max(1, eco.safe_int(cfg.get('robCooldownSec'), 3600))}")
                except Exception:
                    log.warning("rob item reward failed", exc_info=True)
                e = embeds.embed("🥷 Rob Successful",
                                 f"You swiped **{take}** coins from {user.mention}!", embeds.OK)
                pair = rw.reward_field([grant] if grant else None)
                if pair:
                    e.add_field(name="They dropped", value=pair[1], inline=False)
                await interaction.followup.send(embed=e)
            else:
                await interaction.followup.send("They slipped away.", ephemeral=True)
        else:
            fine = random.randint(50, 200)
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", -fine, "rob_fine", "discord")
            await interaction.followup.send(f"🚨 Caught! You paid a **{fine}** coin fine.")

    @games.command(name="bankrob", description="Join the fictional bank heist pool.")
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

    @games.command(name="scratch", description="Scratch a free ticket.")
    async def scratch(self, interaction: discord.Interaction):
        await interaction.response.defer()
        reward, label, rows = eco.play_scratch()
        if reward:
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "balance", reward, "game_win", "discord")
            await interaction.followup.send(embed=embeds.ok(
                "🎫 Scratch WIN!", "\n".join(f"`{row}`" for row in rows) + f"\n+**{reward}** coins."))
        else:
            await interaction.followup.send("🎫\n" + "\n".join(f"`{row}`" for row in rows) + "\nNo match.")


async def setup(bot: commands.Bot):
    await bot.add_cog(GamesGroup(bot))
