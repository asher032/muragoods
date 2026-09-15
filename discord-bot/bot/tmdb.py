"""TMDB metadata access — server-side key only (site proxy), TTL-cached, no secrets."""

import asyncio
import logging
import time
from typing import Any

import aiohttp

import config

log = logging.getLogger("bot.tmdb")

_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = asyncio.Lock()
CACHE_TTL = config.CACHE_TTL_SECONDS


async def _fetch_json(url: str, params: dict[str, Any]) -> Any | None:
    try:
        timeout = aiohttp.ClientTimeout(total=config.HTTP_TIMEOUT)
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=timeout) as resp:
                if resp.status == 429:
                    retry_after = float(resp.headers.get("Retry-After", "2"))
                    log.warning("TMDB rate-limited, sleeping %.1fs", min(retry_after, 10))
                    await asyncio.sleep(min(retry_after, 10))
                    return None
                if resp.status != 200:
                    log.warning("TMDB request -> HTTP %d", resp.status)
                    return None
                return await resp.json()
    except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
        log.warning("TMDB request failed: %s", exc)
        return None


async def _get(params: dict[str, Any]) -> Any | None:
    key = repr(sorted(params.items()))
    now = time.monotonic()
    async with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]

    data = await _fetch_json(config.TMDB_PROXY, params)
    if data is None:
        return None

    async with _cache_lock:
        _cache[key] = (time.monotonic(), data)
    return data


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
    items = _results(data)
    return [_norm(i) for i in items if i.get("media_type") != "person"]


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


async def now_playing() -> list[dict[str, Any]]:
    data = await _get({"action": "now_playing", "type": "movie"})
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


async def tv_season(tmdb_id: int, season: int) -> list[dict[str, Any]]:
    data = await _get({"action": "tv_season", "id": str(tmdb_id), "season": str(season)})
    if isinstance(data, dict):
        eps = data.get("episodes")
        return eps if isinstance(eps, list) else []
    return []


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
