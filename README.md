# AccAbad Admin

Current milestone: **Phase 24 — Controlled Production Rollout Tooling (release blocked)**.

The approved admin UI is backed by PostgreSQL, protected by real admin authentication/RBAC, connected to the documented Kripicard API, supports encrypted Outlook/Hotmail and Gmail OAuth with incremental inbox synchronization, classifies trusted OTP/3DS mail, includes a real Telegram webhook bot and durable Telegram outbox, persists client/account assignment changes with database-enforced one-owner semantics, accepts production card requests, and now accepts funding requests with immutable fee/rate snapshots plus private receipt evidence and admin review, tracks money-critical Kripicard provider assumptions in an auditable readiness gate, supports guarded real `createcard` issuance from approved card requests, guarded real `fundcard` execution from accepted funding requests, performs scheduled/deduplicated card-transaction synchronization with current-owner Telegram notifications, and now provides persistent two-way Telegram support conversations with unread state, private attachments, assignment/status controls, delivery tracking, and explicit failed-message retry. Crypto deposit creation remains disabled.

## Current capabilities

- Dockerized Vinext/Node admin app
- PostgreSQL 17 with versioned/checksummed migrations
- secure admin login, sessions, CSRF, RBAC, TOTP MFA and reauthentication
- database-backed API rate limits, idle-session expiry, trusted-proxy controls, and origin-bound CSRF checks
- CSP, HSTS, browser security headers, hardened containers, and fail-closed production upload scanning
- staging-only acceptance preflight, category runner, redacted evidence reports, black-box authentication/API checks, and bounded load smoke tooling
- a production release lock plus maintenance-window rollout validation, approvals, evidence, monitoring, and rollback planning
- AES-256-GCM encrypted Kripicard credentials
- real Kripicard `cards/list`, `carddetails`, and `transactions` integration
- PostgreSQL card/transaction synchronization and deduplication
- explicit live PAN/CVV reveal without persistence
- guarded Kripicard freeze/unfreeze
- no automatic retries for provider writes
- ambiguous freeze/unfreeze reconciliation with safe reads
- per-account provider capability tracking
- card status refresh without exposing PAN/CVV
- Outlook/Hotmail delegated OAuth using Microsoft Graph
- encrypted Microsoft refresh tokens and delta cursors
- incremental Inbox metadata synchronization
- revoked-authorization / reconnect handling
- cron-safe Outlook background sync hook with job/audit records
- Gmail OAuth using the Gmail API and `gmail.readonly`
- encrypted Google refresh tokens and Gmail history cursors
- Gmail full + history-based incremental Inbox synchronization
- Gmail revoked-authorization/reconnect handling
- cron-safe Gmail background sync hook with job/audit records
- trusted email classification, quarantine, encrypted short-lived OTP storage, and expiry/redaction
- verified Telegram webhook with update deduplication and opaque callback tokens
- Telegram ban/force-join/account-assignment gates
- production-persistent client/account assignment and unassignment
- database-enforced one-account/one-client ownership with concurrency conflict handling
- server-side search for unassigned accounts plus the client's current assignments
- immutable assignment-event history plus redacted admin audit records
- immediate Telegram authorization changes on the next command/callback
- production Telegram card-request submission with documented BIN/DOB fields
- transactional card + open-request limit enforcement across assigned accounts
- admin card-request review with current-assignment recheck and selected issuing account
- append-only card-request timeline plus redacted audit history
- durable Telegram status notifications for reviewed card requests
- production Telegram funding-request submission with owned-card checks
- immutable provider/service-fee and approved Rial/USD quote snapshots
- private receipt storage with magic-byte/type/size validation and optional ClamAV scanning
- atomic receipt-record + request-state transition with orphan-file cleanup on DB failure
- admin funding accept/reject/correction workflow with immutable timeline and Telegram notifications
- server-side funding-request search and cursor pagination
- Telegram card browsing, stored transactions, guarded freeze/unfreeze, and request-status menus
- durable Telegram support relay and OTP delivery outbox with bounded retries/dead-lettering
- server-side BotFather token/webhook-secret handling; bot secrets are never returned to the browser
- append-only audit logs
- verified host-local backup bundles for PostgreSQL, receipts, and support attachments
- encrypted off-host MEGA upload through an `rclone crypt` remote
- isolated restore drills and guarded production recovery tooling
- database-backed emergency controls with environment hard ceilings and application read-only mode
- database-backed Kripicard money-operation readiness checklist with evidence/source tracking
- append-only provider-readiness history and RBAC-protected update API
- safe deposit discovery/status schemas for coins, networks, and deposit reconciliation
- hard separation between supplied-PDF facts and unresolved production provider questions
- operation-specific provider readiness (`card_create`, `card_fund`, `deposit_create`)
- documented Kripicard HTTP 202 / `REFUND_PENDING` purchase handling
- single-attempt `createcard` with pre-write card snapshot and no automatic purchase retry
- manual/safe `cards/list` reconciliation for uncertain card-creation outcomes
- recent-admin-reauthentication requirement for card issuance
- dedicated `ENABLE_KRIPICARD_CARD_CREATION` kill switch
- guarded real card creation from approved requests only
- guarded one-shot `fundcard` execution from accepted funding requests
- per-card/request funding operation locks and explicit clean-failure retry rules
- read-only evidence collection plus provider-confirmed manual resolution for uncertain funding outcomes
- dedicated `ENABLE_KRIPICARD_CARD_FUNDING` kill switch; deposit creation remains unavailable
- protected scheduled Kripicard transaction-sync job with per-card leases/backoff
- first-sync notification baseline to prevent historical alert storms
- SHA-256 transaction fingerprint deduplication across overlapping provider windows
- one durable Telegram outbox event per newly detected transaction/current user
- assignment recheck immediately before transaction notification delivery
- former-assignee protection: ownership-change skips are never redirected to a new user
- admin transaction-notification reconciliation for failed/skipped delivery mismatches
- production Telegram support conversation list with unread counters and admin assignment/status
- Telegram ↔ admin PDF/image support attachments with private storage, validation and malware-scanning hook
- audited private support-attachment downloads
- durable support-message delivery state plus explicit terminal-failure retry
- append-only conversation event history

## Start locally/staging

```bash
cp .env.example .env
openssl rand -base64 32
```

Set at minimum:

```env
APP_ENV=staging
APP_BASE_URL=http://localhost:3000
DATABASE_PASSWORD=<strong-password>
APP_ENCRYPTION_KEY=<base64-32-byte-key>
ENABLE_LIVE_PROVIDER_WRITES=false
ENABLE_KRIPICARD_CARD_STATE_WRITES=false
ENABLE_KRIPICARD_CARD_CREATION=false
ENABLE_KRIPICARD_CARD_FUNDING=false
```

Then:

```bash
docker compose up -d --build
```

## First administrator

```bash
docker compose run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL='admin@example.com' \
  -e BOOTSTRAP_ADMIN_DISPLAY_NAME='Owner' \
  -e BOOTSTRAP_ADMIN_PASSWORD='use-a-long-unique-password' \
  admin-bootstrap
```

## Test Kripicard reads first

Add a real/test account with encrypted credentials, then use **Sync** before enabling any provider write.

The documented provider base URL is:

```text
https://appapi.kripicard.com
```

### Enable Phase 15/16 card writes only in controlled staging

Keep these off by default. After migrations, a test account is configured, and the operator has recently reauthenticated:

```env
ENABLE_LIVE_PROVIDER_WRITES=true
ENABLE_KRIPICARD_CARD_CREATION=true
ENABLE_KRIPICARD_CARD_FUNDING=true
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
```

Approval does not create a card and accepting a receipt does not fund a card. Operators must explicitly choose **Issue card** or **Fund card** from the corresponding approved/accepted request. AccAbad sends each purchase write once; uncertain results move to reconciliation instead of being retried.

## Phase 17 transaction synchronization

Generate a dedicated scheduler secret:

```bash
openssl rand -hex 32
```

Configure:

```env
KRIPICARD_TRANSACTION_SYNC_JOB_SECRET=<generated-secret>
KRIPICARD_TRANSACTION_SYNC_INTERVAL_SECONDS=120
KRIPICARD_TRANSACTION_SYNC_BATCH_SIZE=50
```

Until the formal Phase 19 worker/queue lands, call the protected hook every minute from cron/systemd/a platform scheduler:

```bash
curl --fail --silent --show-error \
  -X POST \
  -H "Authorization: Bearer $KRIPICARD_TRANSACTION_SYNC_JOB_SECRET" \
  "$APP_BASE_URL/api/internal/jobs/kripicard-transactions"
```

The first scheduled sync establishes a baseline and does not notify historical activity. Later newly inserted provider transactions are fingerprint-deduplicated and queued to Telegram. Delivery rechecks that the originally intended user still owns the account; a former assignee never receives a notification based on stale ownership. Keep the existing Telegram outbox job running to deliver queued alerts.

The Transactions screen surfaces terminal delivery mismatches. Failed deliveries can be retried only while the original intended user still owns the account; ownership-change skips can only be acknowledged.

## Phase 18 support attachments

Configure the private support attachment path/limit:

```env
SUPPORT_ATTACHMENTS_STORAGE_DIR=/var/lib/accabad/support-attachments
SUPPORT_ATTACHMENT_MAX_BYTES=10485760
```

Docker bind-mounts these files from `${ACCABAD_DATA_DIR}/support-attachments` on the host. Phase 21 backup bundles include this directory and the receipt directory alongside PostgreSQL. Support attachments use the same optional ClamAV scanner configuration as receipt evidence.

The Telegram inbox supports PDF/JPEG/PNG/WebP files, unread counters, Assign to me, Pending, Close/Reopen, delivery state, and explicit Retry for terminal Telegram failures. Telegram does not expose a reliable human-read receipt here; AccAbad records a later client bot interaction as an acknowledgement instead of falsely calling it a read receipt.

## Phase 21 backup and emergency controls

Use absolute production paths and an encrypted MEGA remote:

```env
ACCABAD_DATA_DIR=/var/lib/accabad
BACKUP_LOCAL_DIR=/var/backups/accabad
BACKUP_RCLONE_DESTINATION=accabad-mega-crypt:production
```

Run `npm run db:backup`, then test any bundle with `npm run db:restore-test -- /absolute/path/to/bundle.tar.gz`. The Operations screen provides audited runtime controls; environment flags remain non-overridable hard ceilings. See `RECOVERY-RUNBOOK.md` before enabling the timer or restoring production.

## Review provider readiness

Open **Settings → Kripicard money readiness** or call:

```text
GET /api/v1/provider-readiness
```

The readiness model is operation-specific. The expanded supplied docs clear the rate-limit and purchase-202 rules used by both card creation and card funding, plus the documented BIN requirements for creation and the documented fund-card fee/minimum contract. `card_create` and `card_fund` can therefore be enabled independently of deposit creation. Wallet-balance availability, webhook cryptographic details, deposit under/over/late-payment behavior, and some account-capability questions remain explicit provider questions.

Use `PROVIDER-READINESS-QUESTIONS.md` with Kripicard support/partnerships. A blocking check can be cleared only with provider-written evidence or a controlled live/sandbox test; public marketing material is insufficient.

## Configure Outlook / Hotmail

Create a Microsoft app registration that supports personal Microsoft accounts. Add this exact Web redirect URI:

```text
${APP_BASE_URL}/api/v1/email/outlook/callback
```

Then configure:

```env
MICROSOFT_OAUTH_CLIENT_ID=<application-client-id>
MICROSOFT_OAUTH_CLIENT_SECRET=<application-client-secret>
MICROSOFT_OAUTH_TENANT=consumers
OUTLOOK_SYNC_JOB_SECRET=<generate-with-openssl-rand-hex-32>
```

AccAbad requests delegated `User.Read`, `Mail.Read`, and `offline_access`. Refresh tokens and Graph delta cursors are encrypted at rest.

Optional background mailbox sync can be triggered by your scheduler:

```bash
curl -X POST \
  -H "Authorization: Bearer $OUTLOOK_SYNC_JOB_SECRET" \
  https://admin.example.com/api/internal/jobs/outlook-sync
```


## Configure Gmail

Create a Google Cloud project, enable the Gmail API, configure the OAuth consent screen, and create a **Web application** OAuth client. Register this exact redirect URI:

```text
${APP_BASE_URL}/api/v1/email/gmail/callback
```

Then configure:

```env
GOOGLE_OAUTH_CLIENT_ID=<web-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<web-client-secret>
GOOGLE_GMAIL_TIMEOUT_MS=10000
GMAIL_SYNC_JOB_SECRET=<generate-with-openssl-rand-hex-32>
```

AccAbad requests only `https://www.googleapis.com/auth/gmail.readonly`. This is a restricted Gmail scope; production/public OAuth may require Google verification. Refresh tokens and Gmail history cursors are encrypted at rest.

Optional background Gmail synchronization:

```bash
curl -X POST \
  -H "Authorization: Bearer $GMAIL_SYNC_JOB_SECRET" \
  https://admin.example.com/api/internal/jobs/gmail-sync
```

## Configure Telegram

Create a bot with BotFather and generate two independent random secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Configure:

```env
TELEGRAM_BOT_TOKEN=<botfather-token>
TELEGRAM_WEBHOOK_SECRET=<first-random-secret>
TELEGRAM_OUTBOX_JOB_SECRET=<second-random-secret>
TELEGRAM_REQUEST_TIMEOUT_MS=10000
TELEGRAM_CALLBACK_TTL_MINUTES=30
TELEGRAM_SUPPORT_MODE_MINUTES=120
```

Deploy AccAbad at a public HTTPS `APP_BASE_URL`, then open **Settings → Telegram bot** and click **Configure webhook**. AccAbad registers:

```text
${APP_BASE_URL}/api/telegram/webhook
```

Run the durable outbox worker from cron/systemd/platform scheduling (for example every minute):

```bash
curl --fail --silent --show-error \
  -X POST \
  -H "Authorization: Bearer $TELEGRAM_OUTBOX_JOB_SECRET" \
  "$APP_BASE_URL/api/internal/jobs/telegram-outbox"
```

The bot currently supports registration/gates, assigned-card browsing, stored transaction history, guarded freeze/unfreeze, production card-request submission/status/cancellation, production funding-request submission with receipt upload/status/cancellation, text support relay, and secure Phase 9 OTP delivery. Accepted funding requests can now be executed through the guarded Phase 16 `fundcard` workflow when its deployment gate is enabled. Uncertain provider outcomes never auto-retry and remain blocked for reconciliation/provider confirmation. Deposit creation is still unavailable.

## Configure private funding receipts

Receipt evidence is stored outside the web root in the named Docker volume mounted at:

```text
/var/lib/accabad/receipts
```

The default 10 MB limit accepts PDF, JPEG, PNG, and WebP files after magic-byte validation. Optional ClamAV (`clamd`) scanning is supported over TCP:

```env
RECEIPTS_STORAGE_DIR=/var/lib/accabad/receipts
RECEIPT_MAX_BYTES=10485760
RECEIPT_CLAMAV_HOST=<clamd-host>
RECEIPT_CLAMAV_PORT=3310
RECEIPT_CLAMAV_TIMEOUT_MS=5000
RECEIPT_REQUIRE_ANTIVIRUS=true
```

For real payment evidence, use `RECEIPT_REQUIRE_ANTIVIRUS=true` with a reachable scanner so uploads fail closed if malware scanning cannot complete. The PostgreSQL backup script does **not** back up the receipt volume; include that volume in your off-host backup policy until Phase 21 formalizes backup/recovery.

## Enable Phase 6 freeze/unfreeze in staging

Only after Phase 5 reads pass:

```env
ENABLE_LIVE_PROVIDER_WRITES=true
ENABLE_KRIPICARD_CARD_STATE_WRITES=true
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
```

Restart the app after changing deployment configuration.

These flags enable only the currently implemented freeze/unfreeze write path. Card creation/funding/deposit writes do not exist yet.

## Verification

```bash
npm ci --no-audit --no-fund
npm run verify
npm run test:db-integration
```

## Phase notes

- `PHASE-1-IMPLEMENTATION.md`
- `PHASE-2-IMPLEMENTATION.md`
- `PHASE-3-IMPLEMENTATION.md`
- `PHASE-4-IMPLEMENTATION.md` through `PHASE-14-IMPLEMENTATION.md`
- `KRIPICARD-PROVIDER-CONTRACT.md`
- `PROVIDER-READINESS-QUESTIONS.md`
- `PHASE-4-IMPLEMENTATION.md`
- `PHASE-5-IMPLEMENTATION.md`
- `PHASE-6-IMPLEMENTATION.md`
- `PHASE-7-IMPLEMENTATION.md`
- `PHASE-8-IMPLEMENTATION.md`
- `PHASE-9-IMPLEMENTATION.md`
- `PHASE-10-IMPLEMENTATION.md`
- `PHASE-11-IMPLEMENTATION.md`
- `PHASE-12-IMPLEMENTATION.md`
- `PHASE-13-IMPLEMENTATION.md`
- `KRIPICARD-PROVIDER-CONTRACT.md`
- `AccAbad-Demo-to-Production-Phases.md`

## Next phase

**Phase 14 — Live wallet/deposit operational validation**, documenting the remaining provider rate-limit, idempotency/reconciliation, fee, webhook, and account-capability details before any new money-changing provider call is enabled.
#   A c c A b a d - C a r d s  
 