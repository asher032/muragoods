"""Lightweight process resource sampling for the bot.

Exists so production capacity is MEASURED rather than guessed. Render's own
metrics are not reachable from inside the container, and the bot previously
exposed no CPU/RAM figures at all — which is why "is it CPU or RAM?" could
not be answered and every diagnosis was inference.

Everything here is read from the OS and is credential-free by construction:
no environment variables, no tokens, no connection strings. Values are
numeric counters and sizes only.

Standard library only: psutil is not a dependency and must not become one.
"""

from __future__ import annotations

import os
import resource
import time
from typing import Any

_START = time.monotonic()
_START_CPU = time.process_time()

# /proc/self/status and /proc/<pid>/stat are the only sources that work
# without extra packages. Both exist on Linux (Render); both are optional.
_PROC = "/proc/self"


def _read_proc_file(name: str) -> str | None:
    try:
        with open(os.path.join(_PROC, name), "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return None


def memory_mb() -> float | None:
    """Resident set size in MiB.

    VmRSS from /proc is preferred; getrusage is the portable fallback and is
    in KiB on Linux.
    """
    status = _read_proc_file("status")
    if status:
        for line in status.splitlines():
            if line.startswith("VmRSS:"):
                try:
                    return round(int(line.split()[1]) / 1024.0, 1)
                except (IndexError, ValueError):
                    break
    try:
        # ru_maxrss is KiB on Linux, bytes on macOS. Render is Linux.
        return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0, 1)
    except (ValueError, OSError):
        return None


def cpu_seconds() -> float | None:
    """Total CPU seconds consumed by this process."""
    try:
        return round(time.process_time(), 2)
    except (OSError, ValueError):
        return None


def cpu_percent(window: float = 0.0) -> float | None:
    """CPU used as a percentage of one core, averaged over `window` seconds.

    With window=0 this is the average since process start, which is what a
    long-lived service actually cares about: a bot that has been running for
    hours at 95% is in trouble even if the instantaneous reading is low.
    """
    now = time.monotonic()
    cpu = time.process_time()
    elapsed = now - _START
    if elapsed <= 0:
        return None
    used = cpu - _START_CPU
    pct = (used / elapsed) * 100.0
    # Can exceed 100% on a multi-core box (several threads busy at once); cap
    # at the machine's core count so the figure stays interpretable.
    ceiling = 100.0 * (os.cpu_count() or 1)
    return round(min(pct, ceiling), 1)


def open_fds() -> int | None:
    """Open file descriptors — the silent exhaustion source on small hosts.

    A leak here shows up as "too many open files" long before RSS looks bad.
    """
    try:
        return len(os.listdir(os.path.join(_PROC, "fd")))
    except OSError:
        return None


def thread_count() -> int | None:
    try:
        return int(_read_proc_file("status").split("Threads:")[1].split()[0])  # type: ignore[union-attr]
    except (AttributeError, IndexError, ValueError, TypeError):
        return None


def uptime_seconds() -> float:
    return round(time.monotonic() - _START, 1)


def children_peak_mb() -> float | None:
    """Peak RSS of REAPED child processes (node, ffmpeg, deno).

    `rss_mb` above reads /proc/self/status, which counts ONLY this process.
    yt-dlp spawns a JavaScript runtime (node) to solve YouTube's signature
    challenge and ffmpeg for transcoding, and none of that memory appears in
    the parent's RSS. A parent sitting at a flat 115 MB while a dozen node
    children hold hundreds of MB between them is exactly the shape of a
    host being OOM-killed, and it is invisible without this number.
    """
    try:
        return round(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024.0, 1)
    except (ValueError, OSError):
        return None


def children_cpu_seconds() -> float | None:
    try:
        return round(resource.getrusage(resource.RUSAGE_CHILDREN).ru_utime, 2)
    except (ValueError, OSError):
        return None


def sample(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """One credential-free resource snapshot.

    `extra` lets callers fold in their own counters (resolver gauges, player
    counts) without this module knowing anything about them.
    """
    snap: dict[str, Any] = {
        "uptime_seconds": uptime_seconds(),
        "rss_mb": memory_mb(),
        "cpu_percent_avg": cpu_percent(),
        "cpu_seconds": cpu_seconds(),
        "open_fds": open_fds(),
        "threads": thread_count(),
        "cpu_count": os.cpu_count(),
        # Child processes are a separate memory pool from this process.
        "children_peak_mb": children_peak_mb(),
        "children_cpu_seconds": children_cpu_seconds(),
    }
    if extra:
        snap.update(extra)
    return snap


def peak_rss_mb() -> float | None:
    """High-water mark, so a spike between samples is still visible."""
    try:
        return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0, 1)
    except (ValueError, OSError):
        return None