# Phase 17 — Transaction Synchronization and Notifications

Phase 17 adds scheduled Kripicard transaction synchronization and deduplicated Telegram transaction notifications.

## Provider contract used

The supplied Kripicard card API exposes `/api/external/cards/transactions`, which returns the card's live balance plus a transaction array. The supplied Overview also documents API-key-scoped read-rate budgets and `Retry-After` information for HTTP 429 responses. Phase 17 performs read operations only; no provider write is introduced.

## Synchronization model

A new `transaction_sync_state` row exists per card. The worker claims due cards with `FOR UPDATE ... SKIP LOCKED`, sets a short lease, and synchronizes cards independently so one failing account/card does not stop the batch.

Successful cards become due again after `KRIPICARD_TRANSACTION_SYNC_INTERVAL_SECONDS` (120 seconds by default). Failed cards use exponential backoff, and provider `Retry-After` is honored when it is longer than the local backoff.

The protected job endpoint is:

```text
POST /api/internal/jobs/kripicard-transactions
Authorization: Bearer <KRIPICARD_TRANSACTION_SYNC_JOB_SECRET>
```

It processes at most `KRIPICARD_TRANSACTION_SYNC_BATCH_SIZE` due cards per invocation. Phase 19 will move recurring jobs into the formal worker/queue layer; until then, invoke this endpoint from cron/systemd/a platform scheduler.

## Historical-notification suppression

The first scheduled synchronization of a card establishes its notification baseline. Existing provider transaction history is persisted but not sent to Telegram. If transactions were already manually synchronized before the migration, that existing history is treated as the baseline immediately.

A manual admin transaction sync also establishes the baseline and never emits historical Telegram notifications.

## Deduplication

Kripicard does not provide a provider transaction ID in the supplied transaction example, so AccAbad continues to use its SHA-256 fingerprint over the provider card ID plus safe transaction fields. PostgreSQL has a unique `(card_id, fingerprint)` index.

Only a genuinely newly inserted transaction can create a `card_transaction.detected` Telegram outbox event. The outbox event has its own unique idempotency key containing the transaction and intended user IDs, so overlapping poll windows cannot queue duplicate notifications.

## Ownership safety

The assigned Telegram user is captured when a new transaction is detected, but that cached assignment is **not authorization**. Immediately before Telegram delivery AccAbad rechecks that the same intended user still owns the card's Kripicard account and is not banned.

If ownership changed, the notification is marked `skipped` and is never automatically redirected to the new owner. This prevents an old transaction from leaking to a later assignee.

## Telegram message contents

Notifications contain only redacted/safe transaction context:

- last four digits
- amount and currency
- provider status/type
- redacted merchant label
- occurrence time

No PAN, CVV, API key, account credential, OTP, or provider secret is included. Telegram `protect_content` is enabled for the notification.

## Admin reconciliation

The Transactions screen now reads real PostgreSQL transactions and surfaces terminal notification mismatches.

- A terminal Telegram delivery failure may be explicitly retried only when the original intended user still owns the account.
- An ownership-change skip can only be acknowledged; it cannot be resent to the new assignee.
- Reconciliation actions require the `transactions.reconcile` permission, CSRF protection, and audit logging.

Backend endpoints:

```text
GET  /api/v1/transactions
GET  /api/v1/transactions/issues
POST /api/v1/transactions/:id/notification/reconcile
```

## Environment

```env
KRIPICARD_TRANSACTION_SYNC_JOB_SECRET=<openssl-rand-hex-32>
KRIPICARD_TRANSACTION_SYNC_INTERVAL_SECONDS=120
KRIPICARD_TRANSACTION_SYNC_BATCH_SIZE=50
```

Recommended temporary scheduler cadence before Phase 19: call the job endpoint every minute. The per-card `next_attempt_at` value prevents cards from being read more frequently than their configured interval.

The existing Telegram outbox job must also continue running so queued transaction notifications are delivered.

## Migration

```text
db/migrations/0016_transaction_sync_notifications.sql
```

The migration creates per-card sync state, adds transaction-notification state/reconciliation fields, seeds the notification feature on, and grants `transactions.reconcile` to super admins and operators.

## Rollback notes

Application rollback is safe while retaining migration 0016. Do not drop notification/sync state during an incident because it contains deduplication and reconciliation history. If the scheduled sync must be stopped, remove/disable the external scheduler or unset `KRIPICARD_TRANSACTION_SYNC_JOB_SECRET`.

## Phase 17 exit criteria

- Repeated/overlapping synchronization cannot insert the same provider transaction twice.
- Only post-baseline newly detected transactions queue Telegram alerts.
- Repeated worker runs cannot queue duplicate alerts for one transaction/user pair.
- Current assignment is rechecked at actual delivery time.
- A former assignee does not receive later notifications after unassignment.
- Delivery mismatches are visible and reconcilable without bypassing ownership rules.
