# AccAbad Admin — Phase 3 Implementation

Version: 0.4.0  
Status: Backend Application API foundation

## Scope completed

Phase 3 converts the Phase 2 PostgreSQL schema into an actual server-side application data layer while keeping provider writes disabled.

### PostgreSQL runtime

- Added `pg` / node-postgres.
- Added a bounded PostgreSQL pool.
- Added connection, idle, and statement timeouts.
- Added transaction helper with `BEGIN`, `COMMIT`, and `ROLLBACK`.
- `/ready` now performs a real `SELECT 1` query.

### Repositories

Concrete PostgreSQL repositories now exist for:

- Kripicard accounts
- cards
- Telegram clients
- email-account connection metadata

All SQL values are parameterized. Route handlers do not contain SQL.

### HTTP/API foundation

Added versioned read endpoints:

```text
GET /api/v1/accounts
GET /api/v1/accounts/:id
GET /api/v1/accounts/:id/cards
GET /api/v1/cards
GET /api/v1/clients
GET /api/v1/clients/:id
GET /api/v1/clients/:id/cards
GET /api/v1/dashboard
```

List endpoints support:

- bounded page sizes
- search
- stable cursor pagination

Responses contain an `x-request-id` and JSON request ID. Errors use consistent codes such as:

- `validation_error`
- `not_found`
- `conflict`
- `database_timeout`
- `internal_error`

### Safe serialization

The new APIs never return:

- encrypted passwords
- encrypted API keys
- OAuth tokens
- PAN/CVV
- OTP values

Big integer money values are serialized as decimal strings to avoid JavaScript precision loss.

### UI transition

The current admin UI now attempts to load the core account/card/client snapshot from `/api/v1/dashboard`.

When Phase 3 staging API access is enabled and the backend succeeds:

- Accounts come from PostgreSQL.
- Cards come from PostgreSQL.
- Telegram clients come from PostgreSQL.
- Old demo email/request/transaction/chat rows are cleared rather than mixed with real database entities.
- Account balance displays `—` when the provider balance is genuinely unavailable rather than fabricating `$0.00`.
- Account writes remain intentionally blocked in database-backed mode until Phase 4 adds authentication and encrypted secret handling.

If the API is disabled/unavailable, the existing local demo data remains available for UI review.

## Security boundary before Phase 4

Phase 3 does **not** have admin authentication yet. To prevent accidental data exposure, the read API is disabled by default:

```env
ENABLE_PHASE3_UNAUTHENTICATED_READ_API=false
```

For development/staging only:

```env
APP_ENV=staging
ENABLE_PHASE3_UNAUTHENTICATED_READ_API=true
```

The environment validator rejects enabling this unauthenticated API in production.

## Demo database seed

An optional development/staging seed is available:

```bash
npm run db:seed-demo
```

The script refuses to run when `APP_ENV=production`.

The seed contains only synthetic data and placeholder credential values.

## Database integration test

Phase 3 includes a PostgreSQL integration test which confirms:

- PostgreSQL is queryable.
- core tables exist.
- one account cannot be assigned to two Telegram users.

Run after migrations:

```bash
npm run test:db-integration
```

## Deferred intentionally to Phase 4+

The following are intentionally not implemented here:

- admin login
- session authorization
- RBAC
- credential encryption/reveal
- production account creation/update/delete APIs
- real Kripicard calls
- Gmail/Outlook OAuth
- Telegram webhook/bot
- provider money writes

Those features must not be pulled into an unauthenticated Phase 3 API.
