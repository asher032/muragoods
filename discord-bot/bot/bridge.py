"""MuraStream website bridge — shared session, authenticated /api/discord calls."""

# (party/request/comment helpers below call the site's /api/discord route)

import asyncio
import logging
import time
from typing import Any
from urllib.parse import quote_plus

import aiohttp

import config
import net as http

log = logging.getLogger("bot.bridge")

_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = asyncio.Lock()


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {config.BRIDGE_SECRET}"}


async def _get(path: str, params: dict[str, Any] | None = None, ttl: int = 60) -> Any | None:
    key = ("GET", path, repr(sorted((params or {}).items())))
    now = time.monotonic()
    async with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]
    status, data = await http.get_json(f"{config.MURASTREAM_URL}{path}",
                                       params=params, headers=_headers())
    if status == 200:
        http.set_status("site_bridge", "online")
        async with _cache_lock:
            _cache[key] = (time.monotonic(), data)
        return data
    if status in (401, 403):
        http.set_status("site_bridge", "auth-missing")
    elif status == 0:
        http.set_status("site_bridge", "offline")
    return None


async def _post(path: str, payload: dict[str, Any]) -> tuple[int, Any | None]:
    status, data = await http.post_json(f"{config.MURASTREAM_URL}{path}",
                                        payload, headers=_headers())
    if status == 200:
        http.set_status("site_bridge", "online")
    return status, data


# ── URL builders (all point at the configured site) ──────────────────────
def watch_url(media_type: str, tmdb_id: int, season: int = 1, episode: int = 1) -> str:
    return (f"{config.MURASTREAM_URL}/murastream/watch?type={media_type}"
            f"&id={int(tmdb_id)}&season={int(season)}&episode={int(episode)}")


def details_url(media_type: str, tmdb_id: int) -> str:
    return f"{config.MURASTREAM_URL}/murastream/{'movie' if media_type == 'movie' else 'tv'}/{int(tmdb_id)}"


def search_url(query: str) -> str:
    return f"{config.MURASTREAM_URL}/murastream/search?q={quote_plus(query)}"


def party_url(code: str, media_type: str, tmdb_id: int,
              season: int = 1, episode: int = 1) -> str:
    return (f"{config.MURASTREAM_URL}/murastream/watch?type={media_type}&id={int(tmdb_id)}"
            f"&season={int(season)}&episode={int(episode)}&party={quote_plus(code)}&partyPanel=1")


def requests_url() -> str:
    return f"{config.MURASTREAM_URL}/murastream/requests"


def profile_url() -> str:
    return f"{config.MURASTREAM_URL}/account/profile"


def home_url() -> str:
    return config.MURASTREAM_URL


# ── Watch Together rooms ─────────────────────────────────────────────────
async def create_party(host_name: str, state: dict[str, Any]) -> str | None:
    """Create a watch party via the site bridge. Returns the party code."""
    status, data = await _post("/api/discord", {
        "action": "party", "hostName": host_name, "state": state,
    })
    if status in (200, 201) and isinstance(data, dict):
        d = data.get("data") or {}
        code = d.get("code")
        return str(code) if code else None
    return None


async def get_party(code: str) -> dict[str, Any] | None:
    return await _get("/api/discord", {"action": "party", "code": code}, ttl=5)


# ── Site-side media requests (persistent across bot restarts) ────────────
async def create_site_request(user: str, title: str, media_type: str, note: str) -> dict[str, Any] | None:
    status, data = await _post("/api/discord", {
        "action": "request", "user": user, "title": title,
        "type": media_type, "note": note,
    })
    if status in (200, 201) and isinstance(data, dict):
        return data.get("data") if isinstance(data.get("data"), dict) else {}
    return None


# ── Recent comments for a title ──────────────────────────────────────────
async def recent_comments(media_type: str, media_id: int, limit: int = 5) -> list[dict[str, Any]]:
    data = await _get("/api/discord", {
        "action": "comments", "type": media_type, "id": media_id, "limit": limit,
    }, ttl=30)
    if isinstance(data, dict):
        items = data.get("comments") or []
        return items if isinstance(items, list) else []
    return []
