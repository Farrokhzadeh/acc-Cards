# AccAbad Admin — Phase 10 Telegram Bot

Status: implemented in source; live Telegram verification still requires a real BotFather token and public HTTPS deployment.

## What Phase 10 adds

- Verified Telegram webhook at `POST /api/telegram/webhook` using `X-Telegram-Bot-Api-Secret-Token`.
- Durable update deduplication through `webhook_events(source='telegram', external_id=update_id)`, including stale-processing recovery after an interrupted webhook worker.
- Telegram identity upsert and last-seen tracking.
- Ban gate, required-channel membership gate, and current account-assignment gate.
- Fail-open force-join behavior for Telegram API/channel misconfiguration so one broken channel cannot lock out all users.
- Opaque, hashed, user-bound, expiring callback tokens.
- `/start`, `/menu`, `/cancel`.
- Main bot menu for cards, requests, add funds, request card, and support.
- Current-assignment card listing and safe card details (last4/status/stored balance only; no PAN/CVV).
- Stored transaction history.
- User freeze/unfreeze using the same Phase 6 guarded provider-write rules, with ownership rechecked at callback time and no blind write retry.
- Request status listing. New card/funding request submission remains intentionally disabled until Phases 12/13.
- Text support relay into the existing admin conversation tables.
- Admin replies persisted first, then delivered by Telegram outbox.
- Phase 9 OTP events delivered through the Telegram outbox after rechecking the account assignment at delivery time.
- OTP plaintext is decrypted only in the worker immediately before send and is redacted after successful send.
- Bounded outbox retry/backoff and dead-letter behavior.
- Admin endpoints to inspect/configure the webhook and persist force-join channels.

## Migration

`db/migrations/0009_telegram_bot.sql`

Adds:

- `force_join_channels`
- `telegram_callback_tokens`
- `telegram_bot_states`
- Telegram user last-seen/name metadata
- inbound Telegram message deduplication
- OTP Telegram message reference
- Telegram actor metadata on card operations
- Telegram/messaging permissions

## Environment

```env
APP_VERSION=phase10
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_OUTBOX_JOB_SECRET=
TELEGRAM_REQUEST_TIMEOUT_MS=10000
TELEGRAM_CALLBACK_TTL_MINUTES=30
TELEGRAM_SUPPORT_MODE_MINUTES=120
```

Generate secrets separately:

```bash
openssl rand -hex 32   # TELEGRAM_WEBHOOK_SECRET
openssl rand -hex 32   # TELEGRAM_OUTBOX_JOB_SECRET
```

The BotFather token belongs only in the deployment secret environment and is never returned by the AccAbad browser API.

## Configure webhook

After the app is deployed at a public HTTPS `APP_BASE_URL` and the first admin has recently reauthenticated:

1. Open Settings → Telegram bot.
2. Confirm the bot shows as configured.
3. Click **Configure webhook**.

AccAbad registers:

```text
${APP_BASE_URL}/api/telegram/webhook
```

with the configured Telegram webhook secret and only requests `message` and `callback_query` updates.

## Telegram outbox worker

Call periodically (for example every minute):

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $TELEGRAM_OUTBOX_JOB_SECRET" \
  "$APP_BASE_URL/api/internal/jobs/telegram-outbox"
```

The worker handles:

- `otp.ready_for_delivery`
- `support.admin_message`

It claims events with `FOR UPDATE SKIP LOCKED`, reclaims processing leases older than ten minutes after a worker crash, retries transient failures with backoff, and dead-letters after five attempts.

## OTP safety

Before sending an OTP, the worker rechecks that the Telegram user is still assigned to the email's Kripicard account. If a card was resolved, it also confirms that card still belongs to that account. Assignment changes therefore prevent stale OTP delivery.

After a successful send:

- `delivered_at` is recorded,
- Telegram message ID is stored,
- encrypted OTP ciphertext is cleared,
- `redacted_at` is set.

No OTP is stored in the outbox payload or application logs.

## Current intentionally incomplete bot actions

The buttons **Request card** and **Add funds** are present but do not create production requests yet. They return a clear message and do not mutate state. The actual request workflows require the Phase 12 and Phase 13 validation/state machines, receipt handling, quote snapshots, and card-limit concurrency protection.

Support attachments are also not accepted yet because durable private object storage/scanning belongs to the receipt/file-storage work.

## Live test checklist

With a test bot and test Telegram user:

1. Run database migrations.
2. Set Telegram environment secrets.
3. Deploy with public HTTPS.
4. Configure webhook from Settings.
5. Send `/start` to the bot.
6. Confirm the Telegram user appears under Clients.
7. With no assigned account, confirm only the contact-admin gate is shown.
8. Assign a test Kripicard account through the admin workflow when Phase 11 is available (or seed an assignment in staging only).
9. Send `/start` again and confirm only currently assigned cards are visible.
10. Test transaction view.
11. With Phase 6 live-state flags enabled on a sandbox account, test freeze/unfreeze and confirm the provider state.
12. Enter Support, send a text message, confirm it appears in Admin → Telegram inbox, reply, then run the Telegram outbox worker.
13. Generate a trusted test OTP email and confirm only the assigned user receives the OTP and the ciphertext is redacted afterward.
14. Replay the same Telegram `update_id` and confirm no duplicate action is created.

## Security notes

- Telegram callback payloads never contain internal card/account IDs directly.
- Every sensitive callback resolves an opaque database token and then rechecks current ownership.
- User freeze/unfreeze uses a single provider write and reconciliation; automatic write retries are forbidden.
- Required-channel API failures are audited and fail open rather than globally locking users out.
- Banned users and users without account assignments cannot access card data.
- The browser never receives the Telegram bot token or webhook secret.
