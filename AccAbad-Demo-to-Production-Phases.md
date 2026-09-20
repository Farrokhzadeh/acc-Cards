# AccAbad Admin — Demo to Production Implementation Phases

Version: 1.1  
Status: Production migration plan  
Current implementation: Phase 24 tooling (production rollout blocked pending Phase 22/23 gates)  
Production database: PostgreSQL

---

## 0. Current Product Decisions

These decisions should be treated as the current AccAbad baseline before production implementation begins.

- Product name: **AccAbad Admin**
- PostgreSQL will be the production database.
- The existing v3 admin UI is the visual/UX baseline.
- Kripicard accounts may show an account balance area for future use, but the UI must not claim a live balance unless a real provider balance endpoint exists.
- The supplied Kripicard documentation confirms a **wallet-based** provider model: crypto deposits credit the Kripicard account wallet, and `createcard` / `fundcard` debit that wallet. The earlier direct-crypto prototype flow is not a documented provider capability and must not be used for production.
- Email providers supported by AccAbad:
  - Outlook / Hotmail
  - Gmail
- Proton, Atomic Mail, custom-domain inboxes, and other email providers are out of scope for the first production release.
- Telegram users must never receive Kripicard account credentials or privileged account/card administration capabilities.
- Sensitive operations must be server-side only.
- Production implementation should begin as a **modular monolith**, not microservices.

---

# Phase 1 — Repository and Production Baseline

## Goal

Turn the current demo source into a clean production repository and reproducible build.

## Changes

1. Freeze the current v3 UI as the visual baseline.
2. Remove generated/runtime folders and bundled dependencies from source control:
   - `node_modules`
   - `.sites-runtime`
   - build artifacts
3. Confirm the Node version required by the project.
4. Ensure the project builds from a clean checkout using:
   ```bash
   npm ci
   npm run build
   ```
5. Create proper environment files:
   - `.env.example`
   - development environment
   - staging environment
   - production environment
6. Add typed environment validation.
7. Add Docker support for the real application.
8. Add health endpoints:
   - `/health`
   - `/ready`
9. Add CI checks for:
   - install
   - lint
   - typecheck
   - tests
   - production build
10. Keep all live provider writes disabled by default.

## Exit Criteria

- Clean checkout builds successfully.
- Docker image builds successfully.
- No secrets exist in the repository.
- Staging can be deployed reproducibly.

---

# Phase 2 — PostgreSQL and Data Layer

## Goal

Replace all React/in-memory demo state with authoritative persistent storage.

## Technology

**PostgreSQL** is the production database.

SQLite may be used only for isolated local experiments/tests if useful, but staging and production should use PostgreSQL.

## Main Tables

Initial production schema should include at least:

- `admins`
- `roles`
- `permissions`
- `admin_sessions`
- `telegram_users`
- `kripi_accounts`
- `telegram_account_assignments`
- `cards`
- `card_requests`
- `funding_requests`
- `funding_request_events`
- `card_operations`
- `card_transactions`
- `email_accounts`
- `email_messages`
- `otp_deliveries`
- `conversations`
- `messages`
- `exchange_rates`
- `settings`
- `audit_logs`
- `webhook_events`
- `idempotency_keys`
- `outbox_events`
- `job_runs`

## Required Database Rules

1. One Kripicard account may be assigned to only one Telegram user at a time.
2. One Telegram user may own multiple Kripicard accounts.
3. Provider card IDs must be unique within the correct ownership scope.
4. Telegram updates must be deduplicated.
5. Provider transaction IDs/fingerprints must be deduplicated.
6. Money-changing operations must have unique idempotency keys.
7. Financial/status history should be append-only where possible.
8. All timestamps should use UTC.
9. Soft-delete/archive should be used when financial history must remain.
10. Migrations must support forward deployment and rollback strategy.

## Exit Criteria

- Demo state is no longer the authoritative source.
- Refresh/restart does not lose data.
- Assignment/idempotency constraints pass concurrency tests.
- PostgreSQL backup and restore have been tested.

---

# Phase 3 — Backend Application API

## Goal

Create one authoritative backend for the admin UI, Telegram, email, provider calls, jobs, and audit.

## Suggested Modules

- `identity`
- `accounts`
- `cards`
- `clients`
- `funding`
- `payments`
- `email`
- `telegram`
- `messaging`
- `audit`
- `configuration`
- `providers`
- `jobs`
- `operations`

## Rules

- Frontend must never call Kripicard directly.
- Frontend must never contain:
  - Kripicard API keys
  - account passwords
  - Telegram bot token
  - Gmail/Outlook OAuth secrets
  - PAN
  - CVV
  - OTP values
  - crypto payment credentials
- All authorization checks must happen on the backend.
- API responses must use consistent error codes.
- Every request should have a request/correlation ID.

## Exit Criteria

- Admin UI reads and writes through the backend API.
- No important production state remains inside React `useState`.
- Authorization can be enforced independently of the frontend.

---

# Phase 4 — Admin Authentication, RBAC, and Secret Protection

## Goal

Protect the system before real provider credentials are added.

## Features

1. Admin login.
2. Secure password hashing or SSO.
3. Secure server-side sessions.
4. CSRF protection where applicable.
5. Login rate limiting.
6. Roles:
   - Super Admin
   - Operator
   - Finance Reviewer
7. Permission-level checks.
8. MFA for privileged roles/actions.
9. Reauthentication before:
   - revealing account password
   - revealing API key
   - changing bot token
   - large funding operation
   - destructive operation
10. Immutable audit logs.

## Secret Storage

Encrypt at rest:

- Kripicard API keys
- Kripicard passwords
- Microsoft OAuth refresh tokens
- Google OAuth refresh tokens
- Telegram bot token
- future payment-provider secrets

Master encryption key must not be stored in PostgreSQL.

## Exit Criteria

- Unauthorized backend calls fail even if UI controls are bypassed.
- Secret reveal is permissioned, temporary, and audited.
- No secret appears in logs.

---

# Phase 5 — Real Kripicard Read-Only Integration

## Goal

Connect one real test/sandbox Kripicard account without enabling money movement.

## Implement First

1. Add account.
2. Store encrypted API key/password.
3. Test connection.
4. List cards.
5. Card details.
6. Card transactions.
7. Sync account/card state.
8. Manual refresh.
9. Scheduled refresh.
10. Provider error/backoff state.

## Account Balance Rule

Keep the balance section in the UI, but do not display a fabricated live value.

Until Kripicard provides a real wallet-balance endpoint, display something like:

```text
Account balance
—
Live balance unavailable
```

or:

```text
Estimated balance
$X
Derived from known operations
```

if AccAbad later maintains a derived ledger.

## Exit Criteria

- Real cards appear from the provider.
- Real transactions can be synchronized.
- One invalid Kripicard account does not break others.
- Provider secrets never reach the browser.

---

# Phase 6 — Card Actions Without Money Movement

## Goal

Enable safe provider operations before card creation/funding.

## Actions

1. Card details.
2. Freeze card.
3. Unfreeze card.
4. Transaction history.
5. Card status synchronization.
6. Provider capability detection if some features differ by account.

## Requirements

- Ownership must be checked server-side.
- Operations must be audited.
- Provider timeout must not produce a false success.
- Read calls may use bounded retries.
- Write calls must not be blindly retried after ambiguous failures.

## Exit Criteria

- Freeze/unfreeze works safely against a test provider account.
- Provider errors are mapped clearly.
- Operations can be reconciled after uncertain outcomes.

---

# Phase 7 — Outlook / Hotmail Integration

**Phase 7 implementation status:** Implemented in source, including delegated OAuth, encrypted refresh/delta state, manual synchronization, reconnect/revoke handling, and a protected cron-safe background synchronization hook. Live Microsoft OAuth validation still requires a real app registration and mailbox.

## Goal

Allow each AccAbad/Kripicard account to connect a Microsoft mailbox.

## Integration

Use:

**Microsoft Graph + OAuth 2.0**

Do not use the mailbox password for routine inbox API access.

## Required Features

1. Connect Outlook/Hotmail account.
2. OAuth authorization.
3. Encrypt refresh token.
4. Refresh access token automatically.
5. Read Inbox.
6. Store normalized email metadata.
7. Sync new messages.
8. Handle revoked authorization.
9. Reconnect flow.
10. Background synchronization or webhook/change-notification support.

## Store

- provider
- email address
- encrypted OAuth token material
- connection status
- last successful sync
- last error

## Exit Criteria

- A test Hotmail/Outlook inbox is readable inside AccAbad.
- Revoked authorization is detected.
- No Microsoft credentials appear in frontend logs/database plaintext.

---

# Phase 8 — Gmail Integration

## Goal

Support Gmail as the second and only other email provider for v1.

## Integration

Use:

**Gmail API + Google OAuth 2.0**

## Required Features

Same behavior as Outlook:

1. Connect Gmail.
2. OAuth authorization.
3. Encrypted refresh token.
4. Inbox synchronization.
5. Message storage.
6. Reconnect handling.
7. New-message detection.
8. Attachment policy.

## Exit Criteria

- Gmail inbox can be viewed through AccAbad.
- Outlook and Gmail present a consistent UI despite using different provider APIs.

---

# Phase 9 — Email Classification and OTP / 3DS Handling

**Implementation status: completed in AccAbad Admin Phase 9.**

## Goal

Use connected inboxes for verification/security email and 3DS/OTP workflows.

## Processing Pipeline

```text
Outlook / Gmail
      ↓
AccAbad email connector
      ↓
Normalize message
      ↓
Trusted sender/template check
      ↓
Classify
      ↓
Normal email / verification / security / OTP-3DS
```

## Rules

1. Do not forward arbitrary email content automatically.
2. Maintain trusted sender/template rules.
3. Unknown templates should be quarantined for admin review.
4. OTP values must be encrypted at rest.
5. OTP values should expire quickly.
6. OTP must not appear in application logs.
7. Only the currently assigned Telegram user may receive a relevant OTP.
8. Full mailbox content remains admin-only.

## Exit Criteria

- Trusted OTP can be extracted from known templates.
- Unknown sender/template is not automatically forwarded.
- OTP expiration/redaction works.

---

# Phase 10 — Telegram Bot

## Goal

Turn the current Telegram concept into a real user-facing bot.

## Required Features

### Entry

- `/start`
- upsert Telegram identity
- ban check
- required-channel check if enabled
- account assignment gate

### User Menu

- My Cards
- Card Details
- Freeze / Unfreeze
- Transactions
- Request Card
- Add Funds
- My Requests
- Support
- OTP / 3DS delivery

## Security Rules

- Deduplicate Telegram `update_id`.
- Recheck ownership on every sensitive callback.
- Never trust username, last4, or callback payload as authorization.
- Use opaque/signed callback tokens.
- User with no assignment sees only the contact-admin message.
- Unassigning an account immediately removes card visibility.
- Telegram users must never see Kripicard credentials.

## Exit Criteria

- Test Telegram user can see only assigned accounts/cards.
- Duplicate updates do not create duplicate requests.
- Unassigned/banned users cannot access protected functions.

---

# Phase 11 — Client Assignment and Authorization

**Implementation status:** Completed in Phase 11 source package.

## Goal

Make account ownership rules production-safe.

## Required Behavior

1. One Kripicard account → maximum one Telegram user.
2. One Telegram user → multiple Kripicard accounts allowed.
3. Assign account.
4. Unassign one.
5. Unassign all.
6. Search full account dataset.
7. Prevent race conditions between two admins assigning the same account.
8. Invalidate stale authorization/menu state after assignment changes.

## Exit Criteria

- Concurrency cannot assign one account to two users.
- User always sees the union of cards from currently assigned accounts only.

---

# Phase 12 — Card Request Workflow

**Status: implemented in source.**

## Goal

Allow Telegram users to request cards without calling Kripicard directly.

## User Flow

```text
Telegram user
    ↓
Request card
    ↓
Pending request
    ↓
Admin review
    ↓
Approve / Reject
```

## Data

- requested amount
- BIN/product
- cardholder name
- email
- DOB only when required
- preferred/selected account
- status history
- admin notes

## Platform Card Limit

Apply a configurable AccAbad card/request limit across the user's assigned accounts.

Do not label this as a Kripicard KYC limit unless provider documentation explicitly confirms it.

## Exit Criteria

- Telegram user cannot create a provider card directly.
- Concurrent requests cannot exceed platform limits.

---

# Phase 13 — Funding Request and Receipt Workflow

## Goal

Capture user payment requests before any card funding action.

## User Flow

```text
User selects card
      ↓
Amount
      ↓
Quote
      ↓
Upload evidence
      ↓
Pending review
```

## Required Features

- configurable minimum
- USD amount
- service fee snapshot
- exchange-rate snapshot
- local currency total if applicable
- receipt upload
- private storage
- content-type validation
- size limit
- malware scanning
- request timeline
- admin accept/reject/correction-needed

## Exit Criteria

- Existing quote never changes when later rates/fees change.
- Receipt files are private.
- Illegal status transitions are rejected.

---

# Phase 14 — Confirm Live Wallet / Deposit Operational Details

## Goal

Validate the remaining operational details before enabling money-changing provider calls.

## Confirmed From Supplied Kripicard Documentation

The current documented provider model is wallet-based:

```text
Crypto deposit
    ↓
Kripicard account wallet
    ↓
Create card / Fund card
```

`createcard` and `fundcard` debit the owning account wallet. The supplied documentation does not describe direct crypto payment to an individual create/fund operation. AccAbad must not implement the earlier direct-crypto demo assumption unless Kripicard publishes a new supported contract.

## Still Confirm Before Live Money

- production rate limits and concurrency guidance;
- create/fund idempotency guarantees or reconciliation identifiers;
- current fee schedule;
- live BIN availability/catalogue;
- wallet balance endpoint, if one exists;
- deposit webhooks and delivery guarantees;
- underpayment/overpayment/late-payment behavior;
- production account capability differences.

## Implementation Status — Phase 14

Implemented in source:

- database-backed provider-readiness checks and append-only evidence history;
- supplied-PDF facts seeded separately from unresolved production questions;
- RBAC/CSRF-protected readiness API;
- deposit coins/networks/status read contracts plus sanitized fixtures;
- reusable `assertProviderMoneyReadiness()` guard for later money-changing phases;
- Settings UI shows the current blockers;
- no create-deposit/create-card/fund-card provider method exists yet.

The operational gate is intentionally **not cleared** until Kripicard provides written answers and/or controlled live/sandbox evidence for the remaining blockers.

## Exit Criteria

- Remaining live operational answers are documented.
- Production creation/funding workflow follows the wallet-based provider contract.
- Kill switches and reconciliation behavior are exercised before real funds are enabled.

---

# Phase 15 — Real Card Creation ✅ IMPLEMENTED

**Phase 15 implementation note:** real `createcard` issuance is available only from an approved request, behind two deployment kill switches and recent admin reauthentication. Provider purchase writes are single-attempt; uncertain outcomes reconcile via `cards/list` and are never auto-retried.

## Goal

Implement provider card creation after the payment model is confirmed.

## Requirements

1. Admin-only action.
2. Select exact account.
3. Validate card request.
4. Validate BIN requirements.
5. Create unique operation/idempotency key.
6. Obtain provider payment instruction if required.
7. Admin completes required payment.
8. Poll/receive payment confirmation.
9. Call/complete provider create-card operation.
10. Persist provider card ID.
11. Sync card details.
12. Complete request.
13. Notify Telegram user.
14. Reconcile ambiguous outcomes.

## Exit Criteria

- Double clicks/retries cannot create two cards.
- Unknown outcomes enter reconciliation state instead of blind retry.

---

# Phase 16 — Real Card Funding ✅ IMPLEMENTED

## Goal

Fund the exact selected card safely.

**Phase 16 implementation note:** funding executes only from an accepted funding request with a clean receipt. AccAbad creates a unique local operation/lock but does not claim provider-side idempotency. It calls `fundcard` exactly once, never auto-retries an uncertain result, and requires read-only reconciliation plus provider confirmation when the outcome cannot be proven.

## Required Flow

```text
Accepted funding request + clean receipt
      ↓
Recheck exact owned card + account
      ↓
Create one local funding operation / lock
      ↓
Capture safe pre-write provider evidence
      ↓
Fund exact provider card ID once
      ↓
Success → sync safe balance → complete request
      ↓
Uncertain → needs_reconciliation (no second fundcard)
      ↓
Notify user
```

## Requirements

- Use provider card ID whenever possible.
- Never rely on last4 alone if ambiguous.
- Double-click/reload/worker replay must not create concurrent unresolved funding writes.
- Store provider outcome/reference metadata without inventing a provider operation ID.
- Store confirmed amount and fees.
- Use `needs_reconciliation` for uncertain responses.

## Exit Criteria

- One intended funding operation can produce only one provider debit/credit action.

---

# Phase 17 — Transaction Synchronization and Notifications

## Goal

Keep card activity synchronized and notify the correct current user.

## Required Features

1. Scheduled transaction sync.
2. Provider transaction ID/fingerprint deduplication.
3. Detect new transactions.
4. Resolve current account assignment at notification time.
5. Send redacted Telegram notification.
6. Never notify a former assignee from cached ownership.
7. Admin reconciliation for mismatches.

## Exit Criteria

- Repeated synchronization does not duplicate alerts.
- Assignment changes immediately affect future notifications.

---

# Phase 18 — Messaging and Support

## Goal

Create real two-way support between admins and Telegram clients.

## Features

- conversation list
- unread state
- Telegram-to-admin messages
- admin-to-Telegram messages
- attachments
- delivery status
- retry
- deduplication
- audit trail

## Exit Criteria

- Admin messages are delivered once or visibly fail.
- User/admin conversation state remains synchronized.

---

# Phase 19 — Background Jobs and Queue ✅ IMPLEMENTED

## Goal

Move asynchronous work out of web requests.

## Jobs

- card synchronization
- transaction synchronization
- Outlook sync
- Gmail sync
- OTP parsing
- Telegram outbox
- notification delivery
- reconciliation
- sensitive-data expiry
- stale-session cleanup
- exchange-rate refresh if used

## Initial Architecture

A simple worker + PostgreSQL-backed job/outbox system may be sufficient initially.

Redis can be added later if load requires it.

## Exit Criteria

- Worker restart does not duplicate money or notifications.
- Failed jobs can be retried/dead-lettered safely.

---

# Phase 20 — Audit, Observability, and Operations

## Goal

Make the system operable and diagnosable.

## Audit

Audit:

- login
- logout
- credential reveal
- account creation/update/archive
- assignment/unassignment
- card operation
- request transition
- money-changing operation
- Telegram admin message
- settings change
- email connection change
- OTP delivery metadata

Never include raw secrets in audit metadata.

## Monitoring

Track:

- provider failures
- provider timeouts
- card sync lag
- transaction sync lag
- Outlook sync failures
- Gmail sync failures
- Telegram delivery failures
- webhook backlog
- OTP parsing failures
- stuck operations
- repeated secret reveals
- DB/worker health

## Exit Criteria

- Operators can identify stuck/failed operations without reading raw application logs.

---

# Phase 21 — Backup, Recovery, and Kill Switches

## Goal

Protect production data and stop dangerous writes quickly.

## Requirements

1. Automated PostgreSQL backups.
2. Off-host backup copy.
3. Restore procedure.
4. Restore test.
5. Migration rollback/recovery procedure.
6. Feature flags:
   - Kripicard writes
   - card creation
   - card funding
   - Telegram sends
   - Outlook sync
   - Gmail sync
7. Emergency provider-write kill switch.
8. Read-only mode.

## Exit Criteria

- Production writes can be stopped without taking the admin panel completely offline.
- Database can be restored successfully.

---

# Phase 22 — Security Hardening

## Goal

Complete security work before real customers and funds.

## Required Review

- RBAC
- MFA
- session security
- CSRF
- IDOR/access-control testing
- API rate limiting
- webhook verification
- file-upload security
- dependency scan
- secret scan
- log redaction
- encryption/key management
- secure headers
- TLS
- CSP where appropriate
- penetration testing
- card-data handling review

## Card Data

Do not persist PAN/CVV unless a documented compliance requirement and secure vault architecture exist.

Prefer provider card IDs + last4 + non-sensitive metadata.

## Exit Criteria

- No high-severity security issue remains open.
- Sensitive credentials/card data are absent from logs and analytics.

---

# Phase 23 — Staging Acceptance Test

## Goal

Test the complete system with sandbox/test accounts before live users.

## Required Scenario

```text
Admin login
   ↓
Add Kripicard test account
   ↓
Test connection
   ↓
Sync real test cards
   ↓
Connect Outlook or Gmail
   ↓
Read test inbox
   ↓
Start Telegram test bot
   ↓
Register test Telegram user
   ↓
Assign account
   ↓
User sees assigned cards
   ↓
Freeze / Unfreeze
   ↓
Card request
   ↓
Funding request
   ↓
Receipt review
   ↓
Sandbox payment/create/fund
   ↓
Transaction sync
   ↓
Telegram notification
   ↓
OTP email parse/delivery
```

## Test Categories

- unit tests
- database tests
- provider contract tests
- integration tests
- end-to-end tests
- concurrency tests
- authorization tests
- resilience tests
- upload security tests
- load tests
- backup/restore test

## Exit Criteria

- Full workflow passes without manual database modification.
- Duplicate requests/webhooks/retries cannot duplicate financial actions.

---

# Phase 24 — Controlled Production Rollout

## Goal

Move from staging to real usage gradually.

## Rollout

### Step 1

- internal admins only
- real read-only provider data
- no live money-changing writes

### Step 2

- small number of test Telegram users
- real email
- real Telegram
- still restricted provider writes

### Step 3

- limited live card actions
- low transaction limits
- manual reconciliation of every operation

### Step 4

- limited production card creation/funding
- alerts enabled
- manual review of first operations

### Step 5

- expand user count gradually

## Exit Criteria

- Live writes can be disabled instantly.
- First production operations match provider records, local DB state, and audit history.

---

# Recommended Initial Production Deployment

The first production architecture does not need Kubernetes or microservices.

```text
Internet
   │
   ▼
Nginx / Reverse Proxy
   │
   ▼
AccAbad Application
   │
   ├── PostgreSQL
   ├── Worker
   ├── Private file storage
   │
   ├── Kripicard API
   ├── Microsoft Graph
   ├── Gmail API
   └── Telegram Bot API
```

Suggested Docker services:

```text
accabad-app
postgres
accabad-worker
redis              # optional initially
```

---

# Recommended Implementation Order

The practical engineering order should be:

1. Repository cleanup and reliable build
2. PostgreSQL
3. Backend API
4. Admin authentication/RBAC
5. Encryption/secret management
6. Kripicard read-only integration
7. Freeze/unfreeze
8. Outlook integration
9. Gmail integration
10. Email inbox and OTP parser
11. Telegram bot
12. Account assignment
13. Card request workflow
14. Funding request workflow
15. Confirm real Kripicard payment model
16. Card creation
17. Card funding
18. Transaction synchronization
19. Support messaging
20. Workers/jobs
21. Audit/monitoring
21. Backup/recovery
22. Security hardening
23. Staging acceptance testing
24. Controlled production rollout

---

# Information Needed Before Financial Production Work

The following must be available before enabling real money:

## Kripicard

- test/sandbox account
- API key
- current API documentation
- production base URL
- sandbox base URL if different
- rate limits
- fee schedule
- BIN catalog
- idempotency behavior
- webhook availability
- direct crypto create/fund confirmation
- wallet balance endpoint confirmation
- 3DS delivery details

## Microsoft

- Azure/Microsoft application registration
- OAuth client ID
- OAuth client secret/certificate
- redirect URL

## Google

- Google Cloud project
- Gmail API enabled
- OAuth client ID
- OAuth client secret
- redirect URL

## Telegram

- BotFather bot token
- public HTTPS webhook URL
- webhook secret

## Infrastructure

- production server
- production domain/subdomain
- TLS certificate
- PostgreSQL storage/backup location
- secret/encryption master key strategy

---

# Definition of Production-Ready

AccAbad should not be considered production-ready merely because it is deployed.

Production-ready means:

- PostgreSQL is authoritative.
- Authentication/RBAC works.
- Secrets are encrypted.
- Kripicard integration is real and tested.
- Gmail/Outlook connections are real.
- Telegram bot is real.
- Money-changing actions are idempotent.
- Unknown provider results are reconciled safely.
- Audit logs exist.
- Backups are tested.
- Monitoring exists.
- Sensitive data is redacted.
- Security testing is complete.
- Live writes have kill switches.
- Provider payment behavior has been confirmed.
- Staging end-to-end tests pass.
