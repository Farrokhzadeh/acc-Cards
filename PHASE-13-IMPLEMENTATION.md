# Phase 13 — Funding Request and Receipt Workflow

## Status

Implemented in AccAbad Admin `0.13.0`.

Phase 13 accepts a client's request to add USD value to an already assigned card, snapshots the commercial quote, stores payment evidence privately, and lets an authorized admin accept, reject, or request corrected evidence. It **does not call Kripicard `fundcard`** and does not debit a provider wallet.

## Provider contract boundary

The supplied Kripicard documentation says card funding uses `/api/external/cards/fundcard`, debits the owning Kripicard wallet, accepts `card_id` (preferred) or `last4`, and has a documented minimum of USD 10. The documented example fee model is a fixed USD 1 plus 4% of the amount. Phase 13 uses the currently configured provider-fee snapshot for quoting only; provider execution remains disabled.

AccAbad's default client-facing minimum remains USD 20 and cannot be configured below the documented USD 10 provider minimum.

## Telegram workflow

1. The user passes the existing ban, force-join, and assignment gates.
2. **Add funds** lists cards resolved from the user's current account assignments.
3. The user selects a card and enters a USD amount.
4. The server reads the current approved Rial/USD rate plus the current service/provider fee configuration and builds a quote with integer arithmetic.
5. The exact quote inputs are saved in the server-side Telegram draft. Later settings changes do not change that displayed quote before submission.
6. The user confirms before the quote expires.
7. A `FR-...` funding request is created with immutable amount, fee, rate, and local-currency snapshots.
8. The user uploads a PDF/JPEG/PNG/WebP receipt.
9. Receipt validation/scanning succeeds before the request moves to `pending_review`.
10. Admin review can accept, reject, or request corrected evidence. A correction request invalidates the previously clean receipt, so it cannot be re-accepted without a replacement.
11. The durable Telegram outbox communicates status changes.
12. `accepted` is a terminal Phase 13 handoff state. No provider funding action is executed.

A user can cancel while the request is `pending_receipt`, `pending_review`, or `correction_needed`.

## Quote snapshot model

Each request stores:

- card amount in USD cents;
- provider fee in USD cents;
- service fee in USD cents;
- total USD basis;
- provider fee basis points;
- provider fixed fee in cents;
- service fee basis points;
- approved exchange-rate row ID;
- exact Rial/USD rate;
- calculated Rial total;
- quote expiry timestamp.

Calculations use integer/`bigint` arithmetic. Historical requests are never recomputed from today's settings or exchange rate.

Manual rates are inserted as new immutable `exchange_rates` rows with the approving administrator; editing pricing does not rewrite historical rows.

## Receipt storage and validation

Receipt bytes are downloaded server-side from Telegram and are never exposed by their storage key to the browser.

The local production default uses a private Docker named volume mounted at:

```text
/var/lib/accabad/receipts
```

Storage behavior:

- randomized object keys rather than user filenames;
- directories created with mode `0700`;
- receipt files created with mode `0600`;
- configurable maximum size (10 MB default);
- allowlist: PDF, JPEG, PNG, WebP;
- magic-byte detection, not extension-only trust;
- SHA-256 digest recorded in PostgreSQL;
- admin download requires `funding.read` and is forced as an attachment with `nosniff` and a sandbox CSP;
- superseded correction receipts are retained as rejected evidence rather than silently overwritten.

The receipt database insert and request transition now happen in one PostgreSQL transaction. If that database transaction fails after the file has been written, AccAbad removes the new object to avoid leaving an unreferenced private file.

## Malware scanning

AccAbad contains a `clamd` INSTREAM integration. Configure:

```env
RECEIPT_CLAMAV_HOST=<clamd-host>
RECEIPT_CLAMAV_PORT=3310
RECEIPT_CLAMAV_TIMEOUT_MS=5000
RECEIPT_REQUIRE_ANTIVIRUS=true
```

When `RECEIPT_REQUIRE_ANTIVIRUS=true`, a missing/unreachable scanner fails the upload closed and a ClamAV `FOUND` response rejects the file.

When antivirus is not configured, AccAbad can still run strict file type/size validation for staging/development, but that must **not** be described as a full malware scan. For real payment evidence, deploy a reachable scanner and enable the fail-closed flag.

## Funding state machine

```text
pending_receipt
    ↓ receipt accepted
pending_review
    ├── accept ───────→ accepted
    ├── reject ───────→ rejected
    └── correction ───→ correction_needed
                           ↓ new valid receipt
                       pending_review
```

Client cancellation is allowed from `pending_receipt`, `pending_review`, and `correction_needed`.

Schema values for later phases (`funding`, `funding_failed`, `completed`) already exist, but Phase 13 does not transition an accepted request into them.

## RBAC and audit

Migration `0012_funding_request_receipts.sql` adds:

- `funding.read`;
- `funding.review`;
- `funding.pricing.manage`.

Review and settings mutations require an authenticated administrator plus CSRF validation. Request events are append-only. Review actions and pricing changes produce redacted audit records; receipt object keys and receipt bytes are not written to audit metadata.

## Admin API

```text
GET  /api/v1/funding-requests
GET  /api/v1/funding-requests/:id
POST /api/v1/funding-requests/:id/transition
GET  /api/v1/funding-requests/:id/receipt
GET  /api/v1/funding-settings
PATCH /api/v1/funding-settings
```

Funding-request list search occurs server-side before stable `(submitted_at,id)` cursor pagination.

## Database migration

Apply:

```text
db/migrations/0012_funding_request_receipts.sql
```

It adds the Phase 13 funding statuses, fee/rate snapshot fields, review metadata, receipt scan metadata, permissions, bot-state modes, indexes, settings defaults, and append-only event protection.

## Deployment notes

The application service now mounts the `accabad_receipts` named Docker volume. The PostgreSQL backup command only backs up PostgreSQL; it does **not** include receipt bytes. Until the formal Phase 21 backup/recovery work is completed, operators must include the receipt volume in their separate encrypted/off-host backup policy if receipts are being retained.

No object-store integration is required for Phase 13. The storage module is deliberately isolated so a later S3/R2-compatible backend can replace local-volume storage without changing funding-request business logic.

## Validation performed in this milestone

Dependency-independent Phase 13 source-contract tests cover quote snapshots, Telegram flow, receipt type/size restrictions, ClamAV fail-closed support, private storage, atomic receipt transition, RBAC/CSRF review, safe admin download, pricing/rate snapshots, durable Telegram status delivery, backend admin UI wiring, and cursor pagination.

A complete `npm ci`, TypeScript typecheck/build, Docker migration, and live PostgreSQL/Telegram integration run still require an environment with npm registry access, Docker, PostgreSQL, and configured provider/bot credentials.

## Known limitations / next boundary

- No Kripicard `fundcard` call exists in Phase 13.
- No Kripicard account-wallet balance endpoint is documented, so AccAbad still does not claim a live wallet balance.
- No automatic external exchange-rate provider is implemented; rate rows are currently approved manual snapshots.
- A ClamAV daemon is supported but not bundled as a mandatory Docker service.
- Receipt-volume lifecycle/retention and disaster-recovery automation are completed later in the operations phases.

The next milestone is Phase 14: confirm the remaining live wallet/deposit operational details (rate limits, provider idempotency/reconciliation behavior, current fees, webhooks, production capabilities) before enabling any new money-changing Kripicard operation.
