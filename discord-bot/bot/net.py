"""Shared aiohttp session + subsystem status registry (for /status and /health)."""

import asyncio
import logging
import time
from typing import Any

import aiohttp

log = logging.getLogger("bot.http")

_session: aiohttp.ClientSession | None = None

# Subsystem health registry, updated by the checks below and by main.py.
_status: dict[str, str] = {
    "discord": "starting",
    "database": "starting",
    "movies": "starting",
    "music": "starting",
    "site_bridge": "starting",
}


def set_status(name: str, value: str) -> None:
    _status[name] = value


def get_status() -> dict[str, str]:
    return dict(_status)


async def init() -> None:
    global _session
    if _session is None or _session.closed:
        _session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=15),
            connector=aiohttp.TCPConnector(limit=20, ttl_dns_cache=300),
        )


async def close() -> None:
    global _session
    if _session and not _session.closed:
        await _session.close()
    _session = None


def session() -> aiohttp.ClientSession:
    if _session is None or _session.closed:
        raise RuntimeError("HTTP session not initialized — bot.main calls http.init() first")
    return _session


async def get_json(url: str, params: dict | None = None,
                   headers: dict | None = None) -> tuple[int, Any | None]:
    """GET returning (status, json-or-None); never raises."""
    try:
        async with session().get(url, params=params, headers=headers) as resp:
            if resp.content_type == "application/json":
                return resp.status, await resp.json()
            return resp.status, None
    except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
        log.debug("GET %s failed: %s", url.split("?")[0], exc)
        return 0, None


async def post_json(url: str, payload: dict,
                    headers: dict | None = None) -> tuple[int, Any | None]:
    """POST returning (status, json-or-None); never raises."""
    try:
        async with session().post(url, json=payload, headers=headers) as resp:
            if resp.content_type == "application/json":
                return resp.status, await resp.json()
            return resp.status, None
    except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
        log.debug("POST %s failed: %s", url.split("?")[0], exc)
        return 0, None
