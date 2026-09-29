"""Leveling + economy — XP from chat/voice, per-guild isolation, Mongo-backed.

All XP math lives in leveling_sys (spec formula: need(n) = 5n^2+50n+100).
This cog owns Discord I/O: listeners, slash commands, role rewards, cards,
notifications and the voice-XP loop. Dashboard writes the same
guild_config.leveling document this cog reads.
"""

import logging
import random
import time
from datetime import datetime, timezone

import discord
from discord import app_commands
from discord.ext import commands, tasks

import database
import embeds
import leveling_sys as levels

log = logging.getLogger("bot.leveling")

LEVEL_ROLES = [(5, "🎖️ Regular"), (10, "⭐ Active"), (25, "🌟 Hyper"), (50, "💎 Veteran")]
XP_COOLDOWN = 60  # seconds per message XP grant
DAILY_COOLDOWN = 86400


async def add_xp(guild_id: int, user_id: int, amount: int) -> tuple[int, int]:
    """Legacy helper kept for importers: returns (xp, level) under the
    spec formula."""
    xp, level, _, _ = await levels.add_xp(database._db, guild_id, user_id, amount)
    return xp, level


def _is_manager(member) -> bool:
    try:
        perms = member.guild_permissions
        return bool(getattr(perms, "manage_guild", False) or getattr(perms, "administrator", False))
    except Exception:
        return False


class LevelingCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._xp_bucket: dict[tuple[int, int], float] = {}
        self.voice_loop.start()

    def cog_unload(self):
        try:
            self.voice_loop.cancel()
        except Exception:
            pass

    # ── Shared level-up pipeline ──────────────────────────────────────
    async def _handle_level_up(self, guild: discord.Guild, member: discord.Member,
                               old_level: int, new_level: int, channel=None) -> None:
        """Log, reward, and announce a crossing. Idempotent per level: the
        stored level only moves forward in add_xp, so replays cannot
        double-announce or double-reward."""
        try:
            await levels.log_level_up(database._db, guild.id, member.id, old_level, new_level)
        except Exception:
            pass
        try:
            cfg = await levels.get_level_config(database._db, guild.id)
        except Exception:
            cfg = dict(levels.LEVEL_DEFAULTS)
        reward_role_id = await self._apply_level_reward(guild, member, new_level, cfg)
        has_reward = reward_role_id is not None
        if not levels.should_announce(new_level, cfg, has_reward):
            return
        template = str(cfg.get("levelUpMessage") or levels.LEVEL_DEFAULTS["levelUpMessage"])
        text = levels.render_message(template, member.mention, new_level, 0)
        target = None
        channel_id = str(cfg.get("levelUpChannelId") or "")
        if channel_id.isdigit():
            try:
                target = guild.get_channel(int(channel_id))
            except Exception:
                target = None
        if target is None:
            target = channel if isinstance(channel, discord.TextChannel) else None
        if target is not None:
            try:
                await target.send(embed=embeds.embed("🎉 Level Up!", text, embeds.GOLD))
            except discord.HTTPException:
                pass
        if cfg.get("dmNotify"):
            try:
                await member.send(embed=embeds.embed("🎉 Level Up!",
                                                     f"{text}\n*— {guild.name}*", embeds.GOLD))
            except (discord.Forbidden, discord.HTTPException):
                pass

    async def _apply_level_reward(self, guild: discord.Guild, member: discord.Member,
                                  new_level: int, cfg: dict) -> int | None:
        """Assign the configured role for the new level. Returns role ID or
        None. Never assigns above the bot's top role; managed roles refused."""
        try:
            rewards = cfg.get("rewards") or {}
            role_id = rewards.get(str(new_level))
            if not role_id:
                legacy = (cfg.get(f"reward{new_level}") or "")
                role_id = str(legacy or "")
            if not role_id:
                return None
            role = guild.get_role(int(role_id))
            me = guild.me
            if role is None or role.managed or role.id == guild.id:
                return None
            if me is None or not me.guild_permissions.manage_roles:
                return None
            if role >= me.top_role:
                return None
            if role in list(getattr(member, "roles", []) or []):
                return int(role.id)
            await member.add_roles(role, reason=f"Level {new_level} reward")
            if cfg.get("rewardReplace"):
                for rid, owned in [(r.id, r) for r in list(getattr(member, "roles", []) or [])]:
                    if rid == role.id or rid == guild.id:
                        continue
                    try:
                        owned_role = guild.get_role(int(rid))
                    except Exception:
                        continue
                    if owned_role is None or owned_role.managed:
                        continue
                    configured_ids = {str(v) for v in (rewards or {}).values()}
                    legacy_ids = {str(cfg.get(f"reward{n}", "")) for n in (5, 10, 25, 50, 100)}
                    if str(rid) in configured_ids or str(rid) in legacy_ids:
                        try:
                            if owned_role < me.top_role:
                                await member.remove_roles(owned_role, reason="Reward replacement")
                        except (discord.Forbidden, discord.HTTPException):
                            pass
            return int(role.id)
        except Exception:
            log.exception("Level reward failed")
            return None

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or not message.guild:
            return
        guild, member = message.guild, message.author
        try:
            cfg = await levels.get_level_config(database._db, guild.id)
        except Exception:
            return
        if levels.member_excluded(
                list(getattr(member, "roles", []) or []),
                getattr(message.channel, "id", 0), cfg) is not None:
            return
        key = (guild.id, member.id)
        now = time.monotonic()
        cooldown = max(1, int(cfg.get("xpCooldownSec", XP_COOLDOWN) or XP_COOLDOWN))
        if now - self._xp_bucket.get(key, 0) < cooldown:
            return
        self._xp_bucket[key] = now
        try:
            before = await database._db.xp.find_one({"guildId": guild.id, "userId": member.id})
            old_level = int((before or {}).get("level", 0) or 0)
            lo = max(1, int(cfg.get("xpMin", 15) or 15))
            hi = max(lo, min(int(cfg.get("xpMax", 25) or 25), 100))
            _, level, _, leveled = await levels.add_xp(
                database._db, guild.id, member.id, random.randint(lo, hi))
            if leveled and level > old_level:
                await self._handle_level_up(guild, member, old_level, level, message.channel)
        except Exception:
            log.exception("XP grant failed")

    @tasks.loop(seconds=60)
    async def voice_loop(self):
        """Grant XP to eligible voice members once a minute (voiceXp on)."""
        try:
            for guild in list(self.bot.guilds):
                try:
                    cfg = await levels.get_level_config(database._db, guild.id)
                except Exception:
                    continue
                if not cfg.get("voiceXp"):
                    continue
                amount = max(1, int(cfg.get("voiceXpAmount", 10) or 10))
                for channel in list(getattr(guild, "voice_channels", []) or []):
                    for member in list(getattr(channel, "members", []) or []):
                        try:
                            if getattr(member, "bot", False):
                                continue
                            vs = getattr(member, "voice", None)
                            if vs is None or getattr(vs, "deaf", False) or getattr(vs, "self_deaf", False):
                                continue
                            if levels.member_excluded(
                                    list(getattr(member, "roles", []) or []), 0, cfg) is not None:
                                continue
                            before = await database._db.xp.find_one(
                                {"guildId": guild.id, "userId": member.id})
                            old_level = int((before or {}).get("level", 0) or 0)
                            _, level, _, leveled = await levels.add_xp(
                                database._db, guild.id, member.id, amount)
                            if leveled and level > old_level:
                                await self._handle_level_up(guild, member, old_level, level, None)
                        except Exception:
                            continue
        except Exception:
            log.exception("Voice XP loop failed")

    @voice_loop.before_loop
    async def _voice_ready(self):
        try:
            await self.bot.wait_until_ready()
        except Exception:
            pass

    @app_commands.command(name="rank", description="Your level and XP in this server.")
    @app_commands.describe(user="Whose rank (default: you)")
    async def rank(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer()
        target = user or interaction.user
        doc = await database._db.xp.find_one(
            {"guildId": interaction.guild.id, "userId": target.id})
        xp = int((doc or {}).get("xp", 0))
        level, into, need = levels.level_from_xp(xp)
        e = embeds.embed(f"📊 {target.display_name}'s Rank",
                         f"**Level {level}** — {into}/{need} XP to Level {level + 1}", color=embeds.INFO)
        e.add_field(name="XP", value=f"{xp} total", inline=True)
        e.add_field(name="Progress", value=embeds.bar(into, need, width=10), inline=False)
        if target.display_avatar:
            e.set_thumbnail(url=target.display_avatar.url)
        await interaction.followup.send(embed=e)

    board = app_commands.Group(name="leaderboard", description="Ranked boards: XP, wealth, items")

    @board.command(name="stats", description="Leaderboard for XP or wealth (scope: server).")
    @app_commands.describe(board="Which board", page="Page number", scope="Scope (server)")
    @app_commands.choices(board=[
        app_commands.Choice(name="xp", value="xp"),
        app_commands.Choice(name="net worth", value="net"),
        app_commands.Choice(name="pocket", value="balance"),
        app_commands.Choice(name="gems", value="gems"),
    ])
    async def board_stats(self, interaction: discord.Interaction, board: str = "xp",
                          page: int = 1, scope: str = "server"):
        await interaction.response.defer()
        page = max(1, int(page or 1))
        if board == "xp":
            docs = await levels.top_xp(interaction.guild.id, 10, (page - 1) * 10)
            if not docs:
                await interaction.followup.send("No XP earned yet — start chatting!")
                return
            medals = ["🥇", "🥈", "🥉"] + ["▫️"] * 7
            lines = []
            for i, d in enumerate(docs):
                xp = int(d.get("xp", 0))
                level, into, need = levels.level_from_xp(xp)
                rank = (page - 1) * 10 + i + 1
                medal = medals[i] if page == 1 and i < 3 else f"`{rank}.`"
                name, uid = await levels.display_name_for(interaction.guild, d.get('userId'))
                lines.append(f"{medal} **{name}** (<@{uid}>) — **Level {level}** ({xp} XP, {need - into} to go)")
            await interaction.followup.send(embed=embeds.embed(
                f"🏆 XP Leaderboard (p{page})", "\n".join(lines), embeds.GOLD))
            return
        import economy as eco
        by = {"balance": "balance", "gems": "gems"}.get(board, "net")
        rows = await eco.top_wallets(database._db, interaction.guild.id, by, 10, (page - 1) * 10)
        if not rows:
            await interaction.followup.send("No holders yet.", ephemeral=True)
            return
        medals = ["🥇", "🥈", "🥉"]
        lines = []
        for i, row in enumerate(rows):
            rank = (page - 1) * 10 + i + 1
            medal = medals[i] if page == 1 and i < 3 else f"`{rank}.`"
            val = (f"💎 {int(row.get('gems', 0))}" if by == "gems"
                   else f"**{int(row.get('balance', 0)):,}**" if by == "balance"
                   else f"**{int(row.get('balance', 0)) + int(row.get('bank', 0)):,}**")
            name, uid = await levels.display_name_for(interaction.guild, row.get('userId'))
            lines.append(f"{medal} **{name}** (<@{uid}>) — {val}")
        await interaction.followup.send(embed=embeds.embed(
            f"🏆 {by} · p{page}", "\n".join(lines), embeds.GOLD))

    @board.command(name="item", description="Item ownership leaderboard.")
    @app_commands.describe(item="Item ID", page="Page number")
    async def board_item(self, interaction: discord.Interaction, item: str, page: int = 1):
        await interaction.response.defer()
        import economy as eco
        item_id = (item or "").strip().lower()
        if item_id not in eco.ITEMS:
            await interaction.followup.send("Unknown item.", ephemeral=True)
            return
        page = max(1, int(page or 1))
        try:
            cur = database._db.economy_inv.find(
                {"guildId": int(interaction.guild.id), f"items.{item_id}": {"$gte": 1}})
            rows = await cur.sort(f"items.{item_id}", -1).skip((page - 1) * 10).limit(10).to_list(10)
        except Exception:
            rows = []
        if not rows:
            await interaction.followup.send("Nobody holds that item.", ephemeral=True)
            return
        lines = []
        for i, r in enumerate(rows):
            name, uid = await levels.display_name_for(interaction.guild, r.get('userId'))
            lines.append(f"`{i + 1 + (page - 1) * 10}.` **{name}** (<@{uid}>) — **{(r.get('items') or {}).get(item_id, 0)}x**")
        await interaction.followup.send(embed=embeds.embed(
            f"🏆 {eco.ITEMS[item_id]['name']} holders · p{page}", "\n".join(lines), embeds.GOLD))

    # ── Economy ───────────────────────────────────────────────────────
    async def _wallet(self, guild_id: int, user_id: int) -> dict:
        return await database._db.economy.find_one_and_update(
            {"guildId": guild_id, "userId": user_id},
            {"$setOnInsert": {"balance": 100}}, upsert=True, return_document=True,
        )

    @app_commands.command(name="balance", description="Pocket, bank, net worth, gems (history flag for log).")
    @app_commands.describe(user="Whose balance (default: you)",
                           history="Show recent transactions instead of just totals")
    async def balance(self, interaction: discord.Interaction, user: discord.User | None = None,
                      history: bool = False):
        await interaction.response.defer()
        target = user or interaction.user
        try:
            import economy as eco
            if history:
                rows = await eco.currency_log(
                    database._db, interaction.guild.id, target.id, 10, 0)
                if not rows:
                    await interaction.followup.send("No transactions yet.", ephemeral=True)
                    return
                lines = []
                for r in rows:
                    at = r.get("createdAt")
                    stamp = at.strftime("%m-%d %H:%M") if hasattr(at, "strftime") else "?"
                    amt = int(r.get("amount", 0))
                    lines.append(f"`{r.get('txId', '?')[:8]}` {stamp} **{r.get('type')}** "
                                 f"{'+' if amt > 0 else ''}{amt}")
                await interaction.followup.send(embed=embeds.embed(
                    f"🧾 Currency log — {getattr(target, 'display_name', 'you')}",
                    "\n".join(lines) + "\n\nImmutable audit trail (see also `/profile`).",
                    embeds.INFO))
                return
            wallet = await eco.get_wallet(database._db, interaction.guild.id, target.id)
            cfg = await eco.get_economy_config(database._db, interaction.guild.id)
            sym = str(cfg.get("currencySymbol", "🪙"))
            name = str(cfg.get("currencyName", "coins"))
            pocket = int(wallet.get("balance", 0))
            bank = int(wallet.get("bank", 0))
            gems = int(wallet.get("gems", 0))
            net = pocket + bank
            e = embeds.embed(f"💰 Balance — {getattr(target, 'display_name', target.name)}",
                             f"{sym} Pocket **{pocket:,}** {name}\n"
                             f"🏦 Bank **{bank:,}**\n"
                             f"💎 Gems **{gems}**\n"
                             f"📊 Net worth **{net:,}** · Level **{eco.economy_level(wallet)}** · "
                             f"🔥 Prestige **{int(wallet.get('prestige', 0))}** · "
                             f"Daily streak **{int(wallet.get('streakDaily', 0))}**",
                             embeds.GOLD)
            await interaction.followup.send(embed=e)
        except Exception:
            wallet = await self._wallet(interaction.guild.id, target.id)
            await interaction.followup.send(embed=embeds.embed(
                "💰 Balance",
                f"{target.mention} has **{int(wallet.get('balance', 0))}** coins"
                f" (+**{int(wallet.get('bank', 0))}** bank).", embeds.GOLD))

    @app_commands.command(name="daily", description="Claim your daily coins (streak bonus).")
    async def daily(self, interaction: discord.Interaction):
        await interaction.response.defer()
        try:
            import economy as eco
            cfg = await eco.get_economy_config(database._db, interaction.guild.id)
            granted, final, streak, remaining = await eco.claim_daily(
                database._db, interaction.guild.id, interaction.user.id,
                int(cfg.get("dailyAmount", 250)))
            if granted:
                await interaction.followup.send(embed=embeds.ok(
                    "🎁 Daily claimed!", f"+**{final:,}** coins · streak **{streak}** 🔥"))
            else:
                hours, rest = divmod(remaining, 3600)
                await interaction.followup.send(embed=embeds.embed(
                    "⏳ Already claimed",
                    f"Streak **{streak}** — back in {hours}h {rest // 60}m.",
                    embeds.WARN))
            return
        except Exception:
            pass
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=24)
        await database._db.economy.update_one(
            {"guildId": interaction.guild.id, "userId": interaction.user.id},
            {"$setOnInsert": {"balance": 100, "lastDaily": now - timedelta(days=2)}},
            upsert=True)
        res = await database._db.economy.update_one(
            {"guildId": interaction.guild.id, "userId": interaction.user.id,
             "$or": [{"lastDaily": None}, {"lastDaily": {"$lte": cutoff}}]},
            {"$inc": {"balance": 250, "streakDaily": 1}, "$set": {"lastDaily": now}})
        if res.modified_count:
            await interaction.followup.send(embed=embeds.ok(
                "🎁 Daily claimed!", "+**250** coins — come back tomorrow."))
        else:
            await interaction.followup.send(embed=embeds.embed(
                "⏳ Already claimed", "Your daily coins reset every 24 hours.", embeds.WARN))

    @app_commands.command(name="pay", description="Send coins to another member.")
    @app_commands.describe(user="Recipient", amount="How many coins")
    async def pay(self, interaction: discord.Interaction, user: discord.Member, amount: int):
        await interaction.response.defer()
        if amount < 1:
            await interaction.followup.send("Amount must be positive.", ephemeral=True)
            return
        if user.id == interaction.user.id:
            await interaction.followup.send("You can't pay yourself.", ephemeral=True)
            return
        sender = await database._db.economy.find_one(
            {"guildId": interaction.guild.id, "userId": interaction.user.id})
        if not sender or sender.get("balance", 0) < amount:
            await interaction.followup.send("Insufficient funds.", ephemeral=True)
            return
        # Atomic guarded debit: only succeeds while the balance still covers
        # the amount, so concurrent pays can't drive a negative balance.
        res = await database._db.economy.update_one(
            {"guildId": interaction.guild.id, "userId": interaction.user.id,
             "balance": {"$gte": amount}},
            {"$inc": {"balance": -amount}})
        if not res.modified_count:
            await interaction.followup.send("Insufficient funds (spent it elsewhere).", ephemeral=True)
            return
        await database._db.economy.update_one(
            {"guildId": interaction.guild.id, "userId": user.id},
            {"$inc": {"balance": amount}}, upsert=True)
        await interaction.followup.send(embed=embeds.ok(
            "💸 Payment sent", f"{interaction.user.mention} → {user.mention}: **{amount}** coins."))

    # ── /level administration + cards ─────────────────────────────────
    level = app_commands.Group(name="level", description="Leveling administration and cards")

    def _deny(self, interaction: discord.Interaction) -> bool:
        return not _is_manager(interaction)

    @level.command(name="config", description="Show leveling configuration (Manage Server).")
    async def level_config(self, interaction: discord.Interaction):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        cfg = await levels.get_level_config(database._db, interaction.guild.id)
        lines = [f"XP range: **{cfg['xpMin']}–{cfg['xpMax']}** per message",
                 f"Cooldown: **{cfg['xpCooldownSec']}s**",
                 f"Voice XP: **{'on' if cfg['voiceXp'] else 'off'}** (+{cfg['voiceXpAmount']}/min)",
                 f"Blacklisted channels: **{len(cfg['blacklistedChannels'])}**",
                 f"Blacklisted roles: **{len(cfg['blacklistedRoles'])}**",
                 f"Announce channel: **{cfg['levelUpChannelId'] or 'current'}**",
                 f"DM notify: **{bool(cfg['dmNotify'])}** · min level **{cfg['announceMinLevel']}**",
                 "Configure everything (rates, messages, rewards, card) in the dashboard → Leveling."]
        await interaction.response.send_message(embed=embeds.embed(
            "📈 Leveling Config", "\n".join(lines), embeds.INFO), ephemeral=True)

    @level.command(name="set_message_xp", description="Set/reset the XP range (Manage Server).")
    @app_commands.describe(action="set or reset", xp="Minimum XP when setting")
    @app_commands.choices(action=[
        app_commands.Choice(name="set", value="set"),
        app_commands.Choice(name="reset", value="reset"),
    ])
    async def set_message_xp(self, interaction: discord.Interaction, action: str, xp: int = 15):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        lo, hi = (15, 25) if action != "set" else (max(1, min(int(xp or 15), 100)), 100)
        if action == "set" and not 1 <= int(xp or 0) <= 100:
            await interaction.response.send_message("XP must be 1–100.", ephemeral=True)
            return
        await self._save_level_cfg(interaction, {"xpMin": lo, "xpMax": hi})
        await interaction.response.send_message(f"XP range → **{lo}–{hi}**.", ephemeral=True)

    @level.command(name="add_xp", description="Add XP to a member (Manage Server).")
    @app_commands.describe(xp="1–1000 XP", member="Target member")
    async def add_xp(self, interaction: discord.Interaction, xp: int, member: discord.Member):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        amount = max(1, min(int(xp or 0), 1000))
        if not 1 <= int(xp or 0) <= 1000:
            await interaction.response.send_message("XP must be 1–1000.", ephemeral=True)
            return
        _, level, _, leveled = await levels.add_xp(
            database._db, interaction.guild.id, member.id, amount)
        if leveled:
            await self._handle_level_up(interaction.guild, member, level - 1, level, interaction.channel)
        await interaction.response.send_message(
            f"Added **{amount}** XP to {member.mention} (Level **{level}**).", ephemeral=True)

    @level.command(name="set_level", description="Set a member's level (Manage Server).")
    @app_commands.describe(level="1–100", member="Target member")
    async def set_level(self, interaction: discord.Interaction, level: int, member: discord.Member):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        if not 1 <= int(level or 0) <= 100:
            await interaction.response.send_message("Level must be 1–100.", ephemeral=True)
            return
        _, level = await levels.set_level(database._db, interaction.guild.id, member.id, int(level))
        await interaction.response.send_message(
            f"{member.mention} is now Level **{level}**.", ephemeral=True)

    @level.command(name="blacklist", description="Blacklist channels/roles from XP (Manage Server).")
    @app_commands.describe(action="add or remove", target="Channel or role ID (picker via dashboard)")
    @app_commands.choices(action=[
        app_commands.Choice(name="add", value="add"),
        app_commands.Choice(name="remove", value="remove"),
    ])
    async def blacklist(self, interaction: discord.Interaction, action: str, target: str):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        target = (target or "").strip()
        if not target.isdigit():
            await interaction.response.send_message(
                "Give a channel or role ID — or pick from the dashboard Leveling selectors (no IDs needed there).",
                ephemeral=True)
            return
        cfg = await levels.get_level_config(database._db, interaction.guild.id)
        channels = {str(c) for c in (cfg.get("blacklistedChannels") or [])}
        roles = {str(r) for r in (cfg.get("blacklistedRoles") or [])}
        guild = interaction.guild
        is_channel = guild.get_channel(int(target)) is not None
        pool, key = (channels, "blacklistedChannels") if is_channel else (roles, "blacklistedRoles")
        if action == "add":
            pool.add(target)
        else:
            pool.discard(target)
        await self._save_level_cfg(interaction, {key: sorted(pool)})
        await interaction.response.send_message(
            f"{'Channel' if is_channel else 'Role'} `{target}` {'blacklisted' if action == 'add' else 'unblocked'}.",
            ephemeral=True)

    @level.command(name="rate", description="Configure XP rate/cooldown (Manage Server).")
    @app_commands.describe(rate="Max XP per message 1–100", cooldown="Cooldown seconds 5–3600")
    async def rate(self, interaction: discord.Interaction, rate: int = 25, cooldown: int = 60):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        await self._save_level_cfg(interaction, {
            "xpMax": max(1, min(int(rate or 25), 100)),
            "xpCooldownSec": max(5, min(int(cooldown or 60), 3600))})
        await interaction.response.send_message("XP rate updated.", ephemeral=True)

    @level.command(name="reset", description="Reset XP: one member or the whole server (Manage Server).")
    @app_commands.describe(choice="member or server", member="Target member for member reset")
    @app_commands.choices(choice=[
        app_commands.Choice(name="member", value="member"),
        app_commands.Choice(name="server", value="server"),
    ])
    async def reset(self, interaction: discord.Interaction, choice: str,
                    member: discord.Member | None = None):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        if choice == "server":
            count = await levels.reset_guild(database._db, interaction.guild.id)
            await interaction.response.send_message(
                f"Server XP reset (**{count}** rows; backup kept, `/level restore` to undo).")
            return
        if member is None:
            await interaction.response.send_message("Pick a member to reset.", ephemeral=True)
            return
        await levels.reset_member(database._db, interaction.guild.id, member.id)
        await interaction.response.send_message(f"{member.mention}'s XP was reset.", ephemeral=True)

    @level.command(name="restore", description="Restore the last XP backup (Manage Server).")
    async def restore(self, interaction: discord.Interaction):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        ok, count = await levels.restore_guild(database._db, interaction.guild.id)
        await interaction.response.send_message(
            f"Restored **{count}** rows from backup." if ok else "No backup available.",
            ephemeral=True)

    @level.command(name="voice_xp", description="Toggle voice-activity XP (Manage Server).")
    async def voice_xp(self, interaction: discord.Interaction):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        cfg = await levels.get_level_config(database._db, interaction.guild.id)
        await self._save_level_cfg(interaction, {"voiceXp": not cfg.get("voiceXp")})
        await interaction.response.send_message(
            f"Voice XP **{'ON' if not cfg.get('voiceXp') else 'OFF'}**.", ephemeral=True)

    @level.command(name="message", description="Set/reset the level-up message (Manage Server).")
    @app_commands.describe(choice="set or reset", message="Use {user} {level} {xp}")
    @app_commands.choices(choice=[
        app_commands.Choice(name="set", value="set"),
        app_commands.Choice(name="reset", value="reset"),
    ])
    async def message_cfg(self, interaction: discord.Interaction, choice: str, message: str = ""):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        text = (message or "")[:300] if choice == "set" else levels.LEVEL_DEFAULTS["levelUpMessage"]
        await self._save_level_cfg(interaction, {"levelUpMessage": text})
        await interaction.response.send_message(f"Level-up message → `{text}`", ephemeral=True)

    @level.command(name="toggle", description="DM notifications / reward replacement (Manage Server).")
    @app_commands.describe(choice="dm or replace")
    @app_commands.choices(choice=[
        app_commands.Choice(name="dm", value="dm"),
        app_commands.Choice(name="replace", value="replace"),
    ])
    async def toggle(self, interaction: discord.Interaction, choice: str):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        cfg = await levels.get_level_config(database._db, interaction.guild.id)
        key = "dmNotify" if choice == "dm" else "rewardReplace"
        await self._save_level_cfg(interaction, {key: not cfg.get(key)})
        await interaction.response.send_message(f"`{key}` → **{not cfg.get(key)}**.", ephemeral=True)

    @level.command(name="channel", description="Set the level-up channel (Manage Server).")
    @app_commands.describe(channel="Announcement channel (empty = current)")
    async def channel_cfg(self, interaction: discord.Interaction,
                          channel: discord.TextChannel | None = None):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        await self._save_level_cfg(interaction, {"levelUpChannelId": str(channel.id) if channel else ""})
        await interaction.response.send_message(
            f"Level-up channel → {channel.mention if channel else 'current channel'}.",
            ephemeral=True)

    @level.command(name="limit", description="Only announce above a level (Manage Server).")
    @app_commands.describe(limit="Minimum level, 1+ (1 = announce all)")
    async def limit(self, interaction: discord.Interaction, limit: int = 1):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        await self._save_level_cfg(interaction, {"announceMinLevel": max(1, int(limit or 1))})
        await interaction.response.send_message("Announcement limit updated.", ephemeral=True)

    @level.command(name="mod", description="Only announce divisible levels (Manage Server).")
    @app_commands.describe(number="0 = every level, else announce levels divisible by this")
    async def mod(self, interaction: discord.Interaction, number: int = 0):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        await self._save_level_cfg(interaction, {"announceMod": max(0, int(number or 0))})
        await interaction.response.send_message("Announcement divisor updated.", ephemeral=True)

    @level.command(name="rewardonly", description="Only announce rewarded level-ups (Manage Server).")
    async def rewardonly(self, interaction: discord.Interaction):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        cfg = await levels.get_level_config(database._db, interaction.guild.id)
        await self._save_level_cfg(interaction, {"rewardOnly": not cfg.get("rewardOnly")})
        await interaction.response.send_message(
            f"Reward-only announcements **{'ON' if not cfg.get('rewardOnly') else 'OFF'}**.",
            ephemeral=True)

    @level.command(name="leaderboard", description="XP leaderboard with requirements.")
    @app_commands.describe(page="Page number")
    async def level_board(self, interaction: discord.Interaction, page: int = 1):
        await interaction.response.defer()
        page = max(1, int(page or 1))
        docs = await levels.top_xp(interaction.guild.id, 10, (page - 1) * 10)
        if not docs:
            await interaction.followup.send("No XP earned yet — start chatting!")
            return
        lines = []
        for i, d in enumerate(docs):
            xp = int(d.get("xp", 0))
            level, into, need = levels.level_from_xp(xp)
            rank = (page - 1) * 10 + i + 1
            medal = ["🥇", "🥈", "🥉"][i] if page == 1 and i < 3 else f"`{rank}.`"
            name, uid = await levels.display_name_for(interaction.guild, d.get('userId'))
            lines.append(f"{medal} **{name}** (<@{uid}>) — **Lv{level}** ({xp} XP, {need - into} to go)")
        await interaction.followup.send(embed=embeds.embed(
            f"🏆 XP Leaderboard (p{page})", "\n".join(lines), embeds.GOLD))

    @level.command(name="log", description="Latest level-up events (Manage Server).")
    async def log(self, interaction: discord.Interaction):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        rows = await levels.recent_level_ups(database._db, interaction.guild.id, 10)
        if not rows:
            await interaction.followup.send("No level-ups recorded yet.", ephemeral=True)
            return
        lines = []
        for r in rows:
            at = r.get("at")
            stamp = at.strftime("%m-%d %H:%M") if hasattr(at, "strftime") else "?"
            name, uid = await levels.display_name_for(interaction.guild, r.get('userId'))
            lines.append(f"**{name}** (<@{uid}>) **{r.get('oldLevel')}→{r.get('newLevel')}** · {stamp}")
        await interaction.followup.send(embed=embeds.embed(
            "📜 Level-up Log", "\n".join(lines), embeds.INFO), ephemeral=True)

    @level.command(name="reward", description="Assign/remove a level role reward (Manage Server).")
    @app_commands.describe(level="Level 1–100", role="Role (empty = remove reward)")
    async def reward(self, interaction: discord.Interaction, level: int,
                     role: discord.Role | None = None):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        if not 1 <= int(level or 0) <= 100:
            await interaction.response.send_message("Level must be 1–100.", ephemeral=True)
            return
        if role is None:
            cfg = await levels.get_level_config(database._db, interaction.guild.id)
            rewards = dict(cfg.get("rewards") or {})
            rewards.pop(str(int(level)), None)
            await self._save_level_cfg(interaction, {"rewards": rewards})
            await interaction.response.send_message(f"Reward for level **{level}** removed.",
                                                    ephemeral=True)
            return
        me = interaction.guild.me
        try:
            unmanageable = (
                bool(getattr(role, "managed", False))
                or int(getattr(role, "id", -1)) == int(interaction.guild.id)
            )
        except Exception:
            await interaction.response.send_message(
                "That role couldn't be resolved.", ephemeral=True)
            return
        if unmanageable:
            await interaction.response.send_message("That role can't be assigned.", ephemeral=True)
            return
        try:
            bot_top = getattr(me, "top_role", None)
            can_manage = (
                me is not None
                and bool(getattr(me.guild_permissions, "manage_roles", False))
                and bot_top is not None
                and role < bot_top
            )
        except Exception:
            can_manage = False
        if not can_manage:
            await interaction.response.send_message(
                "I can't manage that role (above me or missing Manage Roles).", ephemeral=True)
            return
        cfg = await levels.get_level_config(database._db, interaction.guild.id)
        rewards = dict(cfg.get("rewards") or {})
        rewards[str(int(level))] = str(role.id)
        await self._save_level_cfg(interaction, {"rewards": rewards})
        await interaction.response.send_message(
            f"Level **{level}** → {role.mention}.", ephemeral=True)

    @level.command(name="member", description="Show a member's level card.")
    @app_commands.describe(member="Whose card (default: you)")
    async def member(self, interaction: discord.Interaction, member: discord.Member | None = None):
        await interaction.response.defer()
        target = member or interaction.user
        doc = await database._db.xp.find_one(
            {"guildId": interaction.guild.id, "userId": target.id}) or {}
        xp = int(doc.get("xp", 0))
        level, into, need = levels.level_from_xp(xp)
        try:
            higher = await database._db.xp.count_documents(
                {"guildId": interaction.guild.id, "xp": {"$gt": xp}})
            rank = higher + 1
        except Exception:
            rank = 0
        cfg = await levels.get_level_config(database._db, interaction.guild.id)
        avatar_bytes, personal_bytes = None, None
        try:
            import aiohttp
            timeout = aiohttp.ClientTimeout(total=8)

            async def fetch_bytes(url: str | None, limit: int) -> bytes | None:
                if not url or not url.startswith("http"):
                    return None
                try:
                    async with aiohttp.ClientSession(timeout=timeout) as session:
                        async with session.get(url) as resp:
                            if resp.status != 200:
                                return None
                            data = await resp.read()
                            return data if len(data) <= limit else None
                except Exception:
                    return None

            try:
                avatar_bytes = await fetch_bytes(target.display_avatar.url, 500_000)
            except Exception:
                avatar_bytes = None
            personal = ""
            try:
                personal = str((await database._db.xp.find_one(
                    {"guildId": interaction.guild.id, "userId": target.id}) or {}).get("backgroundUrl") or "")
            except Exception:
                personal = ""
            personal_bytes = await fetch_bytes(personal, 2_000_000)
        except Exception:
            personal_bytes = None
        # Member image wins; otherwise the server's imported picture asset
        # (an id like "duck-toast" — legacy theme ids and old URL values
        # resolve to the default asset and are never fetched).
        server_theme = levels.resolve_server_background(cfg.get("serverBackground"))
        kind, payload = levels.render_level_card(
            getattr(target, "display_name", "member"), avatar_bytes, level, into, need, rank,
            accent=str(cfg.get("cardColor") or "#5865F2"),
            opacity=float(cfg.get("cardOpacity", 1.0) or 1.0),
            background_bytes=personal_bytes,
            background_id=None if personal_bytes else server_theme)
        if kind == "png":
            import io as _io
            await interaction.followup.send(
                file=discord.File(_io.BytesIO(payload), filename="level.png"))
        else:
            await interaction.followup.send(embed=embeds.embed(
                f"📊 {getattr(target, 'display_name', 'member')} — Level {level} (rank #{rank})",
                payload.decode("utf-8", "replace"), embeds.INFO))

    @level.command(name="background", description="Set your personal card background (URL).")
    @app_commands.describe(link="Direct image URL (empty = reset)")
    async def background(self, interaction: discord.Interaction, link: str = ""):
        link = (link or "").strip()[:300]
        if link and (not link.startswith("http") or len(link) < 12):
            await interaction.response.send_message("Give a direct image URL, or empty to reset.",
                                                    ephemeral=True)
            return
        await database._db.xp.update_one(
            {"guildId": interaction.guild.id, "userId": interaction.user.id},
            {"$set": {"backgroundUrl": link}}, upsert=True)
        await interaction.response.send_message(
            "Personal background updated." if link else "Personal background reset.",
            ephemeral=True)

    @level.command(name="serverbackground", description="Set the server card background (Manage Server).")
    @app_commands.describe(theme="Imported picture background")
    @app_commands.choices(theme=[
        app_commands.Choice(name="🍞 Duck & Toast", value="duck-toast"),
        app_commands.Choice(name="🌱 Meadow Friend", value="frog-meadow"),
        app_commands.Choice(name="🪷 Lily Pond", value="frog-pond"),
        app_commands.Choice(name="🐠 Goldfish Glow", value="goldfish-glass"),
        app_commands.Choice(name="🌌 Starry Companion", value="starry-duck"),
        app_commands.Choice(name="🐤 Lily Rest", value="chick-lily"),
        app_commands.Choice(name="🐸 Sky Gaze", value="frog-sky"),
        app_commands.Choice(name="🌅 Pixel Sunset", value="pixel-sunset"),
    ])
    async def serverbackground(self, interaction: discord.Interaction, theme: str):
        if self._deny(interaction):
            await interaction.response.send_message("Manage Server only.", ephemeral=True)
            return
        theme_id = levels.resolve_server_background(theme)
        await self._save_level_cfg(interaction, {"serverBackground": theme_id})
        meta = levels.server_background_meta(theme_id)
        await interaction.response.send_message(
            f"{meta.get('emoji', '🎨')} **{meta.get('name', theme_id)}** — "
            "server card background updated (member images still win).",
            ephemeral=True)

    async def _save_level_cfg(self, interaction: discord.Interaction, patch: dict) -> None:
        try:
            cfg = await levels.get_level_config(database._db, interaction.guild.id)
            cfg.update(patch)
            await database.set_guild_config(interaction.guild.id, {"leveling": cfg})
        except Exception:
            log.exception("Level config save failed")


def _is_manager(interaction: discord.Interaction) -> bool:
    try:
        perms = interaction.user.guild_permissions
        return bool(getattr(perms, "manage_guild", False) or getattr(perms, "administrator", False))
    except Exception:
        return False


async def setup(bot: commands.Bot):
    await bot.add_cog(LevelingCog(bot))
