# Deploying AccAbad Admin (simple, single-admin)

This gets the panel running with Docker Compose using a **bundled Postgres**, and it
**skips ClamAV and the production rollout gates** for simplicity.

## What runs

`docker compose up` starts:

| Service | Role |
|---------|------|
| `postgres` | PostgreSQL 17 (data persists in the `accabad_postgres_data` volume) |
| `db-migrate` | One-shot: creates the DB schema, then exits |
| `accabad-admin` | The web panel (port 3000) |
| `accabad-worker` | Background jobs (email sync / OTP expiry / Telegram outbox) |
| `admin-bootstrap` | One-shot tool (profile `tools`) that creates the first admin |

## Prerequisites

- Docker Engine + Docker Compose v2

## 1. Configure `.env`

**Easiest:** run the setup script — it creates `.env` with a clean DB name (`accabad_admin`)
and freshly generated secrets:

```bash
./setup.sh
```

**Or manually:**

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

- `DATABASE_NAME` / `DATABASE_USER` — project-specific (a unique value like `accabad_863c34`
  avoids collisions on a shared Postgres).
- `DATABASE_PASSWORD` — **≥ 12 characters**.
- `APP_ENCRYPTION_KEY` — generate with `openssl rand -base64 32`. **Back this up**; losing it
  makes stored secrets unreadable.
- `APP_BASE_URL` — the URL you'll reach the panel at (e.g. `http://localhost:3000`).

Keep **`APP_ENV=staging`** for a simple deploy. Switching to `production` re-enforces
HTTPS-only URLs **and** fail-closed ClamAV scanning (which this lean setup removed).

## 2. Build and start

```bash
docker compose up -d --build
```

The schema is created **automatically** by the `db-migrate` step — you do **not** run
migrations manually. Watch it come up:

```bash
docker compose ps
docker compose logs -f accabad-admin
```

## 3. Create the first admin

```bash
docker compose --profile tools run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL='you@example.com' \
  -e BOOTSTRAP_ADMIN_PASSWORD='a-strong-password-12+' \
  admin-bootstrap
```

`BOOTSTRAP_ADMIN_DISPLAY_NAME` is optional (defaults to “Super Admin”). This refuses to run if
an admin already exists.

## 4. Open the panel

<http://localhost:3000> — bound to `127.0.0.1` by default.

To reach it from another machine, either:

- put a reverse proxy (Caddy/Nginx) in front and set `APP_BASE_URL` to that public URL, **or**
- set `ACCABAD_BIND_IP=0.0.0.0` in `.env` to expose port 3000 directly (less safe).

## Health checks

- `http://localhost:3000/health` — liveness
- `http://localhost:3000/ready` — readiness + environment info

## Enabling real card creation / funding later

Provider writes are **OFF** by default (safe). When you're ready, set in `.env`:

```env
ENABLE_LIVE_PROVIDER_WRITES=true
ENABLE_KRIPICARD_CARD_CREATION=true      # and/or ENABLE_KRIPICARD_CARD_FUNDING=true
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
```

then `docker compose up -d`. Money-moving calls are **single-attempt (no auto-retry)** by design
to prevent double-spend.

## Common commands

```bash
docker compose ps          # status
docker compose logs -f     # follow logs
docker compose restart     # restart app + worker
docker compose down        # stop (keeps the data volume)
docker compose down -v     # stop AND delete the database volume
npm run db:status          # show applied migrations (requires compose up)
```

## Upgrading

```bash
git pull
docker compose up -d --build
```

Any new migrations apply automatically via `db-migrate` on startup.
