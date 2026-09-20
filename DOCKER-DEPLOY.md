# AccAbad Admin — Phase 24 Docker Deployment

## 1. Create environment

```bash
cp .env.example .env
openssl rand -base64 32
```

Place the generated value in `APP_ENCRYPTION_KEY` and configure a strong `DATABASE_PASSWORD`.

For an Internet-facing production deployment use an HTTPS reverse proxy and:

```env
APP_ENV=production
APP_BASE_URL=https://admin.example.com
ACCABAD_BIND_IP=127.0.0.1
POSTGRES_BIND_IP=127.0.0.1
ENABLE_LIVE_PROVIDER_WRITES=false
ENABLE_KRIPICARD_CARD_STATE_WRITES=false
PRODUCTION_ROLLOUT_BLOCKED=true
FORCE_READ_ONLY_MODE=true
```

## 2. Build and start

```bash
docker compose up -d --build
```

The dependency order is:

```text
postgres healthy
    ↓
db-migrate succeeds
    ↓
accabad-admin starts
```

## 3. Bootstrap first Super Admin

```bash
docker compose run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL='admin@example.com' \
  -e BOOTSTRAP_ADMIN_DISPLAY_NAME='Owner' \
  -e BOOTSTRAP_ADMIN_PASSWORD='use-a-long-unique-password' \
  admin-bootstrap
```

The bootstrap service exists under the `tools` Compose profile and is intended for one-time use only.

## 4. Open panel

Direct local port:

```text
http://127.0.0.1:3000/login
```

For production, expose only the reverse proxy over HTTPS.

## 5. Nginx example

```nginx
server {
    listen 443 ssl http2;
    server_name admin.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Redirect HTTP to HTTPS separately.

## 6. Health

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

`/ready` checks that PostgreSQL can actually execute a query.

## 7. Logs

```bash
docker compose logs -f accabad-admin
docker compose logs -f postgres
docker compose logs db-migrate
```

## 8. Backups

```bash
npm run db:backup
npm run db:restore-test -- /var/backups/accabad/<file>.tar.gz
```

Phase 21 creates one verified bundle containing PostgreSQL, Phase 13 receipts, and Phase 18 support attachments. Set `ACCABAD_DATA_DIR` and `BACKUP_LOCAL_DIR` to absolute host paths. Configure `BACKUP_RCLONE_DESTINATION` with an `rclone crypt` remote layered over MEGA for the encrypted off-host copy. Follow `RECOVERY-RUNBOOK.md` for scheduling and restoration.

## 9. Security reminders

- Never commit `.env`.
- Back up `APP_ENCRYPTION_KEY` separately and securely.
- Losing the encryption key makes encrypted credentials unrecoverable.
- Do not expose PostgreSQL publicly.
- Use HTTPS in production; production session cookies are marked `Secure`.
- Keep `ENABLE_LIVE_PROVIDER_WRITES=false` and `ENABLE_KRIPICARD_CARD_STATE_WRITES=false` until Phase 5 reads pass against a test/low-risk account.
- To test freeze/unfreeze, enable both flags plus `LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED`.
- Phase 24 adds an independent production release lock. While `PRODUCTION_ROLLOUT_BLOCKED=true`, application mutations and configured integrations remain forced off even if a database runtime switch is enabled.
- Card creation and funding remain protected by dedicated environment ceilings, runtime controls, provider-readiness checks, approved workflows, MFA, and recent reauthentication. Deposit creation remains unavailable.
- Do not place Kripicard passwords/API keys in logs or support tickets.


## Outlook / Hotmail OAuth (Phase 7)

When enabling Outlook integration, register the deployment callback as a Microsoft Entra **Web** redirect URI:

```text
https://YOUR-DOMAIN/api/v1/email/outlook/callback
```

Add to `.env`:

```env
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_TENANT=consumers
MICROSOFT_GRAPH_TIMEOUT_MS=10000
OUTLOOK_SYNC_JOB_SECRET=
```

Restart `accabad-admin` after changing OAuth configuration. Never commit the client secret.


## Outlook background sync hook

Generate a dedicated scheduler secret:

```bash
openssl rand -hex 32
```

Put it in `.env` as `OUTLOOK_SYNC_JOB_SECRET`, restart the application, then configure your host/platform scheduler to call for example every few minutes:

```bash
curl --fail --silent --show-error \
  -X POST \
  -H "Authorization: Bearer $OUTLOOK_SYNC_JOB_SECRET" \
  https://YOUR-DOMAIN/api/internal/jobs/outlook-sync
```

Do not expose the scheduler secret to the browser or store it in source control. The endpoint synchronizes only already-connected Outlook/Hotmail mailboxes and writes job/audit records.

## Gmail OAuth (Phase 8)

Enable the Gmail API in Google Cloud, configure the OAuth consent screen, create a Web OAuth client, and register:

```text
https://YOUR-DOMAIN/api/v1/email/gmail/callback
```

Add to `.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_GMAIL_TIMEOUT_MS=10000
GMAIL_SYNC_JOB_SECRET=
```

The connector requests the restricted `gmail.readonly` scope. Public production use may require Google OAuth verification. Never commit the client secret.

### Gmail background sync hook

Generate a dedicated scheduler secret:

```bash
openssl rand -hex 32
```

Set it as `GMAIL_SYNC_JOB_SECRET`, restart AccAbad, then schedule:

```bash
curl --fail --silent --show-error \
  -X POST \
  -H "Authorization: Bearer $GMAIL_SYNC_JOB_SECRET" \
  https://YOUR-DOMAIN/api/internal/jobs/gmail-sync
```

The endpoint synchronizes only connected Gmail mailboxes and records redacted job/audit status.


## Phase 9 email classification worker
Generate `EMAIL_CLASSIFY_JOB_SECRET` with `openssl rand -hex 32` and schedule `POST /api/internal/jobs/email-classify` with `Authorization: Bearer <secret>`. The worker classifies pending messages and redacts expired OTP values.


## Phase 10 Telegram bot

Create the bot with BotFather, then generate independent webhook/outbox secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Add to `.env`:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_OUTBOX_JOB_SECRET=
TELEGRAM_REQUEST_TIMEOUT_MS=10000
TELEGRAM_CALLBACK_TTL_MINUTES=30
TELEGRAM_SUPPORT_MODE_MINUTES=120
```

`APP_BASE_URL` must be a public HTTPS origin before registering the webhook. After restart, sign in as a Super Admin, reauthenticate if requested, open **Settings → Telegram bot**, and click **Configure webhook**. The registered webhook path is:

```text
https://YOUR-DOMAIN/api/telegram/webhook
```

The BotFather token and webhook secret remain server-side and are never returned to the browser.

### Telegram outbox worker

Schedule at roughly one-minute cadence:

```bash
curl --fail --silent --show-error \
  -X POST \
  -H "Authorization: Bearer $TELEGRAM_OUTBOX_JOB_SECRET" \
  https://YOUR-DOMAIN/api/internal/jobs/telegram-outbox
```

This worker currently delivers OTP, support-message, card-request-status, and funding-request-status events. It rechecks current account assignment immediately before OTP send, decrypts the OTP only at delivery time, redacts it after a successful send, uses bounded retries, and dead-letters terminal failures.

For the Settings UI, use public `@channel_username` entries for force-join. The backend API also supports private/numeric chat IDs when an invite URL is supplied explicitly. Membership API/configuration errors fail open and are audited; explicit `left`/`kicked` membership still blocks access.

## Phase 13 private receipt evidence

The app mounts the named Docker volume `accabad_receipts` at:

```text
/var/lib/accabad/receipts
```

Configure the storage and validation limits in `.env`:

```env
RECEIPTS_STORAGE_DIR=/var/lib/accabad/receipts
RECEIPT_MAX_BYTES=10485760
```

For real payment evidence, connect AccAbad to a `clamd` service and fail closed if scanning is unavailable:

```env
RECEIPT_CLAMAV_HOST=<clamd-host>
RECEIPT_CLAMAV_PORT=3310
RECEIPT_CLAMAV_TIMEOUT_MS=5000
RECEIPT_REQUIRE_ANTIVIRUS=true
```

Without a ClamAV host, AccAbad performs only strict size and magic-byte validation; do not describe that staging/development mode as antivirus scanning.



## Phase 14 provider readiness gate

After migration `0013_provider_operational_readiness.sql`, sign in and open **Settings → Kripicard money readiness**. The fresh deployment is expected to show unresolved blockers. This is a safe state.

You can also inspect the same state through:

```text
GET /api/v1/provider-readiness
```

Only Super Admins receive `provider.readiness.manage`. When Kripicard provides a written answer or you complete a controlled sandbox/live validation, record the evidence through the protected PATCH endpoint. Do not clear a blocker based only on public marketing material. See `PROVIDER-READINESS-QUESTIONS.md`.

Phase 14 itself introduced no money-changing provider method. Later phases add guarded `createCard` and `fundCard`; `createDeposit` remains unavailable.


## Phase 15 card issuance gate

Real Kripicard card creation is disabled by default. For controlled staging issuance only:

```env
ENABLE_LIVE_PROVIDER_WRITES=true
ENABLE_KRIPICARD_CARD_CREATION=true
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
```

`ENABLE_KRIPICARD_CARD_CREATION=true` is rejected unless the global provider-write switch is also enabled. The Issue Card API additionally requires `card_requests.issue`, CSRF protection, and recent admin reauthentication.

## Phase 16 card funding gate

Real Kripicard card funding is disabled by default. For controlled staging funding only:

```env
ENABLE_LIVE_PROVIDER_WRITES=true
ENABLE_KRIPICARD_CARD_FUNDING=true
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
```

The Fund Card API additionally requires `funding.execute`, CSRF protection, recent admin reauthentication, an accepted funding request with a clean receipt, and operation-specific provider readiness. AccAbad sends `fundcard` once. HTTP 202/pending, `REFUND_PENDING`, network timeouts, 5xx responses, malformed success responses, and other uncertain outcomes are never auto-retried. Use the Request Center reconciliation actions and require a Kripicard support/ticket/reference before manually declaring an uncertain operation funded or not funded. Deposit creation remains unimplemented in Phase 16.


## Phase 17 — scheduled card transactions

Configure a dedicated secret and tuning values:

```env
KRIPICARD_TRANSACTION_SYNC_JOB_SECRET=<openssl-rand-hex-32>
KRIPICARD_TRANSACTION_SYNC_INTERVAL_SECONDS=120
KRIPICARD_TRANSACTION_SYNC_BATCH_SIZE=50
```

Until Phase 19 provides the formal background-job runner, invoke the endpoint every minute from the host scheduler:

```bash
curl --fail --silent --show-error \
  -X POST \
  -H "Authorization: Bearer $KRIPICARD_TRANSACTION_SYNC_JOB_SECRET" \
  "$APP_BASE_URL/api/internal/jobs/kripicard-transactions"
```

This endpoint performs read-only Kripicard transaction polling. Per-card `next_attempt_at`, leases, provider `Retry-After`, and exponential backoff keep overlapping scheduler calls safe. The separate Telegram outbox hook must also run for queued transaction alerts to be delivered.

## Phase 18 private support attachments

The app bind-mounts the host directory `${ACCABAD_DATA_DIR}/support-attachments` at:

```text
/var/lib/accabad/support-attachments
```

Configure:

```env
SUPPORT_ATTACHMENTS_STORAGE_DIR=/var/lib/accabad/support-attachments
SUPPORT_ATTACHMENT_MAX_BYTES=10485760
```

Allowed v1 support files are PDF, JPEG, PNG, and WebP. The app validates size and magic bytes and reuses the configured ClamAV scanner. These objects are private and can be downloaded only through the authenticated `messaging.read` endpoint. Phase 21 includes them in the combined local and encrypted off-host backup bundle.
