# MuraGoods bot on Render — operations

Service: `murastream-bot-pf11` · Python · Oregon · `plan: starter` · Blueprint: repo-root `render.yaml` (`rootDir: discord-bot`).

## Endpoints (all secret-free)

| Endpoint | Auth | Use |
|---|---|---|
| `GET /health` | none | Render `healthCheckPath`; full subsystem state |
| `GET /health/music` | none | music aggregate: `discord_voice`, `ffmpeg`, `audio_extractor`, `opus`, `player`, `latency` |
| `GET /music/diagnose?q=…` | bridge secret | real provider resolve from this host |
| `GET /music/diagnostics` | bridge secret | audio service + FFmpeg + players + last failure |
| `GET /music/playback-log` | bridge secret | recent staged attempts (sanitized) |
| `POST /music/test-audio` | bridge secret | staged PASS/FAIL/NOT TESTED self-test |

Expected healthy `/health/music`: `{"status":"online",…}` with HTTP 200.
Degraded returns HTTP 503 with `{"status":"degraded","failing":[…]}` naming
the exact subsystem — never a faked 200.

## Runtime facts

- **Port**: the web server binds `$PORT` (falls back to 8080); `0.0.0.0`. Never hardcoded.
- **Build**: `pip install -r requirements.txt && python scripts/install_deno.py`; **start**: `python -m bot.main`.
- **FFmpeg**: Render provides `/usr/bin/ffmpeg`; the bot also falls back to `imageio-ffmpeg`. Presence is *measured* (`ffmpeg -version`) at startup and reported — a missing decoder reads `MISSING`, never "ready".
- **Node** (yt-dlp challenge solver): provided by the Render image; the bot enables all runtimes explicitly because yt-dlp defaults to deno-only.
- **Env vars** (names only — values live in the Render dashboard, never the repo): `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_SECRET`, `MURASTREAM_URL`, `TMDB_API_KEY`, `MONGO_URI`, `MONGO_DB`, `DISCORD_BRIDGE_SECRET`, `BOT_STATUS`, `BOT_ACTIVITY`, `BOT_ADMIN_IDS`, `BOT_PREFIX`, `YOUTUBE_PROXY`, `YT_COOKIES` (inline jar contents — a file path is meaningless here), `YT_COOKIES_FILE` (local runs only).

## Monitoring

- Preferred: an **external** uptime monitor (e.g. UptimeRobot) polling `GET /health` every **5–10 minutes**. Do not ping every few seconds.
- The bot also self-checks every 5 minutes (gateway, site bridge, TMDB, FFmpeg) into the `keepalive` collection — legitimate monitoring, not traffic generation.
- Honest limits: the `starter` plan keeps the process running 24/7. On a **free** plan Render sleeps idle services and no ping interval can guarantee uptime — keep `starter` for a real bot.

## One token, one session

Never run two live bot services with the same `DISCORD_TOKEN` (e.g. `murastream-bot` alongside `murastream-bot-pf11`): the newer login force-disconnects the older one, commands get answered randomly by either instance, and diagnostics on one instance stay empty while the other fails. **Suspend** every duplicate service.
