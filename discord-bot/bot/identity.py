"""Canonical identity: one Muragoods user behind every Discord account.

The ecosystem has exactly ONE identity system — the Muragoods account. This
module does not add a second login, a second user table or a second source of
truth for "who is this person". It answers a single question:

    given a Discord snowflake, what is the canonical Muragoods userId?

and it answers it by ASKING the site, which owns that identity, over the
existing authenticated bridge. There is no fallback that invents a local
account, because inventing one is exactly how a second identity system
appears.

Deliberate design points:

* **The Discord snowflake stays the operational key.** Economy rows are keyed
  `{guildId, userId}` where userId is the snowflake, and that is unchanged.
  Re-keying the economy would mean rewriting live balances, inventories and
  transaction history for no functional gain, against a database we cannot
  test. The canonical id is carried ALONGSIDE, as `canonicalUserId`, so the
  reference exists and is auditable without a destructive migration.
* **Discord usernames are never the identity.** A snowflake is stable; a
  username can be changed or deleted, and two accounts can share a legacy name.
* **Caching is bounded and short.** A link can be created or revoked from the
  site at any moment; a long TTL would serve a revoked link. Failures are
  cached too, briefly, so a site outage does not turn every command into a
  hanging HTTP call.
* **Nothing here ever raises into a command.** A missing canonical id is a
  normal state (the member has not linked Discord yet), not an error.
"""

import logging
import time
from typing import Any

import config
import net as http

log = logging.getLogger("bot.identity")

#: How long a resolved (or unresolved) link is reused. Short enough that a
#: revoke on the site takes effect quickly, long enough that a busy command
#: does not make an HTTP call per invocation.
CACHE_TTL_SEC = 300

#: How long a FAILED lookup is cached. Prevents a site outage from turning
#: every command that touches identity into a serial multi-second stall.
FAILURE_TTL_SEC = 30

_cache: dict[int, tuple[float, str | None]] = {}


def _now() -> float:
    return time.monotonic()


def invalidate(discord_user_id: int | None = None) -> None:
    """Drop a cached link (all of them when no id is given).

    Call this after a member links or unlinks from the site so the change is
    visible immediately instead of after the TTL.
    """
    if discord_user_id is None:
        _cache.clear()
        return
    _cache.pop(int(discord_user_id), None)


def _cached(discord_user_id: int) -> tuple[float, str | None] | None:
    hit = _cache.get(discord_user_id)
    if hit and hit[0] > _now():
        return hit
    return None


def _store(discord_user_id: int, canonical: str | None, ttl: float) -> None:
    _cache[discord_user_id] = (_now() + ttl, canonical)
    # Bounded so a large guild cannot grow this without limit; a linked or
    # unlinked member re-resolves on their next command.
    if len(_cache) > 10_000:
        cutoff = _now()
        for key in [k for k, (exp, _) in _cache.items() if exp <= cutoff]:
            _cache.pop(key, None)


def canonical_user_id(discord_user_id: int) -> str | None:
    """The Muragoods userId for a Discord account, or None if not linked.

    Returns a STRING because the canonical id is an opaque site identifier —
    the bot must not assume it is a number, a snowflake, or anything it could
    accidentally coerce.
    """
    if not discord_user_id:
        return None

    hit = _cached(int(discord_user_id))
    if hit is not None:
        return hit[1]

    if not config.BRIDGE_SECRET:
        # No bridge configured: unlinked is the honest answer, and caching it
        # briefly stops a hot path retrying a bridge that cannot exist.
        _store(int(discord_user_id), None, FAILURE_TTL_SEC)
        return None

    try:
        status, data = http.get_json(
            f"{config.MURASTREAM_URL}/api/discord/identity",
            params={"discordId": str(discord_user_id)},
            headers={"Authorization": f"Bearer {config.BRIDGE_SECRET}"},
        )
    except Exception:
        log.debug("identity lookup failed for %s", discord_user_id, exc_info=True)
        _store(int(discord_user_id), None, FAILURE_TTL_SEC)
        return None

    if status != 200 or not isinstance(data, dict):
        _store(int(discord_user_id), None, FAILURE_TTL_SEC)
        return None

    canonical = data.get("canonicalUserId")
    if not data.get("linked") or not isinstance(canonical, str) or not canonical.strip():
        # 200 with linked:false is the "not linked" answer, not a failure, so
        # it gets the long TTL — otherwise an unlinked member costs an HTTP
        # call on every single command.
        _store(int(discord_user_id), None, CACHE_TTL_SEC)
        return None

    canonical = canonical.strip()
    _store(int(discord_user_id), canonical, CACHE_TTL_SEC)
    return canonical


def is_linked(discord_user_id: int) -> bool:
    return canonical_user_id(discord_user_id) is not None


def identity_record(discord_user_id: int) -> dict[str, Any]:
    """A small, log-safe summary. Contains no token and no credential."""
    return {
        "discordId": str(discord_user_id) if discord_user_id else None,
        "canonicalUserId": canonical_user_id(discord_user_id),
    }
