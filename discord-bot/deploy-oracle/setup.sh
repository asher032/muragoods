#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# MuraGoods bot — Oracle Cloud Always Free ARM (A1.Flex, Ampere) setup
# ═══════════════════════════════════════════════════════════════════════
# Provisions the existing bot on an Ubuntu ARM VM where the process is
# genuinely always-on: no spin-down, no cold starts, no external pinger.
# Idempotent — safe to re-run; existing files are never clobbered.
#
# Run on the VM as a sudo-capable user:
#   bash setup.sh
# Then:
#   1. sudo nano /etc/murabot.env        # fill in the secrets
#   2. sudo systemctl enable --now murabot
#   3. curl http://localhost:8080/health # verify
#
# Env overrides (optional):
#   REPO_URL=https://github.com/asher032/muragoods.git
#   REPO_BRANCH=main                     # deploy-fix-2 until PR merges
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/asher032/muragoods.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
APP_DIR="$HOME/muragoods"
BOT_DIR="$APP_DIR/discord-bot"
ENV_FILE="/etc/murabot.env"

echo "==> [1/6] Packages (git, python venv, ffmpeg, curl)"
sudo apt-get update -qq
# build-essential + libffi-dev: PyNaCl has no prebuilt aarch64 wheel for some
# Python versions and compiles from sdist; ffmpeg is the audio decoder —
# bot/music.py:_resolve_ffmpeg prefers the system binary, which sidesteps
# imageio-ffmpeg publishing no ARM builds.
sudo apt-get install -y -qq git python3.11-venv ffmpeg curl build-essential libffi-dev

echo "==> [2/6] Repository -> $APP_DIR (branch: $REPO_BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$REPO_BRANCH" --quiet
  git -C "$APP_DIR" checkout "$REPO_BRANCH" --quiet
  git -C "$APP_DIR" pull --ff-only origin "$REPO_BRANCH" --quiet
else
  git clone --branch "$REPO_BRANCH" --single-branch "$REPO_URL" "$APP_DIR"
fi

echo "==> [3/6] Python virtualenv + dependencies (aarch64)"
cd "$BOT_DIR"
if [ ! -x venv/bin/python ]; then
  python3.11 -m venv venv
fi
./venv/bin/pip install --upgrade pip --quiet
./venv/bin/pip install --no-cache-dir -r requirements.txt

echo "==> [4/6] Environment template -> $ENV_FILE"
if [ -f "$ENV_FILE" ]; then
  echo "    $ENV_FILE already exists — leaving it untouched."
else
  sudo tee "$ENV_FILE" > /dev/null <<'ENV'
# ── MuraGoods bot secrets — root-owned, never commit this file ──────────
DISCORD_TOKEN=
DISCORD_CLIENT_ID=1549395794853888020
DISCORD_CLIENT_SECRET=
DISCORD_PUBLIC_KEY=
MONGO_URI=
MONGO_DB=murastream_bot
MURASTREAM_URL=https://muragoods.vercel.app
DISCORD_BRIDGE_SECRET=
BOT_ACTIVITY=https://muragoods.vercel.app/
BOT_STATUS=online
BOT_ADMIN_IDS=
# Optional: egress proxy for yt-dlp if YouTube blocks the VM's IP (same
# variable the Render deployment uses; bot/music.py already honours it).
YOUTUBE_PROXY=
PORT=8080
ENV
  sudo chown root:root "$ENV_FILE"
  sudo chmod 600 "$ENV_FILE"
  echo "    Created. Fill in DISCORD_TOKEN, MONGO_URI, DISCORD_CLIENT_SECRET,"
  echo "    DISCORD_BRIDGE_SECRET before starting the service."
fi

echo "==> [5/6] systemd unit"
sudo cp murabot.service /etc/systemd/system/murabot.service
sudo systemctl daemon-reload
sudo systemctl enable murabot --quiet

echo "==> [6/6] Done"
echo
echo "Next steps:"
echo "  1. sudo nano $ENV_FILE        # fill in the secrets"
echo "  2. sudo systemctl start murabot"
echo "  3. curl http://localhost:8080/health"
echo
echo "The unit restarts the bot automatically if it crashes (Restart=always)"
echo "and starts it on every VM boot — no PC, browser or site required."
