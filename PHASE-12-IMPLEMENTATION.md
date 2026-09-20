# Phase 12 — Card Request Workflow

Status: **implemented in source**.

## Goal

Allow an assigned Telegram client to submit a real card request while keeping provider issuance completely disabled. The request is reviewed by an authorized AccAbad admin, who must choose one of the client's currently assigned Kripicard accounts before approval.

Phase 12 does **not** call Kripicard `createcard`, does not create a provider card, and does not move money.

## Provider fields used

The supplied Kripicard card API documents these create-card fields, which are collected now so a later issuance phase can use a reviewed request without changing its meaning:

- BIN;
- initial USD amount;
- name on card;
- email;
- date of birth only for BINs that require it.

The documented card API shows BIN examples `539502`, `525847`, `537872`, `533171`, and `246001`. It states that DOB is required for `537872`, `533171`, and `246001`, using `YYYY-MM-DD`.

These values are seeded under the `card_request_bins` setting as a verified Phase 12 configuration. They are not presented as a dynamic or exhaustive Kripicard BIN catalogue.

The provider minimum in the supplied card API is USD 10. AccAbad keeps its stricter configurable default of USD 20 through `minimum_card_creation_usd_cents`; the service will never accept less than USD 10 even if configuration is accidentally lowered.

## Database changes

Migration:

```text
 db/migrations/0011_card_request_workflow.sql
```

Adds:

- `card_request_reference_seq` for readable request references;
- `card_request_events` for status/timeline history;
- append-only trigger protection for request events;
- indexes for request queues and selected accounts;
- expanded Telegram bot state modes for the request wizard;
- `card_requests.read` and `card_requests.review` permissions;
- verified Phase 12 BIN/DOB configuration.

The existing `card_requests` table remains the authoritative request record.

## Telegram request flow

The **Request card** button now starts a real server-side wizard:

```text
Choose BIN
   ↓
Enter initial USD amount
   ↓
Enter name on card
   ↓
Enter email
   ↓
Enter DOB only when required
   ↓
Review confirmation
   ↓
Submit pending request
```

Draft state is stored server-side in `telegram_bot_states`; the browser is not involved.

Users can send `/cancel` during the wizard. Pending/correction-needed card requests can also be cancelled from **My requests**.

The bot makes it explicit that submission does not create a Kripicard card and does not move funds.

## Transactional platform card limit

The configured platform limit is enforced in `server/card-requests/service.ts`.

For one Telegram user, AccAbad counts:

```text
current non-closed/non-expired cards
+
open card requests
```

across every currently assigned Kripicard account.

Request creation:

1. locks the Telegram user;
2. takes a transaction-scoped advisory capacity lock for that user;
3. confirms at least one current account assignment;
4. reads the current card and open-request counts;
5. rejects submission if the configured limit is exhausted;
6. inserts the request and initial timeline event in the same transaction.

This prevents two concurrent Telegram request submissions from both consuming the same remaining slot.

The limit is an **AccAbad platform policy**, not a claimed Kripicard KYC/card maximum.

## Admin review

Admin API:

```text
GET  /api/v1/card-requests
GET  /api/v1/card-requests/:id
POST /api/v1/card-requests/:id/transition
```

`GET` supports backend search, status filtering, a bounded page size, and cursor continuation.

Review writes require:

- authenticated admin session;
- `card_requests.review` permission;
- CSRF validation.

Approval requires the operator to choose one of the Telegram user's **currently assigned** Kripicard accounts. AccAbad then rechecks:

- the request state;
- current account ownership;
- account usability;
- current card/open-request capacity.

If another admin changed the assignment, or the platform limit is no longer available, approval fails instead of preserving a stale selection.

Approval changes the request only to `approved`. There is intentionally no provider issuance button/action in Phase 12.

Rejection changes the request to `rejected` and records the review event/audit entry.

## Request timeline and audit

Every Phase 12 request state change writes:

- an append-only `card_request_events` row; and
- an immutable/redacted `audit_logs` row for security/operations history where appropriate.

Telegram **My requests** exposes card-request detail and a safe status timeline to the owning user only.

## Telegram status notifications

Admin review writes a `card_request.status_changed` event to the durable Telegram outbox in the same database transaction.

The existing Telegram outbox worker sends a safe status notification with only:

- request reference;
- current status;
- instruction to open **My requests** for details.

It does not send provider credentials, account credentials, or card secrets.

## Admin UI

The **Requests → New cards** tab now loads production card requests from the backend.

For a pending request an admin can:

- inspect client/cardholder/BIN/amount data;
- choose from the client's currently eligible accounts;
- reject;
- approve.

An approved request displays that provider issuance remains disabled until the later issuance phase.

The UI does not invoke the old demo `createcard` flow from approval.

## Safety boundaries

Phase 12 deliberately does not implement:

- Kripicard `createcard`;
- provider wallet debit;
- crypto deposit creation;
- direct crypto-to-card payment;
- provider card funding;
- provider card deletion.

A Telegram user cannot create a provider card directly.

## Tests

Added:

- `tests/phase12-card-requests.test.mjs`
- `integration-tests/card-request-foundation.test.mjs`

Static/source coverage verifies:

- request timeline and permissions;
- Telegram request wizard fields;
- documented BIN/DOB configuration;
- serialized platform-limit checks;
- assignment/minimum enforcement;
- approval assignment/capacity rechecks;
- RBAC + CSRF;
- absence of provider create/fund/deposit calls;
- audit + Telegram outbox notification;
- production admin API/UI wiring.

The PostgreSQL integration test additionally verifies migration installation and append-only request events when run in CI with PostgreSQL.

## Known limits

- Phase 12 does not fetch a live BIN catalogue because no such endpoint is present in the supplied documentation.
- Admin `note` is supported by the API/data model, but the compact request table currently focuses on approve/reject and selected-account handling.
- The admin request table loads a bounded server-searched result set; the API exposes `nextCursor` for future large-queue navigation.
- Funding requests/receipts remain Phase 13.
- Approved card requests remain pending provider issuance until the later real card-creation phase.

## Rollback

Application code can be rolled back to Phase 11 while leaving migration `0011` installed; it is additive.

Do not normally drop `card_request_events`, because it is operational history. Preserve/export it before any destructive rollback.

## Next phase

Phase 13 — Funding Request and Receipt Workflow.
