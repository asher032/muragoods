# MuraGoods bot on Oracle Cloud Always Free (ARM)

A genuinely always-on, $0 home for the existing bot: an Oracle Cloud Always Free
ARM VM (Ampere A1) runs the bot as a systemd service. No spin-down, no cold
starts, no external pinger, and no dependency on your PC, the site, or Render.

> **Verify the current offer yourself before relying on it.** Oracle's Always
> Free terms (4 Arm OCPUs + 24 GB RAM split across up to 4 VMs, 200 GB block
> storage, 10 TB/month egress) are generous but region-dependent and subject to
> change; oracle.com returned 403 during the audit, so this kit could not
> re-confirm them. The bot itself needs a fraction of one VM: 1 OCPU / 6 GB is
> far more than it uses on Render.

## 1. Create the VM (console, ~5 minutes)

1. Oracle Cloud console → **Compute → Instances → Create instance**.
2. Image: **Ubuntu 22.04 or 24.04** (aarch64 is selected automatically on an
   Ampere shape). Shape: **Ampere A1 Flex**, 1 OCPU, 6 GB RAM.
3. Add your SSH key. Boot volume default is fine.
4. **Security list:** leave port 8080 CLOSED. The bot's HTTP endpoints
   (`/health`, `/music/*`) should stay reachable only from the VM itself (or
   through an SSH tunnel). Only port 22 needs to be open.

## 2. Provision (one command)

```bash
ssh ubuntu@<VM_PUBLIC_IP>
# until the PR merges, the bot fixes live on deploy-fix-2:
REPO_BRANCH=deploy-fix-2 bash <(curl -fsSL https://raw.githubusercontent.com/asher032/muragoods/deploy-fix-2/discord-bot/deploy-oracle/setup.sh)
```

Or clone first and run `bash discord-bot/deploy-oracle/setup.sh`. The script is
idempotent (safe to re-run) and never overwrites an existing `/etc/murabot.env`.

## 3. Fill in secrets and start

```bash
sudo nano /etc/murabot.env     # DISCORD_TOKEN, MONGO_URI, CLIENT_SECRET, BRIDGE_SECRET
sudo systemctl enable --now murabot
curl http://localhost:8080/health
```

Expected: `"ok": true` and `subsystems.discord: "online"`. Check `/health` from
your PC without opening any port:

```bash
ssh -L 8080:localhost:8080 ubuntu@<VM_PUBLIC_IP>
# then open http://localhost:8080/health locally
```

## 4. Moving off Render — do this in the right order

**One token, one gateway session.** Start the VM bot while Render is still
running and the two instances fight over the Discord gateway (the newer login
force-disconnects the older one; you get flapping and 4014-style errors).

1. Render dashboard → the bot service → **Suspend** (not just restart).
2. Start the VM bot (`systemctl start murabot`).
3. Confirm `/health` on the VM shows `discord: online` and the right
   `guild_ids`.

Rollback is the same in reverse: `sudo systemctl disable --now murabot`, then
resume the Render service.

## 5. Day-2 operations

```bash
systemctl status murabot            # running? restarts?
journalctl -u murabot -f            # live logs
sudo systemctl restart murabot      # after `git pull` in /home/ubuntu/muragoods
```

The unit uses `Restart=always` with a 5s backoff and a start-rate limit, so a
crash loops into a safe backoff instead of hammering Discord. Secrets live in
`/etc/murabot.env` (root-owned, 0600) — nothing sensitive is in the repo.

## What this kit deliberately does NOT do

- It does not move the website or dashboard — those stay on Vercel.
- It does not expose the bot's HTTP API publicly. If you later point the
  dashboard's `BOT_HEALTH_URL` at the VM, put it behind a reverse proxy with
  TLS and keep the `DISCORD_BRIDGE_SECRET` check enabled.
- It does not fake availability: if the VM is down, `/health` is unreachable —
  the dashboard shows exactly that.
