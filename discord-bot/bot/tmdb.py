"""TMDB metadata via the site's server-side proxy — shared session, TTL cache."""

import asyncio
import logging
import time
from typing import Any

import net as http
import config

log = logging.getLogger("bot.tmdb")

_cache: dict[str, tuple[float, Any]] = {}
_inflight: dict[str, asyncio.Future] = {}
_lock = asyncio.Lock()
CACHE_TTL = config.CACHE_TTL_SECONDS


async def _get(params: dict[str, Any]) -> Any | None:
    key = repr(sorted(params.items()))
    now = time.monotonic()
    async with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]
        fut = _inflight.get(key)
        if fut is not None:
            return await fut
        fut = asyncio.get_running_loop().create_future()
        _inflight[key] = fut
    data: Any | None = None
    try:
        status, data = await http.get_json(config.TMDB_PROXY, params=params)
        if status == 200 and data is not None:
            async with _lock:
                _cache[key] = (time.monotonic(), data)
            http.set_status("movies", "online")
            return data
        if status == 0:
            http.set_status("movies", "offline")
        else:
            http.set_status("movies", "degraded")
        return None
    finally:
        async with _lock:
            _inflight.pop(key, None)
            if not fut.done():
                # Resolve waiters with whatever we got (None on failure).
                fut.set_result(data)


async def probe() -> str:
    """Actively measure the site's TMDB proxy and record the real status.

    Same defect class as the site bridge: `movies` was only written when a
    command happened to fetch metadata, so on an idle bot it stayed at its
    "starting" default. This bypasses the metadata cache on purpose — a cache
    hit returns before any status is set, which would freeze the value.
    """
    status, _ = await http.get_json(
        config.TMDB_PROXY, params={"action": "popular", "type": "movie"})
    if status == 200:
        http.set_status("movies", "online")
    elif status == 0:
        http.set_status("movies", "offline")
    else:
        http.set_status("movies", "degraded")
    return http.get_status().get("movies", "unknown")


def _results(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        results = data.get("results")
        return results if isinstance(results, list) else []
    if isinstance(data, list):
        return data
    return []


def _norm(item: dict[str, Any]) -> dict[str, Any]:
    media_type = item.get("media_type") or ("tv" if item.get("first_air_date") else "movie")
    title = item.get("title") or item.get("name") or "Untitled"
    date = item.get("release_date") or item.get("first_air_date") or ""
    poster = item.get("posterPath") or item.get("poster_path") or ""
    if poster and not str(poster).startswith("http"):
        poster = "https://image.tmdb.org/t/p/w500" + str(poster)
    backdrop = item.get("backdropPath") or item.get("backdrop_path") or ""
    if backdrop and not str(backdrop).startswith("http"):
        backdrop = "https://image.tmdb.org/t/p/w1280" + str(backdrop)
    rating = item.get("voteAverage")
    if rating is None:
        rating = item.get("vote_average") or 0
    return {
        "id": item.get("id"),
        "type": media_type,
        "title": title,
        "overview": (item.get("overview") or "").strip(),
        "poster": poster,
        "backdrop": backdrop,
        "rating": rating,
        "year": (date[:4] if date else ""),
        "date": date,
    }


async def search(query: str) -> list[dict[str, Any]]:
    data = await _get({"action": "search", "q": query})
    return [_norm(i) for i in _results(data) if i.get("media_type") != "person"]


async def trending(media_type: str = "movie", window: str = "week") -> list[dict[str, Any]]:
    data = await _get({"action": "trending", "type": media_type, "window": window})
    return [_norm(i) for i in _results(data) if i.get("media_type") != "person"]


async def popular(media_type: str = "movie") -> list[dict[str, Any]]:
    data = await _get({"action": "popular", "type": media_type})
    return [_norm(i) for i in _results(data)]


async def top_rated(media_type: str = "movie") -> list[dict[str, Any]]:
    data = await _get({"action": "top_rated", "type": media_type})
    return [_norm(i) for i in _results(data)]


async def upcoming() -> list[dict[str, Any]]:
    data = await _get({"action": "upcoming", "type": "movie"})
    return [_norm(i) for i in _results(data)]


async def details(tmdb_id: int, media_type: str) -> dict[str, Any] | None:
    action = "movie_details" if media_type == "movie" else "tv_details"
    data = await _get({"action": action, "id": str(tmdb_id)})
    if not isinstance(data, dict):
        return None
    if "results" in data and "id" not in data:
        items = data["results"]
        return _norm(items[0]) if items else None
    return _norm(data)


async def recommendations(tmdb_id: int, media_type: str) -> list[dict[str, Any]]:
    action = "movie_details" if media_type == "movie" else "tv_details"
    data = await _get({"action": action, "id": str(tmdb_id)})
    if not isinstance(data, dict):
        return []
    recs = data.get("recommendations")
    if isinstance(recs, dict):
        recs = recs.get("results")
    if not isinstance(recs, list):
        recs = []
    return [_norm(i) for i in recs]
