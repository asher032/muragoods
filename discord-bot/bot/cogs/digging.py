"""`/dig` — the Muragoods digging loop.

Rewards come exclusively from the existing item catalog via the centralized
reward service (`rewards.roll_item_reward`). No item, probability or pool is
defined here: digging is a *source*, and the catalog decides what a source can
award.

Digging equipment reuses the effects those items already have, read through
`economy.active_item_effects` — there is no second equipment-effect table.
"""

import logging
import random

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import items as itemdb
import rewards as rw

log = logging.getLogger("bot.digging")

#: Digging locations. Purely flavour: the REWARD comes from the reward
#: service, not from this table, so adding a location can never change the
#: economy by itself.
LOCATIONS: tuple[dict, ...] = (
    {"id": "library_steps", "name": "Under the Library Steps",
     "blurb": "Someone buried a textbook here. It's been there a while."},
    {"id": "engineering", "name": "Behind the Engineering Block",
     "blurb": "Wires, dust, and one genuinely lucky find."},
    {"id": "cafeteria", "name": "The Cafeteria Trench",
     "blurb": "Trench, technically. Digging is permitted."},
    {"id": "quad", "name": "The Quad Flowerbeds",
     "blurb": "Mind the roots. Mind the gardener more."},
    {"id": "sports_field", "name": "The Old Sports Field",
     "blurb": "Under the turf: bottle caps, and older disappointments."},
    {"id": "mura_statue", "name": "Under the Mura Statue",
     "blurb": "The mascot has been here longer than the plaques say."},
    {"id": "gym", "name": "Behind the Gym",
     "blurb": "Deep shade, deep soil, occasional deep denial."},
    {"id": "car_park", "name": "The Old Car Park",
     "blurb": "Nobody parks here any more, so it is all yours."},
    {"id": "stream", "name": "By the Stream",
     "blurb": "Silt, coins, and the occasional bottle."},
    {"id": "boiler", "name": "The Old Boiler Room",
     "blurb": "Warm, loud, and sealed for a reason."},
)

LOCATION_BY_ID = {loc["id"]: loc for loc in LOCATIONS}

DIG_COOLDOWN_SEC = 300

#: Coin range for a successful dig, before any multiplier.
DIG_COIN_MIN = 20
DIG_COIN_MAX = 180


class DiggingCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="dig", description="Search the campus for buried Muragoods finds.")
    @app_commands.describe(location="Where to dig (default: somewhere on campus)")
    async def dig(self, interaction: discord.Interaction, location: str = ""):
        await interaction.response.defer()
        gid, uid = interaction.guild.id, interaction.user.id
        cfg = await eco.get_economy_config(database._db, gid)

        spot = self._pick(location)
        if spot is None:
            await interaction.followup.send(
                f"🪨 You don't know a place called **{location}**. "
                "Run `/dig` bare to search the whole campus.", ephemeral=True)
            return

        # Equipment bonuses are read from the effects the held items ALREADY
        # define. Holding a `library_card` (cooldown_reduction 0.08) shortens
        # the wait; holding an `explorer_backpack` (loot_bonus 0.10) improves
        # the odds. No digging-specific effect table exists.
        effects = await eco.active_item_effects(database._db, gid, uid)
        cd_reduction = min(max(float(effects.get("cooldown_reduction", 0.0)), 0.0), 0.6)
        cooldown = max(30, int(DIG_COOLDOWN_SEC * (1.0 - cd_reduction)))

        granted, remaining = await eco.claim_cooldown(
            database._db, gid, uid, "lastDig", cooldown)
        if not granted:
            mins = max(1, remaining // 60)
            await interaction.followup.send(
                f"⏳ The ground here is still settling — try again in **{mins}m**.", ephemeral=True)
            return

        base = random.randint(DIG_COIN_MIN, DIG_COIN_MAX)
        coins, bonuses = await eco.grant_coins(
            database._db, gid, uid, base, "dig", "discord")

        # Lucky-break flavor line when the player is holding luck gear.
        luck = float(effects.get("luck_bonus", 0.0)) + float(effects.get("loot_bonus", 0.0))
        intros = [
            "You scraped away the topsoil.",
            "A trowel, some patience, and low expectations.",
            "You dug where the grass was thinner.",
        ]
        if luck > 0.10:
            intros.append("Something in the soil felt worth following.")

        # The item award is the centralized service. The dig slot is a unique
        # key, so a retried dig in the same slot cannot pay twice.
        slot = int(eco._now().timestamp()) // cooldown
        item = None
        try:
            item = await rw.roll_item_reward(
                database._db, gid, uid, "dig", cfg, idempotency_key=f"dig:{slot}")
        except Exception:
            log.warning("dig item reward failed", exc_info=True)

        try:
            await database._db.economy_tx.insert_one({
                "guildId": gid, "userId": uid, "type": "dig", "amount": 0,
                "location": spot["id"], "at": eco._now()})
        except Exception:
            pass
        await eco.check_quests(database._db, gid, uid)

        e = embeds.embed(
            "⛏️ Digging",
            f"**{spot['name']}**\n_{spot['blurb']}_\n\n"
            f"{random.choice(intros)}\n\n🪙 **+{coins}** coins",
            embeds.GOLD)
        pair = rw.reward_field([item] if item else None)
        if pair:
            e.add_field(name="You found", value=pair[1], inline=False)
        else:
            e.add_field(name="You found", value="Nothing but old roots.", inline=False)
        e.set_footer(text=f"Dig again in {cooldown // 60}m · `/inventory` to see your items")
        await interaction.followup.send(embed=e)

    def _pick(self, location: str) -> dict | None:
        raw = (location or "").strip().lower().replace(" ", "_")
        if not raw:
            return random.choice(list(LOCATIONS))
        if raw in LOCATION_BY_ID:
            return LOCATION_BY_ID[raw]
        for loc in LOCATIONS:
            if loc["name"].lower() == raw or raw in loc["id"]:
                return loc
        # Accept a display name too, resolved through the same helper the
        # rest of the bot uses, so "/dig Library Steps" works.
        resolved = itemdb.resolve_item(raw)
        for loc in LOCATIONS:
            if resolved and resolved["item_id"] in loc["id"]:
                return loc
        return None

    @dig.autocomplete("location")
    async def dig_location_autocomplete(
            self, interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
        """The autocomplete IS the location browser — no extra command needed."""
        q = (current or "").strip().lower()
        return [app_commands.Choice(name=loc["name"], value=loc["id"])
                for loc in LOCATIONS if not q or q in loc["name"].lower()][:25]


async def setup(bot: commands.Bot):
    await bot.add_cog(DiggingCog(bot))
