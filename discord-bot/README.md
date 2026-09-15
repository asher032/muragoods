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
https://discord.com/oauth2/authorize?client_id=1549395794853888020&permissions=154624&scope=bot%20applications.commands
```

Permissions included: View Channels, Send Messages, Embed Links, Attach Files, Read History, Connect, Speak, Use Slash Commands, Moderate Members.

## Deployment (free tier)

**Render** (recommended, free worker plan):

1. Push this folder to GitHub.
2. Render → New → Worker → connect repo → root directory `discord-bot`.
3. Render reads `render.yaml`; set the secret env vars in the dashboard.
4. Free-tier caveat (honest): Render's free worker **does not guarantee 24/7 uptime** — instances restart periodically and may cold-start. The bot is built for this: it reconnects with exponential backoff, recovers state from Mongo, and restarts cleanly. For guaranteed uptime, Render's paid plan (~$7/mo) keeps it always-on.

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

## Honest limitations

- **Free hosting sleeps** — Render's free tier restarts workers periodically; the bot auto-recovers but music playback stops during restarts. Paid tier removes this.
- **yt-dlp breakage** — YouTube occasionally changes internals; `yt-dlp` updates fix it (Deploy → "Clear build cache & deploy").
- **Video in calls** — not possible via bot API (see above); Watch Together on the website is the supported path.
- **Command propagation** — global slash commands can take up to ~1 hour to appear the first time; per-guild sync after invite is instant.
