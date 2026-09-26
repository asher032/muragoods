"""NaN-safe gateway helpers shared by the health server and every cog.

`discord.Client.latency` is **NaN** until the gateway WebSocket has completed
its first heartbeat exchange — and again during (re)connects. NaN is truthy in
Python, so the old guard

    round(bot.latency * 1000) if bot.latency else 0

failed and raised ``ValueError: cannot convert float NaN to integer``. On
Render that crashed ``/health`` every 10 seconds (health probe → 500 →
``update_failed`` → zero healthy instances), which is what took the bot
offline. Every latency read must go through :func:`gateway_latency_ms`.
"""

from __future__ import annotations

import math
from typing import Any, Optional


def gateway_latency_ms(client: Any, default: Optional[int] = 0) -> Optional[int]:
    """Gateway round-trip latency in whole milliseconds.

    Returns ``default`` whenever the value is not a finite float (NaN, ±inf,
    ``None``, missing attribute, non-numeric) so no caller can crash on a
    half-open gateway. ``default`` may be ``None`` for callers whose payload
    distinguishes "not measured" from "0 ms".
    """
    try:
        value = float(getattr(client, "latency", None))
    except (TypeError, ValueError):
        return default
    if not math.isfinite(value):
        return default
    return round(value * 1000)
