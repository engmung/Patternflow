# Deploying the Patternflow community

Instructions for standing up the pattern community on a self-hosted box
(a Raspberry Pi 5, in the first instance) behind a Cloudflare Tunnel.

**This document is written to be handed to an AI coding agent running on the
target machine.** Steps marked **🙋 HUMAN** cannot be done by the agent — they
need a browser login or a dashboard the agent has no access to. When the agent
reaches one, it must stop, ask the person to do it, and wait.

---

## What is being deployed

One Next.js app serves both the marketing site and the community. Which of the
two a given deployment *is* depends purely on environment variables:

| | Main site (Vercel) | Community host (this box) |
|---|---|---|
| `COMMUNITY_ENABLED` | unset | `1` |
| Database | none | SQLite file on disk |
| `/community` | notice pointing at the community host | the real thing |

So this deployment runs the same code as the public site, with the community
switched on. Users reach it at `https://community.patternflow.work`.

The app lives in the `web/` subdirectory of the repository.

---

## Before starting

The person deploying needs:

- A Raspberry Pi 5 (8 GB recommended) running **64-bit** Raspberry Pi OS, reachable over SSH.
- The domain `patternflow.work` managed in **Cloudflare DNS** (it is, if the domain was bought there).
- Access to the Vercel project for the main site (for the very last step).

---

## Part A — Prepare the machine *(agent)*

### A1. Confirm the architecture is 64-bit

```bash
uname -m
```

Must print `aarch64`. On a 32-bit OS there are no prebuilt `better-sqlite3`
binaries for this platform and everything below gets much harder — stop and
report if it prints anything else.

### A2. Confirm Node.js 20 or newer

```bash
node -v
```

Next.js 16 needs Node 20.9+. If it is older or missing, install Node 22 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### A3. Install build tools for the native database driver

`better-sqlite3` is a native module. Prebuilt ARM64 binaries usually download
fine, but if they don't, npm falls back to compiling — which needs these:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 git sqlite3
```

---

## Part B — Get the code running *(agent)*

### B1. Clone

```bash
cd ~
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/engmung/Patternflow.git
cd Patternflow/web
```

`GIT_LFS_SKIP_SMUDGE=1` skips large Blender source files that the website does
not need.

### B2. Install dependencies

```bash
npm ci
```

If this fails on `better-sqlite3`, retry the compile explicitly:

```bash
npm rebuild better-sqlite3 --build-from-source
```

Then verify the driver actually loads — do not continue until it does:

```bash
node -e "const D=require('better-sqlite3'); const d=new D(':memory:'); d.exec('create table t(x)'); console.log('better-sqlite3 OK');"
```

### B3. Write the environment file

Create `web/.env.local`. It is gitignored, so `git pull` will never overwrite
it, and it must never be committed.

Generate a fresh session secret **on this machine** (do not reuse one from
anywhere else):

```bash
openssl rand -base64 32
```

Then write `.env.local` with that value:

```bash
cat > .env.local <<'EOF'
# ── Community host ──
COMMUNITY_ENABLED=1

# Paste the generated secret here:
BETTER_AUTH_SECRET=REPLACE_WITH_GENERATED_SECRET

# Public URL of this deployment — must match what users type in the browser,
# or login cookies will not stick.
BETTER_AUTH_URL=https://community.patternflow.work
NEXT_PUBLIC_COMMUNITY_URL=https://community.patternflow.work

# The main site is allowed to call this API (publishing from Pattern Lab).
# This is both the CORS allow-list and Better Auth's trustedOrigins.
COMMUNITY_ALLOWED_ORIGINS=https://patternflow.work

# Keep the database outside the git checkout so it is obviously not code.
COMMUNITY_DB_PATH=/home/pi/patternflow-data/community.db

# Analytics (optional — copy from the main site's settings, or omit)
# NEXT_PUBLIC_POSTHOG_KEY=
# NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
EOF
```

Adjust `/home/pi/...` if the user account is not `pi`, then create the directory:

```bash
mkdir -p /home/pi/patternflow-data
```

`web/.env.example` documents every variable if anything is unclear.

### B4. Build

```bash
npm run build
```

This takes several minutes on a Pi. **Never run `next dev` in production** —
it is slower and behaves differently.

### B5. First run and smoke test

```bash
npm start
```

The database file and its tables are created automatically on the first
request (migrations in `web/drizzle/` are applied at startup). In another
shell:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/community
sqlite3 /home/pi/patternflow-data/community.db '.tables'
```

Expect `200`, and a table list including `patterns`, `likes`, `comments`,
`user`, `session`. If `/community` instead returns the "community lives on its
own server" notice, `COMMUNITY_ENABLED=1` did not reach the process — check
`.env.local` and rebuild.

Stop the server (Ctrl-C) once this passes.

---

## Part C — Run it as a service *(agent)*

So it survives reboots and crashes.

```bash
sudo tee /etc/systemd/system/patternflow-community.service > /dev/null <<EOF
[Unit]
Description=Patternflow community (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/Patternflow/web
Environment=NODE_ENV=production
ExecStart=$(which npm) start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now patternflow-community
sudo systemctl status patternflow-community --no-pager
```

Verify it is serving:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/community
```

---

## Part D — Expose it with a Cloudflare Tunnel

A tunnel means no port forwarding, no exposed home IP, and no certificate to
manage — the Pi makes an outbound connection to Cloudflare.

### D1. Install cloudflared *(agent)*

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
```

### D2. 🙋 **HUMAN STEP** — authorise the tunnel

The agent must stop here and ask the person to run this themselves, because it
opens a browser and requires signing in to their Cloudflare account:

```bash
cloudflared tunnel login
```

In the browser that opens, select the **patternflow.work** zone and authorise.
This writes a certificate to `~/.cloudflared/cert.pem`. Tell the agent when it
is done.

### D3. Create the tunnel and DNS record *(agent)*

```bash
cloudflared tunnel create patternflow-community
cloudflared tunnel route dns patternflow-community community.patternflow.work
```

The second command creates the proxied DNS record automatically. If it reports
that the record already exists, that is fine.

Note the tunnel UUID printed by the first command, then write the config:

```bash
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: patternflow-community
credentials-file: $HOME/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: community.patternflow.work
    service: http://localhost:3000
  - service: http_status:404
EOF
```

Replace `<TUNNEL-UUID>` with the real UUID (the filename in `~/.cloudflared/`).

Install it as a service and start it:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

### D4. Verify from the outside *(agent)*

```bash
curl -sI https://community.patternflow.work/community | head -1
```

Expect `HTTP/2 200`. DNS may take a minute to propagate on first setup.

---

## Part E — Connect the main site

### E1. 🙋 **HUMAN STEP** — add one variable in Vercel

Until this is done, the community works standalone but the main site does not
know about it — Pattern Lab's "Share to Community" button stays hidden by
design, so nobody is offered a button that cannot work.

In the Vercel project for `patternflow.work`, add an environment variable for
**Production**:

```
NEXT_PUBLIC_COMMUNITY_URL = https://community.patternflow.work
```

Then redeploy (Vercel does not apply new variables to an existing build).

Do **not** set `COMMUNITY_ENABLED` on Vercel — it has no database, and the
community must stay on this box.

### E2. End-to-end check *(human, in a browser)*

1. `https://community.patternflow.work/community` — the feed loads without logging in.
2. Create an account, publish a pattern from Pattern Lab there.
3. On `https://patternflow.work/pattern-lab`, the "Share to Community" button now appears; publishing from it should work (this is the cross-origin path).
4. Open a pattern, comment, like, and try "Open in Pattern Lab".

If step 3 fails, check the browser console: a CORS error means
`COMMUNITY_ALLOWED_ORIGINS` on the Pi does not exactly match the main site's
origin (`https://patternflow.work`, no trailing slash).

---

## Ongoing operations

### Updating after a code change

Pushing to GitHub does **not** update this box — Vercel auto-deploys, this one
does not. To pull a change in:

```bash
cd ~/Patternflow && git pull
cd web && npm ci && npm run build
sudo systemctl restart patternflow-community
```

New database migrations apply themselves on the next start. `.env.local` and
the database file are untouched by `git pull`.

Save that as `~/deploy.sh` to make it one command.

### Backups

The database is the only thing here that cannot be recreated from git. Use
SQLite's own backup command — a plain `cp` of a live WAL-mode database can
produce an inconsistent copy:

```bash
sqlite3 /home/pi/patternflow-data/community.db ".backup '/home/pi/backups/community-$(date +%F).db'"
```

A daily cron entry is worth adding:

```
0 4 * * * sqlite3 /home/pi/patternflow-data/community.db ".backup '/home/pi/backups/community-$(date +\%F).db'"
```

Copy those backups off the Pi periodically — an SD card is not a backup.

### Logs

```bash
journalctl -u patternflow-community -f    # the app
journalctl -u cloudflared -f              # the tunnel
```

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/community` shows the "lives on its own server" notice | `COMMUNITY_ENABLED=1` missing; rebuild after fixing |
| Login appears to succeed but you are logged out on reload | `BETTER_AUTH_URL` does not match the public URL |
| Publishing from the main site fails with a CORS error | `COMMUNITY_ALLOWED_ORIGINS` mismatch on the Pi |
| `Cannot find module ... better_sqlite3.node` | `npm rebuild better-sqlite3 --build-from-source` |
| Site unreachable, app healthy on localhost | tunnel down: `systemctl status cloudflared` |
