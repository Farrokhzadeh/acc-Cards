# AccAbad Admin — Phase 4 Implementation

Status: implemented in source

## Scope completed

Phase 4 adds the production administrative security boundary on top of the Phase 3 PostgreSQL API.

Implemented:

- Password authentication using Node `scrypt` with per-password random salt.
- Opaque server-side admin sessions stored in PostgreSQL.
- HttpOnly `SameSite=Strict` session cookies.
- CSRF double-submit protection tied to the server-side session.
- Login failure rate limiting by account hash and IP.
- RBAC backed by `roles`, `permissions`, and `role_permissions`.
- TOTP MFA enrollment, enable, disable, and login challenge support.
- MFA challenge expiration and attempt limiting.
- Recent reauthentication requirement for credential reveal.
- AES-256-GCM envelope encryption for Kripicard passwords/API keys and future OAuth secrets.
- A dedicated application encryption key outside PostgreSQL.
- Audited credential reveal.
- Append-only audit log enforcement at the PostgreSQL trigger level.
- Protected `/api/v1/*` account/card/client/dashboard reads.
- Real encrypted create/update account persistence.
- Outlook/Gmail provider + mailbox metadata persistence (OAuth tokens intentionally deferred to the email phases).
- First-Super-Admin bootstrap command.
- Login page and dashboard authentication gate.
- Logout endpoint and UI action.

Provider money/card writes remain disabled.

## Database migration

`db/migrations/0003_admin_security.sql`

Adds:

- `admins.mfa_secret_encrypted`
- `admins.mfa_confirmed_at`
- `admin_sessions.csrf_token_hash`
- `admin_sessions.last_seen_at`
- `admin_auth_challenges`
- `admin_login_attempts`
- additional read/admin permissions
- role-permission mappings
- immutable audit trigger

Existing pre-Phase-4 sessions intentionally stop authenticating because they do not have a CSRF token hash.

## Required environment configuration

Generate an application encryption key once:

```bash
openssl rand -base64 32
```

Set it as:

```env
APP_ENCRYPTION_KEY=<generated-value>
```

Do not rotate this value casually. Existing encrypted secrets require the same key to decrypt. Production should keep it in a secret manager or another protected location outside PostgreSQL.

Session defaults:

```env
ADMIN_SESSION_HOURS=12
ADMIN_REAUTH_MINUTES=10
ADMIN_MFA_CHALLENGE_MINUTES=5
ADMIN_LOGIN_RATE_MAX_FAILURES=5
ADMIN_LOGIN_RATE_WINDOW_MINUTES=15
```

## Bootstrap the first Super Admin

After PostgreSQL is running and migrations have completed, create the first administrator once.

Recommended Docker command:

```bash
docker compose run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL='admin@example.com' \
  -e BOOTSTRAP_ADMIN_DISPLAY_NAME='Owner' \
  -e BOOTSTRAP_ADMIN_PASSWORD='use-a-long-unique-password' \
  admin-bootstrap
```

The bootstrap script refuses to run if an admin already exists.

Never place the bootstrap password in source control or `.env` permanently.

## Authentication API

```text
POST /api/v1/auth/login
POST /api/v1/auth/mfa
GET  /api/v1/auth/me
POST /api/v1/auth/logout
POST /api/v1/auth/reauthenticate
POST /api/v1/auth/mfa/setup
POST /api/v1/auth/mfa/enable
POST /api/v1/auth/mfa/disable
```

### MFA enrollment

1. Sign in.
2. Reauthenticate with `/api/v1/auth/reauthenticate`.
3. Call `/api/v1/auth/mfa/setup`.
4. Add the returned `otpauthUri` or secret to an authenticator app.
5. Verify a current six-digit code using `/api/v1/auth/mfa/enable`.

Once enabled, password login creates a short-lived MFA challenge before an admin session is issued.

## Secret handling

Account creation/update now encrypts:

- Kripicard account password
- Kripicard API key

Encryption format:

```text
v1.<iv>.<gcm-auth-tag>.<ciphertext>
```

using AES-256-GCM and `APP_ENCRYPTION_KEY`.

The browser receives only safe metadata and an API-key hint. Full credentials are returned only through:

```text
POST /api/v1/accounts/:id/reveal
```

Requirements:

- authenticated session
- `accounts.secrets.reveal` permission
- valid CSRF token
- reauthentication within the configured recent-auth window

Every reveal is audited.

Demo/legacy placeholder values such as `DEMO_ONLY` intentionally cannot be revealed. Update those accounts with real credentials first.

## RBAC

Roles:

- `super_admin`
- `operator`
- `finance_reviewer`

New read permissions include:

- `dashboard.read`
- `accounts.read`
- `clients.read`

Existing permissions continue to cover account management, cards, funding, inbox, configuration, audit, and secret reveal.

Super Admin receives all seeded permissions. Operators and finance reviewers receive narrower mappings.

Backend permission checks are authoritative; hiding a UI control is not considered authorization.

## CSRF

Authenticated sessions use two cookies:

- `accabad_session` — HttpOnly opaque session token
- `accabad_csrf` — non-HttpOnly CSRF token

Mutation requests must send the CSRF value in:

```text
X-CSRF-Token
```

The backend verifies the header, cookie, and server-side token hash.

## Account writes

Phase 4 enables real PostgreSQL-backed account creation and update from the admin UI.

Create requires:

- label
- login email
- password
- API key
- email provider (`outlook` or `gmail`)
- mailbox address

Update allows password/API key to remain unchanged by leaving those fields blank.

Changing an API key resets the connection status to pending until provider verification is implemented in Phase 5.

Account delete/archive is deliberately not enabled yet, because preservation rules need to be enforced against assignments, cards, requests, and financial history.

## Provider actions deliberately still blocked

When the dashboard is using PostgreSQL-backed production records, these actions do not simulate success:

- card creation
- card funding
- freeze/unfreeze
- client ban/unban
- account delete

They remain for later provider/domain phases.

## Validation

Source/static tests include Phase 4 security contract checks.

CI additionally runs PostgreSQL integration tests that confirm:

- security migration exists
- Super Admin receives all seeded permissions
- audit records reject update/delete

A full build requires dependencies plus a PostgreSQL service.
