#!/usr/bin/env python3
"""Boot the bot's real HTTP server and assert the version contract.

    python scripts/test_health_version.py

The dashboard's entire "the deployed build is stale" diagnosis rests on three
claims about `GET /health/version`:

  1. it answers on a build too old to have the level-card routes at all,
  2. it needs no bridge secret — it sits on the public `/health` surface,
  3. it reports HONESTLY which level-card routes this process registered,
     read off the live router rather than a hardcoded list.

If any of those is false the panel confidently reports the wrong cause, which
is worse than reporting nothing. Claim 3 in particular must be falsifiable: a
build missing `/leveling/background` has to be able to say so.

This imports the real module and starts the real server on an ephemeral port.
No Discord connection, no database and no network are required: nothing here
needs a ready gateway, and the endpoints under test are static.
"""
import asyncio
import json
import os
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "discord-bot" / "bot"))

passed = 0
failed = 0
failures = []


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok    {name}")
    else:
        failed += 1
        failures.append(name)
        print(f"  FAIL  {name}{f' — {detail}' if detail else ''}")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def get(url: str, timeout: float = 15.0):
    """Returns (status, parsed_json_or_None, raw_text).

    Uses an async client on purpose: a BLOCKING request issued from inside the
    event loop starves the very server it is waiting on, so the probe deadlocks
    and reports "the server never started" when the server is running fine.
    """
    import aiohttp
    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            async with session.get(url) as resp:
                body = await resp.text()
                try:
                    return resp.status, json.loads(body), body
                except json.JSONDecodeError:
                    return resp.status, None, body
    except Exception as exc:  # connection refused, timeout, …
        return 0, None, f"{type(exc).__name__}: {exc}"


async def main() -> int:
    port = free_port()
    os.environ["PORT"] = str(port)
    # No token: nothing under test needs a live gateway, and constructing the
    # client without one keeps this hermetic.
    os.environ.setdefault("DISCORD_TOKEN", "")

    import main as bot_main  # noqa: E402  (import is the slow part)

    server = asyncio.create_task(bot_main._health_server())
    base = f"http://127.0.0.1:{port}"

    # Wait for the port to accept connections. NOT for 200: /health honestly
    # reports 503 while the gateway is still down, and in this test it always
    # is — nothing here needs a live Discord connection. Any HTTP status proves
    # the server is bound and routing, which is what the old crashes prevented.
    for _ in range(80):
        if server.done() and server.exception():
            check("the health server started", False,
                  f"{type(server.exception()).__name__}: {server.exception()}")
            return 1
        status, _, _ = await get(f"{base}/health", timeout=2.0)
        if status > 0:
            break
        await asyncio.sleep(0.25)
    else:
        check("the health server started", False, "never accepted a connection")
        server.cancel()
        return 1
    check("the health server started and is routing", True)
    check("/health is reachable (status is 503 only because no gateway here)",
          (await get(f"{base}/health", timeout=5.0))[0] in (200, 503),
          str((await get(f"{base}/health", timeout=5.0))[0]))

    try:
        print("\n[1] /health/version answers WITHOUT a bridge secret")
        status, body, raw = await get(f"{base}/health/version")
        check("it returns 200 with no Authorization header", status == 200,
              f"HTTP {status}: {raw[:120]}")
        check("the body is JSON", isinstance(body, dict), raw[:120])

        if not isinstance(body, dict):
            return 1

        print("\n[2] it identifies the build")
        for field in ("service", "version", "buildFingerprint", "buildTime",
                      "environment", "levelingRoutesRegistered"):
            check(f"it reports {field}", field in body, json.dumps(list(body))[:160])
        check("the service is named murabot", body.get("service") == "murabot",
              str(body.get("service")))
        check("the version is a non-empty string",
              isinstance(body.get("version"), str) and bool(body.get("version")),
              repr(body.get("version")))
        check("the environment is reported",
              body.get("environment") in ("production", "development")
              or isinstance(body.get("environment"), str),
              repr(body.get("environment")))

        print("\n[3] it never leaks a credential")
        text = raw.lower()
        for secret_word in ("mongodb://", "mongodb+srv://", "password", "passwd",
                            "bridge_secret", "discord_token", "client_secret",
                            "authorization", "bearer "):
            check(f"the response does not contain {secret_word!r}",
                  secret_word not in text, raw[:160])
        # The strongest check: nothing in the payload should look like a URI.
        check("no value in the response looks like a connection string",
              not any(isinstance(v, str) and ("://" in v or "@" in v)
                      for v in body.values()),
              json.dumps(body)[:200])

        print("\n[4] the route manifest is measured, not asserted")
        routes = body.get("levelingRoutesRegistered")
        check("levelingRoutesRegistered is an object", isinstance(routes, dict),
              repr(routes))
        if isinstance(routes, dict):
            check("it reports the background route as a boolean",
                  isinstance(routes.get("background"), bool), repr(routes))
            check("it reports the config route as a boolean",
                  isinstance(routes.get("config"), bool), repr(routes))
            # This process DID register them, so the manifest must say so. A
            # build that failed to register would report false — which is the
            # whole point of reading it off the router.
            check("this build reports the background route as registered",
                  routes.get("background") is True, repr(routes))
            check("this build reports the config route as registered",
                  routes.get("config") is True, repr(routes))

        print("\n[5] the canonical paths are documented, with no aliases")
        canonical = body.get("canonicalRoutes") or {}
        check("it names the read path", "leveling/background" in
              json.dumps(canonical), json.dumps(canonical))
        check("it names the write path", "leveling/config" in
              json.dumps(canonical), json.dumps(canonical))

        print("\n[6] the endpoints that are registered really do answer")
        guild = "997389969448517632"
        for path, expected in (
            (f"/leveling/background/{guild}", 401),   # exists, needs the secret
            (f"/leveling/config/{guild}", 405),       # exists, POST-only
        ):
            status, _, raw2 = await get(f"{base}{path}")
            check(f"{path} is not a 404 (it answered {status})",
                  status == expected, f"HTTP {status}: {raw2[:120]}")
        # Unauthenticated 401 (not 404) is the proof the route is mounted.
        status, _, _ = await get(f"{base}/health/version")
        check("the version endpoint stays up alongside them", status == 200)

        print("\n[7] /health still works and does not require a secret")
        status, health, _ = await get(f"{base}/health")
        check("/health answers (503 here only because there is no gateway)",
              status in (200, 503), str(status))
        if isinstance(health, dict):
            check("/health reports the build fingerprint too",
                  "build_fingerprint" in health, json.dumps(list(health))[:160])

    finally:
        server.cancel()
        try:
            await server
        except (asyncio.CancelledError, Exception):
            pass

    print(f"\n{passed} passed, {failed} failed")
    if failed:
        print("Failures:\n  - " + "\n  - ".join(failures))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
