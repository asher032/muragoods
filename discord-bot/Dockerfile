FROM python:3.11-slim

# FFmpeg for music streaming + curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bot/ ./bot/
COPY scripts/ ./scripts/

# yt-dlp needs a JavaScript runtime to solve YouTube's signature challenge;
# without one playback fails in a way that looks like an IP block. Installs
# into ./bin, which bot/music.py puts on PATH.
RUN python scripts/install_deno.py

# Non-root user
RUN useradd -m botuser && chown -R botuser:botuser /app
USER botuser

# Health endpoint file the healthcheck task touches
ENV PYTHONUNBUFFERED=1

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1

CMD ["python", "-m", "bot.main"]
