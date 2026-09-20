# Phase 18 — Production Messaging and Support

Phase 18 replaces the remaining prototype-only support chat behavior with a durable Telegram ↔ AccAbad conversation system.

## Scope implemented

- persistent conversation list
- admin unread counters
- Telegram-user acknowledgement counters
- Telegram → admin text messages
- Telegram → admin PDF/image attachments
- admin → Telegram text messages
- admin → Telegram PDF/image attachments
- private attachment storage
- size and magic-byte validation
- optional ClamAV scanning through the existing scanner configuration
- durable Telegram outbox delivery
- per-message delivery status/error metadata
- explicit retry for terminal failed deliveries
- conversation status: `open`, `pending`, `closed`
- conversation assignment to an active admin
- append-only conversation events
- RBAC + CSRF for messaging mutations
- audited attachment downloads and admin actions

## Database migration

`db/migrations/0017_support_messaging.sql`

The migration adds conversation state/assignment/unread counters, delivery-error metadata, `support_attachments`, `conversation_events`, and `messaging.manage` / `messaging.retry` permissions.

`conversation_events` is append-only at the PostgreSQL level.

## Unread semantics

Telegram Bot API does not provide a reliable user read receipt for ordinary bot messages. AccAbad therefore does not claim that a user has *read* an admin reply.

- `unread_admin_count` increments when a new support message is accepted from Telegram.
- Opening the conversation through the admin API clears `unread_admin_count` and records `last_admin_read_at`.
- `unread_client_count` increments when Telegram accepts an outbound admin support message.
- The next interaction from that Telegram user clears `unread_client_count` and records `last_client_ack_at`.

`last_client_ack_at` means the user interacted with the bot after those messages were sent; it is not a Telegram read receipt.

## Inbound Telegram attachments

While the user is in support mode, AccAbad accepts:

- PDF
- JPEG
- PNG
- WebP

The bot first checks Telegram message deduplication, downloads the file server-side, enforces `SUPPORT_ATTACHMENT_MAX_BYTES`, validates file magic bytes, runs the configured malware scanner, stores the object under a randomized private path, and only then commits the message + attachment metadata.

If the database commit fails, the newly stored object is deleted best-effort.

## Outbound admin attachments

The admin support API accepts `multipart/form-data` with:

- `text` — optional when a file is attached
- `attachment` — optional PDF/JPEG/PNG/WebP

Messages with attachments are limited to 900 text characters so Telegram can deliver the file and caption as one provider operation. This avoids a partial-success state where a file succeeds but a separate text send fails.

The Telegram worker uses `sendDocument` with `protect_content=true`.

## Delivery and retry behavior

Admin replies are inserted into PostgreSQL before an outbox event is created.

States:

- `pending` — persisted and awaiting Telegram worker delivery
- `sent` — Telegram Bot API accepted the message
- `failed` — the bounded outbox retry budget was exhausted

`sent` does **not** mean that Telegram reported the human as having read the message.

Each transient worker failure records `last_delivery_error` and `delivery_attempted_at`. A terminal failure additionally records `failed_at` and an append-only conversation event.

An operator may explicitly retry a terminal failed message. The retry creates a fresh durable outbox event and cannot be concurrently queued twice because the message row is locked and must still be `failed`.

## Deduplication

Inbound messages use the existing unique Telegram identity:

`(conversation_id, telegram_message_id)` for `client_to_admin` messages.

Outbound messages use a unique outbox idempotency key. Retrying a terminal failure creates a new explicit retry event rather than silently replaying the old worker attempt.

## Conversation management

New API:

- `GET /api/v1/conversations`
- `PATCH /api/v1/conversations/:id`
- `GET /api/v1/clients/:id/messages`
- `POST /api/v1/clients/:id/messages`
- `POST /api/v1/messages/:id/retry`
- `GET /api/v1/messages/:id/attachment`

Conversation mutations require `messaging.manage`; failed-message retries require `messaging.retry`; reads/downloads require `messaging.read`; sending requires `messaging.send`.

Incoming client messages reopen a closed conversation. Sending an admin reply also reopens the conversation and assigns it to the sending admin if it had no assignee.

## Attachment storage

Configure:

```env
SUPPORT_ATTACHMENTS_STORAGE_DIR=/var/lib/accabad/support-attachments
SUPPORT_ATTACHMENT_MAX_BYTES=10485760
```

Docker mounts a separate named volume:

`accabad_support_attachments`

This volume is not included in PostgreSQL dumps and must be included in the deployment backup plan.

The same optional ClamAV configuration used for receipt evidence is reused for support files. When antivirus is required by deployment policy, keep `RECEIPT_REQUIRE_ANTIVIRUS=true`; the scanner helper is shared by both receipt and support-file storage.

## Admin UI

The Telegram inbox now shows:

- unread badges
- current conversation status
- assigned admin name
- Assign to me
- Pending
- Close / Reopen
- attachment upload/download
- outbound delivery status
- terminal delivery error
- Retry action for failed messages

## Intentionally not added

Phase 18 does not add a queue product or dedicated worker process. It keeps using the existing durable PostgreSQL outbox hook. Phase 19 will formalize background jobs/worker scheduling.

It also does not claim Telegram human read receipts, because the Bot API does not provide that signal for this workflow.

## Rollback notes

Application rollback to Phase 17 is possible while leaving migration 0017 applied; the added columns/tables are additive. Do not drop `support_attachments` until the corresponding private objects have been retained or deleted according to policy.

## Validation performed in this workspace

- Phase 18 static tests: 11/11 passed
- dependency-independent project tests: 149 passed; `env-validation` and `ui-components` require unavailable installed npm dependencies in this clean workspace
- TypeScript/TSX syntax parse: 191 files, 0 syntax errors
- package-lock offline consistency check passed
- JSON/YAML/shell validation is part of final packaging checks

No Docker daemon or PostgreSQL server is available in this execution environment, so live migration, attachment-volume, Telegram API, and concurrent DB integration tests remain staging/CI acceptance steps.
