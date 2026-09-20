# Phase 2 — PostgreSQL and Data Layer Foundation

Status: implementation complete in source; real PostgreSQL migration execution must be validated on a machine with Docker/PostgreSQL available.

## What changed

### PostgreSQL runtime

- Added PostgreSQL 17 to Docker Compose.
- PostgreSQL binds to loopback by default.
- Added persistent `accabad_postgres_data` Docker volume.
- Added PostgreSQL health checks.
- Added a one-shot `db-migrate` service; the application starts only after migrations succeed.

### Versioned migrations

Created:

- `db/migrations/0001_initial_schema.sql`
- `db/migrations/0002_seed_safe_defaults.sql`

The migration runner creates `schema_migrations` and stores the SHA-256 checksum of every applied migration. Already-applied migration files are immutable: changing their checksum causes startup/migration failure.

Migration application and its `schema_migrations` record occur inside the same PostgreSQL transaction. A PostgreSQL advisory transaction lock serializes migration runners.

### Core data model

The schema now covers:

- admins / roles / permissions / sessions
- Telegram users
- Kripicard accounts
- account assignments
- cards
- card requests
- funding requests + append-only events
- receipts
- card operations
- card transactions
- Outlook/Gmail account connections
- inbound email messages
- OTP deliveries
- support conversations/messages
- exchange rates
- settings
- audit logs
- webhook deduplication
- idempotency keys
- transactional outbox foundation
- background job history

### Important database invariants

- `telegram_account_assignments.account_id` is unique: one Kripicard account cannot have two Telegram owners.
- One Telegram user may still have multiple account assignment rows.
- Provider cards are deduplicated by account/provider card ID.
- Provider transactions are deduplicated by provider ID or deterministic fingerprint.
- Financial/card operations require unique idempotency keys.
- Webhook source/external IDs are unique.
- Funding status history has a separate append-style event table.
- Email providers are constrained to `outlook` or `gmail` for v1.
- `account_balance_usd_cents` is nullable, and an unavailable balance must remain NULL rather than pretending `$0.00` is authoritative.

### Safe defaults

The seed migration adds non-destructive defaults such as:

- platform card limit: 3
- minimum card funding: USD 20
- minimum card creation: USD 20
- live provider writes: false
- supported email providers: Outlook + Gmail
- account balance display mode: unavailable

It also seeds the initial role and permission names, but creates no admin user or credential.

### Data-access boundary

Added domain records and repository contracts under:

- `server/database/`
- `server/repositories/`

Concrete PostgreSQL repository/query implementations are intentionally deferred to **Phase 3 — Backend Application API**. React components must never query PostgreSQL directly.

### Readiness

`GET /ready` now requires:

- valid environment configuration; and
- a reachable PostgreSQL host/port.

It intentionally performs only an infrastructure reachability check in Phase 2. Phase 3 will upgrade this to a real authenticated query through the PostgreSQL application driver.

### Backup/recovery scaffolding

Added:

```bash
npm run db:backup
npm run db:restore-test -- backups/<file>.dump
```

Restore-test restores into a temporary database rather than overwriting the live database.

## Validation performed in the packaging environment

Passed:

- database schema contract tests
- package/package-lock root consistency
- Bash syntax validation for migration/backup/restore tooling
- JSON parsing
- static repository layout validation

Not executable in the packaging environment:

- real PostgreSQL migration execution (`psql`/Docker unavailable here)
- Docker Compose startup
- clean `npm ci` / full application build, because the npm registry is unavailable from this sandbox

## Required Phase 2 acceptance test on your server/dev machine

```bash
cp .env.example .env
# Set a real DATABASE_PASSWORD and APP_BASE_URL.

docker compose up -d --build

docker compose ps
docker compose logs db-migrate
npm run db:status
curl http://127.0.0.1:3000/ready

npm run db:backup
npm run db:restore-test -- backups/<generated-backup>.dump
```

Also run the Phase 1 verification when registry access is available:

```bash
npm ci --no-audit --no-fund
npm run verify
```

## Next phase

**Phase 3 — Backend Application API** will add the real PostgreSQL driver/pool, concrete repositories and transactions, typed API endpoints, request IDs/error semantics, and begin replacing the UI's demo `useState` data with backend reads/writes.
