"""The database diagnostic must be actionable and never leak secrets.

`database: offline` on its own could not distinguish a missing variable from a
bad database name or an access-list rejection, which sent readers hunting for
the wrong fault. These tests pin the mapping and assert nothing sensitive is
ever emitted.
"""
import os
import sys

_BOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "bot")
sys.path.insert(0, _BOT)

import config  # noqa: E402
import database  # noqa: E402

fails = []


def check(label, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + label + (("  <- " + str(detail)) if not cond else ""))
    if not cond:
        fails.append(label)


_uri, _db, _last = config.MONGO_URI, database._db, database.LAST_ERROR


def restore():
    config.MONGO_URI, database._db, database.LAST_ERROR = _uri, _db, _last


print("--- not configured ---")
config.MONGO_URI = ""
database.LAST_ERROR = None
database._db = None
d = database.diagnostic()
check("unset URI reports configured=False", d["configured"] is False, d)
check("unset URI names the variables to set", "MONGO_URI" in d["hint"], d)

print("--- configured but no attempt completed ---")
config.MONGO_URI = "mongodb+srv://user:secret@cluster/db"
database.LAST_ERROR = None
database._db = None
d = database.diagnostic()
check("no attempt is not reported as a failure", d["error_class"] == "NotConnected", d)

print("--- healthy ---")
database._db = object()
d = database.diagnostic()
check("connected reports no error", d["error_class"] is None and d["hint"] is None, d)

print("--- the real fault we measured on Render ---")
database._db = None
database.LAST_ERROR = "InvalidName"
d = database.diagnostic()
check("InvalidName is surfaced by class", d["error_class"] == "InvalidName", d)
check("InvalidName hint names the database NAME", "database NAME" in d["hint"], d)
check("InvalidName hint points at MONGO_DB", "MONGO_DB" in d["hint"], d)
check("InvalidName hint does not blame the network",
      "network" not in d["hint"].replace("not the network", ""), d)

print("--- actionable hints for the other classes ---")
database.LAST_ERROR = "ServerSelectionTimeoutError"
d = database.diagnostic()
check("timeout hint mentions the IP access list", "IP access list" in d["hint"], d)

print("--- never leak credentials ---")
database.LAST_ERROR = "InvalidName"
blob = repr(database.diagnostic())
for secret in ("secret", "@cluster", config.MONGO_URI):
    check("diagnostic omits %r" % (secret[:12],), secret not in blob, blob[:120])

restore()
print()
total = 12
print("RESULT: %d passed, %d failed" % (total - len(fails), len(fails)))
if fails:
    print("FAILED:", *fails, sep="\n  - ")
sys.exit(1 if fails else 0)
