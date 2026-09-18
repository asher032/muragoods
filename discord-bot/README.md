# MuraStream Discord Bot

A production-ready community bot for the MuraStream / Muragoods platform: media discovery via TMDB, Watch Together rooms, music playback, moderation, requests, and Muragoods menus.

> **You pasted your bot token + client secret into chat** — rotate both in the
> [Discord Developer Portal](https://discord.com/developers/applications) before going live.

---

## Features

| Area | Commands |
|---|---|
| 🎬 Media | `/search` `/movie` `/tv` `/anime` `/trending` `/popular` `/recommend` `/watch` `/watchlist` |
| 👥 Watch Together | `/watchtogether <title>` — creates a real synced room on the site |
| 📋 Requests | `/request` `/requests` (+vote, duplicate detection, admin status changes) |
| 💬 Community | `/comments <title>` — recent site comments |
| 🎵 Music | `/play` `/searchmusic` `/skip` `/pause` `/resume` `/stop` `/queue` `/nowplaying` `/loop` `/shuffle` `/remove` `/clear` `/volume` `/join` `/leave` |
| 🍔 Muragoods | `/food` `/letters` `/games` `/points` `/rewards` `/profile` |
| 🛡️ Moderation | `/warn` `/warnings` `/clearwarnings` `/kick` `/ban` `/unban` `/mute` `/unmute` `/clear` `/lock` `/unlock` `/setup` |
| ℹ️ Info | `/help` `/status` |

## Important: Discord video reality check

Discord's **bot API does not support streaming arbitrary movie video into voice/video calls** — that is a hard platform limit, not a implementation gap. This bot does the supported thing:

- **Music** → real audio playback in voice channels (yt-dlp + FFmpeg).
- **Movies/TV** → rich embeds with a **▶ Watch on MuraStream** button (site handles playback).
- **Watch Together** → the bot creates a genuine synchronized room on the website (same timeline, host controls, drift correction — the website's v2 sync system). Discord users get a **JOIN WATCH TOGETHER** button.

No self-bots, no user-token automation, no API workarounds.

## Setup

### 1. Secrets

```bash
cd discord-bot
cp .env.example .env
# Fill in DISCORD_TOKEN, MONGO_URI, DISCORD_BRIDGE_SECRET (any 32+ random chars)
```

- `MONGO_URI` — reuse the website's MongoDB cluster; the bot uses its own database (`MONGO_DB`, default `murastream_bot`).
- `TMDB_API_KEY` — **optional**; the bot reads metadata through the website's server-side proxy, so no key is needed in the bot at all.
- `BOT_ADMIN_IDS` — comma-separated Discord user IDs that can force admin actions.

### 2. Website bridge (optional but recommended)

The bot talks to `https://muragoods.vercel.app/api/discord` using `DISCORD_BRIDGE_SECRET`:

```bash
# in the Vercel project env vars:
DISCORD_BRIDGE_SECRET=<same long random string as the bot>
```

This enables `/watchtogether` room creation and `/request` mirroring. Everything else works without it.

### 3. Run locally

```bash
pip install -r requirements.txt
python -m bot.main
```

FFmpeg must be on your `PATH` (music only). On Linux: `sudo apt install ffmpeg`.

### 4. Invite the bot

Least-privilege invite (no Administrator):

```
https://discord.com/oauth2/authorize?client_id=1549395794853888020&permissions=271698944&scope=bot%20applications.commands
```

Permissions included: View Channels, Send Messages, Embed Links, Attach Files, Read History, Connect, Speak, Use Slash Commands, Moderate Members.

### 5. Music: YouTube authentication (required on datacenter hosts)

Music resolves through yt-dlp. YouTube **refuses datacenter egress IPs** and reports it as an extractor error:

```
ERROR: [youtube] <video-id>: Sign in to confirm you're not a bot.
Use --cookies-from-browser or --cookies for the authentication.
```

This is neither a code fault nor a timeout, and retrying cannot clear it. Supply one of:

| Variable | Value |
| --- | --- |
| `YT_COOKIES` | the **contents** of a Netscape cookie jar exported from a signed-in YouTube session; written to a private temp file at runtime |
| `YT_COOKIES_FILE` | a path to that jar, if mounting a file is easier |
| `YOUTUBE_PROXY` | a residential/rotating proxy URL, e.g. `http://user:pass@host:port` |

`GET /music/diagnose` reports which are present (`cookies_configured`, `proxy_configured`), whether YouTube challenged this host during the last resolve (`youtube_challenged`), and a machine-readable `error_kind` plus `remedy`. Read it before guessing.

Two deliberate behaviours, so a resolve never lies about what it found:

- A result from a fallback provider (SoundCloud/Bandcamp) is **rejected** when its title does not overlap the query, or when it comes from a preview CDN (~30-second clip). Playing those while displaying the track title is the same class of lie as a fake success message.
- A URL input is never re-searched on other providers, because those can only return a *different* video.

`YT_FORMAT` and `YT_PLAYER_CLIENT` exist for deliberate overrides, but leaving both unset is the correct default: pinning either disables yt-dlp's own client rotation and format fallback, which is exactly what made resolves fail on the production host.

## Deployment

**Render** (recommended for the always-on bot):

1. Push this folder to GitHub.
2. Render → New → Blueprint → connect the repository. The root `render.yaml` points at `discord-bot/`.
3. Keep the service on the `starter` plan; the free plan sleeps and disconnects the bot from Discord.
4. Set the secret env vars in the Render dashboard, then deploy. The `/health` endpoint is used by Render to restart an unhealthy instance.

The MuraBot dashboard is the Next.js app at `https://muragoods.vercel.app/dashboard` and should remain deployed through the repository's Vercel project. In the Discord Developer Portal, register this exact OAuth2 redirect URI: `https://muragoods.vercel.app/dashboard`. Vercel serves the dashboard and its API routes on demand, so it does not need a continuously running dashboard process. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, and `DISCORD_BRIDGE_SECRET` in Vercel, using the same bridge secret as Render. `DISCORD_BOT_TOKEN` lets the dashboard populate channel and role selectors; it is never sent to the browser.

**Docker** (any host):

```bash
docker build -t murastream-bot .
docker run --env-file .env -p 8080:8080 murastream-bot
```

FFmpeg is installed inside the image; no hardcoded paths.

## Architecture

```
discord-bot/
├── bot/
│   ├── main.py          # entrypoint, cog loader, reconnect loop
│   ├── config.py        # env-only config, invite URL
│   ├── database.py      # MongoDB (motor): guilds, warnings, requests, cooldowns
│   ├── tmdb.py          # TMDB via the site's server-side proxy (no keys!)
│   ├── bridge.py        # authenticated /api/discord client
│   ├── music.py         # per-guild player engine (yt-dlp + FFmpeg)
│   ├── utils.py         # embeds, cooldowns, safe links
│   └── cogs/
│       ├── murastream.py     # media discovery commands
│       ├── watchtogether.py  # parties, requests, comments
│       ├── music.py          # music commands
│       ├── moderation.py     # mod + automod + setup + welcome
│       └── muragoods.py      # food/letters/games/points/rewards
├── requirements.txt
├── Dockerfile
├── render.yaml
├── .env.example
└── README.md
```

## Security

- **No secrets in code** — everything from env vars; `.env` is gitignored.
- **No keys in the bot** — TMDB metadata flows through the website's server-side proxy.
- **Bridge auth** — `/api/discord` requires the shared secret; never publicly callable.
- **Parameterized queries** — motor/pymongo only; no string-built queries.
- **Rate limiting** — Mongo-TTL cooldowns per user/command and per request type.
- **Least privilege** — invite URL requests no Administrator; moderation uses Discord's own permission checks plus role-hierarchy guards.
- **No secrets in logs** — the logger never prints tokens; login failures report a generic error.

## Fragile internals the health checks depend on

These are private/undocumented attributes. Each was chosen after checking the
installed library rather than assuming, and each is read defensively — but if a
dependency upgrade moves one, the code **falls back silently instead of failing
loudly**, so the health output would become optimistically wrong. There are
currently no automated tests guarding them. Verify these after any major
`discord.py` or `yt-dlp` upgrade.

| Relied on | Where | What breaks if it moves |
|---|---|---|
| `ws._keep_alive._last_ack` | `main.gateway_liveness()` | Falls back to `is_ready()`, which stays `true` forever once the bot has connected — so `/health` would report `discord: online` on a dead gateway, and `last_heartbeat` would be `null` again. |
| `bot.ws` (non-sharded) and `ShardInfo._parent.ws` (sharded) | `main.gateway_liveness()` | Same silent fallback as above. Note `bot.shards` exists **only** on `AutoShardedClient`, and `ShardInfo.__slots__` is `('_parent','id','shard_count')` — there is no `ShardInfo.ws`. |
| `ConnectionState.last_heartbeat` | do not use | Does not exist. A previous version read it and returned `null` forever. |
| `database.LAST_ERROR`, `database._db` | `database.diagnostic()` | The `database_detail` hint degrades to a generic message, so a bad `MONGO_DB` looks the same as an unreachable cluster. |
| `music.FFMPEG_EXE`, `music.FFMPEG_OK` | `music.probe()`, `/health` | `ffmpeg` in `/health` reports `null` ("not measured") rather than a wrong value. |
| Keys in `net._status` | `net.py` | Any key with no active probe **stays `"starting"` forever** on an idle bot. This is exactly how `site_bridge` and `movies` appeared permanently broken. When adding a subsystem, add a probe with it. |
| `INNERTUBE_CLIENTS` keys | `music.get_ydl_opts()` (only when `YT_PLAYER_CLIENT` is set) | A `player_client` name yt-dlp no longer implements makes extraction fail slowly rather than immediately, and pinning the list at all disables yt-dlp's own rotation — which is why nothing is pinned by default. Verify with `python -c "from yt_dlp.extractor.youtube import _base; print(list(_base.INNERTUBE_CLIENTS))"`. |
| `format` selector fallback semantics | `music.get_ydl_opts()` | A selector like `bestaudio[acodec!=none]/bestaudio/best` fails the **whole** request when every returned format lacks `acodec`, instead of falling through. This is what surfaced live as `Requested format is not available`. The default is now plain `bestaudio/best`. |
| Presence of a JS runtime | `music.js_runtimes()` | yt-dlp needs `deno`, `node`, `bun`, `qjs`, or `quickjs` to solve YouTube's signature challenge. With none, extraction can **stall** rather than error — which is indistinguishable from a blocked IP. `/music/diagnose` now reports which are available. |

## Honest limitations

- **Free hosting sleeps** — Render's free tier restarts workers periodically; the bot auto-recovers but music playback stops during restarts. Paid tier removes this.
- **yt-dlp breakage** — YouTube occasionally changes internals; `yt-dlp` updates fix it (Deploy → "Clear build cache & deploy").
- **Video in calls** — not possible via bot API (see above); Watch Together on the website is the supported path.
- **Command propagation** — global slash commands can take up to ~1 hour to appear the first time; per-guild sync after invite is instant.
