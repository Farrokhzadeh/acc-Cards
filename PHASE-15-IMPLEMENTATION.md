# Phase 15 — Guarded Real Kripicard Card Issuance

## Goal

Turn an **approved** AccAbad card request into one real Kripicard `createcard` operation without making an ambiguous provider result retryable.

Phase 15 does not implement `fundcard`, deposit creation, card deletion, or ad-hoc provider card creation from the generic account UI.

## Provider evidence added for this phase

The additional supplied Overview documentation confirms:

- rate limits are per API key, with separate read/purchase budgets;
- HTTP 429 exposes its budget/scope and retry duration;
- purchase HTTP 202 + `pending:true` must never be auto-retried;
- `REFUND_PENDING` is a distinct charged/refund-unresolved state;
- clean `success:false` failures are not charged;
- the current documented BIN list contains ten BINs.

The Virtual Cards document supplies the exact `createcard` fields and success shape.

## Database migration

`db/migrations/0014_card_issuance.sql`

Adds:

- safe result metadata on `card_operations`;
- provider HTTP/retry metadata;
- issuance timestamps/reference on `card_requests`;
- a partial unique index that permits only one unresolved create operation per card request;
- `card_requests.issue` permission for Super Admin and Operator;
- the ten supplied BINs;
- evidence updates for production rate behavior, BIN catalogue, and purchase HTTP-202 behavior.

`createcard_idempotency` deliberately remains `partial`: no caller-provided idempotency field was documented. It no longer blocks the Phase 15 operation because the safe strategy is one-shot + reconciliation, not an invented idempotency key.

## Issuance API

```text
POST /api/v1/card-requests/:id/issue
POST /api/v1/card-requests/:id/reconcile
```

Issue requires:

- authenticated administrator;
- `card_requests.issue`;
- CSRF validation;
- recent administrator reauthentication;
- `ENABLE_LIVE_PROVIDER_WRITES=true`;
- `ENABLE_KRIPICARD_CARD_CREATION=true`;
- `LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED`;
- operation-specific provider readiness for `card_create`.

Reconcile is read-only against the provider and does not send another `createcard`.

## Issuance flow

```text
approved request
     ↓
lock request + client capacity
     ↓
recheck selected account assignment
     ↓
recheck BIN / DOB / platform card cap
     ↓
create internal pending operation
     ↓
cards/list pre-write snapshot
     ↓
createcard ONCE
  ┌───────────┬──────────────────────────────┐
  │ success   │ uncertain result             │
  ↓           ↓                              │
persist card  needs_reconciliation           │
+ issued      ↓                              │
              cards/list safe reconciliation │
                 ├─ one safe match → issued  │
                 └─ otherwise → stop         │
```

No branch automatically submits a second `createcard`.

## Clean failures

A documented clean provider rejection and HTTP 429 become `issue_failed`. The operator may retry later explicitly. Rate-limit metadata is preserved so the UI/API can show the provider's requested delay.

## Ambiguous outcomes

These become `needs_reconciliation`:

- HTTP 202 `pending:true`;
- `REFUND_PENDING`;
- timeout;
- network failure;
- provider 5xx;
- invalid/unexpected response;
- other outcomes where the provider cannot safely prove no purchase occurred.

The reconciliation path compares the pre-write provider card IDs with a new `cards/list` response. It only auto-binds a card when there is exactly one plausible new card with the requested cardholder name and a compatible creation time. Otherwise it stays unresolved for manual/provider-support review.

## Persistence-after-success rule

After Kripicard explicitly returns create success, a local PostgreSQL failure is **not** converted into a retryable provider error. The operation/request are best-effort marked `needs_reconciliation`, and the API returns `persistence_error_after_provider_write`. The partial unique index blocks another create attempt until reconciliation.

## Data policy

Phase 15 persists only safe card metadata returned/derived from create/list:

- provider card ID;
- last four;
- BIN;
- holder/email;
- status;
- initial/synchronized balance;
- provider fee metadata.

PAN/CVV are still only fetched on explicit reauthenticated detail reveal and are never persisted.

## UI

Request Center now exposes:

- **Issue card** for approved requests;
- **Retry clean failure** for terminal `issue_failed` requests;
- **Reconcile** for `needs_reconciliation`;
- an in-progress status for `issuing`.

Approval itself still performs no provider purchase. The operator must explicitly issue the approved request.

The old generic account-level create-card control remains clearly labelled as a legacy local demo and is not wired to `createcard`.

## Feature flags

Default:

```env
ENABLE_LIVE_PROVIDER_WRITES=false
ENABLE_KRIPICARD_CARD_CREATION=false
```

Controlled staging test:

```env
ENABLE_LIVE_PROVIDER_WRITES=true
ENABLE_KRIPICARD_CARD_CREATION=true
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
```

Use a sandbox/test Kripicard account or an explicitly approved low-risk staging account first.

## Remaining provider unknowns

Phase 15 does not pretend that these are solved:

- no account-wallet balance endpoint is documented;
- no caller-controlled `createcard` idempotency key is documented;
- exact pending-reference field shape for delayed card provisioning is not separately documented;
- webhook signature/payload/retry details are incomplete;
- production fees/account-tier capabilities may change and provider execution is authoritative.

These unknowns are handled conservatively and do not cause automatic write retries.
