# AccAbad Admin

A multi-tenant card issuance & management admin panel (plus Telegram bot and email sync).

> **This branch is simplified for a single-admin deploy:** bundled Postgres via Docker Compose, **no ClamAV**, and all provider write-gates **OFF** by default. The original enterprise runbooks (pen-test scope, rollout/rollback, staging acceptance) are preserved under [`docs/archive/`](docs/archive/) if you ever need them.

## Run it — 3 steps

```bash
# 1. Configure - auto-generates .env (clean DB name + random secrets)
./setup.sh
#    (or manually: cp .env.example .env, then set DATABASE_PASSWORD + APP_ENCRYPTION_KEY)

# 2. Start everything (Postgres + schema + app + worker). Schema is created automatically.
docker compose up -d --build

# 3. Create your admin login
docker compose --profile tools run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL='you@example.com' \
  -e BOOTSTRAP_ADMIN_PASSWORD='a-strong-password-12+' \
  admin-bootstrap
```

Then open **http://localhost:3000** and sign in.

Full details (exposing ports, logs, enabling card/funding writes later) are in **[DOCKER-DEPLOY.md](DOCKER-DEPLOY.md)**.

## Tech stack

Node 22 · TypeScript · Next.js (Vinext) + React 19 · Drizzle ORM · PostgreSQL 17 · Docker

## Project layout

| Path | What it is |
|------|-----------|
| `app/` | UI pages + API routes |
| `server/` | Backend logic (auth, providers, jobs, database) |
| `db/` | Drizzle schema + SQL migrations (applied automatically on start) |
| `config/` | Environment schema & validation |
| `scripts/` | env check, admin bootstrap, db migrate/seed |
| `components/`, `lib/`, `hooks/`, `types/` | Shared frontend code |

## Notes

- **No manual migrations.** The `db-migrate` compose step creates the schema on first boot and is idempotent afterward.
- **Money operations are gated off** until you explicitly enable them in `.env` (see DOCKER-DEPLOY.md).
- Optional integrations (Outlook/Gmail OAuth, Telegram) are disabled until you add their credentials.
