# Muragoods / Murabot — Database Architecture

Two active MongoDB clusters plus one declared-but-unconnected legacy cluster,
**one** user identity, and a hard rule that a connection string never leaves
the server.

---

## 1. The clusters

The **variable name is the contract.** The site, the dashboard and the bot all
resolve their connection string through the same mapping, so "the dashboard
must show the same data as the bot" is a property of the configuration rather
than a convention somebody has to remember.

| Cluster | Variable | Status | Owns |
|---|---|---|---|
| `muragoods` | `MURAGOODS_MONGODB_URI` | active | **Canonical identity**, accounts, authentication, main profile |
| `murabot` | `MURABOT_MONGODB_URI` | active | Guild config, economy, inventory, items, shop, market, jobs/work, moderation, leveling, music, tickets, giveaways, suggestions |
| `players` | `MURAGOODS_PLAYERS_MONGODB_URI` | **legacy** | Old player rows pending reconciliation into the canonical identity |

Optional per-cluster database names: `MURAGOODS_MONGO_DB` (default
`muragoods`), `MURABOT_MONGO_DB` (default `murastream_bot`) and
`MURAGOODS_PLAYERS_MONGO_DB` (default `players`).

### The legacy `players` cluster

A third, older cluster holds player rows. It is declared in the table so it is
**visible** in `/api/health` instead of being an invisible database nobody
remembers, and it is explicitly **not** an identity authority:

- Nothing authenticates against it.
- Nothing writes to it.
- Its rows are reconciled **into** `muragoods` by
  `scripts/audit-db-consistency.mjs`, which reports and never deletes.

Until that reconciliation has been reviewed, this cluster is the one place a
person could still exist twice — which is exactly why it is written down here
rather than ignored. The `identityAuthority` flag in the cluster table is the
machine-checked form of "exactly one login system", and the architecture test
fails if a second cluster ever claims it.

**Precedence:** the named variable wins. `MONGODB_URI`, `MONGO_URI` and
`DATABASE_URL` are still accepted as fallbacks so an existing deployment keeps
running during migration — remove them once the named variables are set on
every host, otherwise the old single-URI setup stays alive and the two clusters
can never actually be separated.

Resolution lives in exactly one place per runtime:

- Site / dashboard: `app/lib/db/clusters.ts` (`CLUSTERS`)
- Bot: `discord-bot/bot/config.py`

`discord-bot/scripts/test_db_architecture.py` asserts the two tables agree, that
exactly one cluster is the identity authority, and that no module reads the
legacy cluster's variable — so they cannot drift.

### Do not add a second dashboard database

The dashboard is a **client** of the Murabot cluster. It must not implement its
own economy calculation, inventory update, shop purchase, market trade,
leveling or guild-config logic. It reads the same collections the bot writes.
A cached dashboard balance must never become a source of truth.

---

## 2. Rotating the database credentials

**If a connection string has ever been pasted into a chat, a commit, a log or
a ticket, it must be rotated.** Rotation is cheap; an unrotated credential that
was already seen is not.

1. In MongoDB Atlas, rotate the database user's password for **each** cluster.
2. Set the new value in the deployment environment (Vercel for the site, the
   bot host for Murabot). Use the named variable from the table above.
3. Redeploy every affected service. Atlas network access lists usually need
   the new host's egress IP added too.
4. Confirm the old password no longer authenticates.
5. Confirm nothing in source, history or logs still contains it:
   ```bash
   node scripts/secret-scan.mjs          # tracked files
   node scripts/secret-scan.mjs --all    # including untracked
   ```
6. Search deployment logs for the old value.

**Never write a connection string into a file, a commit, a log line, an API
response or a chat message.** `.env*` is gitignored, `__pycache__/` is
gitignored, and CI fails on any connection string with embedded credentials.

---

## 3. One identity

There is exactly one identity system: the Muragoods account. Muragoods,
Murastream, Murabot and Murashop are all views of it.

```
            MURAGOODS ACCOUNT  (users.userId — canonical)
                    │
        ┌───────────┼───────────┐
        ↓           ↓           ↓
   Muragoods    Murastream   Murabot
    profile      profile     profile
```

A Discord account is linked as an **external identifier**, never as a username:

```
users.discord.discordId   ← the Discord snowflake (stable)
users.discord.linkedAt
```

A snowflake is permanent. A username is not — it can be changed, and two
accounts can share a legacy one — so it is stored for display only and is
never used as a key.

The bot resolves a snowflake to a canonical id through
`discord-bot/bot/identity.py`, which asks the site over the authenticated
bridge (`GET /api/discord/identity`). It does **not** keep its own user table,
because that is how a second identity system appears.

**The economy stays keyed by the snowflake.** Rows are `{guildId, userId}` with
`userId` the snowflake, which is unchanged — re-keying would mean rewriting
live balances, inventories and transaction history for no functional gain. The
canonical id is carried alongside as `canonicalUserId` so the reference exists
and is auditable without a destructive migration.

---

## 4. Connection handling

`app/lib/db/clusters.ts` owns every connection in the site:

- one cached client per cluster, reused across requests (never a new connection
  per request)
- explicit pool bounds (`maxPoolSize`, `minPoolSize`, `maxIdleTimeMS`)
- bounded `serverSelectionTimeoutMS` so a dead cluster fails fast instead of
  pinning every request for ~30s
- a failed connect is **not** cached, so fixing a bad variable does not require
  a restart
- Mongoose is bound to the site's own cluster; bot data is read with the raw
  driver, which keeps the two pools genuinely separate

`discord-bot/bot/database.py` does the same for the bot.

### Error codes

Failures are classified into a closed set, so an operator learns *what* is
wrong without the URI being attached to it:

`DATABASE_UNAVAILABLE` · `DATABASE_AUTH_FAILED` · `DATABASE_TIMEOUT` ·
`DATABASE_OPERATION_FAILED` · `CONFIGURATION_ERROR` ·
`ENDPOINT_UNAVAILABLE` · `READY`

Every message names the **variable** that is wrong, never its value.

### What the browser may see

```json
{ "connected": true }
```

```json
{
  "cluster": "murabot",
  "configuredFrom": "MURABOT_MONGODB_URI",
  "state": "READY",
  "ok": true
}
```

Never a URI, a username, a password, or internal connection detail. A cluster
name and a database name are not secrets and are included deliberately so a
misconfigured deployment is diagnosable from the outside.

`/api/discord/identity` returns only `{ linked, canonicalUserId }` — no email,
name, role or balance. An identity oracle that leaked an email would turn a
leaked snowflake into a PII disclosure.

---

## 5. Migrations

Inspect before changing. Never wipe.

```bash
node scripts/audit-db-consistency.mjs           # dry run, default
node scripts/audit-db-consistency.mjs --apply   # writes backfills only
```

`audit-db-consistency.mjs` **reports** duplicate users, duplicate Discord
links, economy rows with no canonical id, invalid guild ids, orphaned
inventory, orphaned transactions and duplicate transaction ids. It never
deletes and never merges: conflicts are reported for explicit human linking.
`--apply` only writes backfills.

`migrate-unified-accounts.mjs` does the same for account joins and is dry-run
by default.

---

## 6. Local checks

```bash
node scripts/secret-scan.mjs             # no credentials in tracked files
node scripts/check-items-parity.mjs      # catalog snapshot freshness
python discord-bot/scripts/test_db_architecture.py   # cluster + identity contract
```

All three run in CI.
