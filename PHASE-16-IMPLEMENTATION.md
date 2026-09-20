# AccAbad Admin — Phase 16 Implementation

## Goal

Execute an **accepted funding request** against the exact Kripicard card using the documented `POST /api/external/cards/fundcard` endpoint, while making an uncertain provider outcome impossible to turn into a blind duplicate funding attempt.

Phase 16 does not add account deposits or card deletion.

## Provider contract used

The supplied Kripicard Virtual Cards documentation defines `fundcard` with:

- `api_key`
- preferred `card_id` (AccAbad does not use last4 for the provider write)
- `amount` in USD, documented minimum USD 10
- documented fee model: USD 1.00 + 4%
- success fields: `card_id`, `amount`, `fee`, `total_debited`

The supplied Overview documentation applies the global purchase safety contract:

- HTTP 202 + `pending:true` is never success and must not be auto-retried.
- HTTP 202 without a code says the charge was already refunded, but a provider/upstream order may still exist, so AccAbad still does not retry automatically.
- `REFUND_PENDING` means the purchase failed but the refund is unresolved; do not retry.
- a clean `success:false` response without `pending` is documented as not charged and can be explicitly retried later.
- HTTP 429 exposes a provider retry interval and is treated as a clean attempt failure; there is no automatic write retry.

No caller-controlled `fundcard` idempotency key or authoritative fund-operation identifier is documented. AccAbad therefore does not pretend its local operation UUID is a provider idempotency key.

## Database migration

`db/migrations/0015_card_funding.sql`

Adds:

- `funding_requests.funding_started_at`
- `funding_requests.funded_at`
- `funding_requests.last_fund_operation_id`
- `needs_reconciliation` funding status
- `funding.execute` permission
- one unresolved fund operation per funding request
- one unresolved AccAbad fund operation per card
- supplied-PDF evidence for current documented funding fee/minimum behavior

The unique partial indexes are a **local concurrency guard** only. They do not claim provider-side idempotency.

## Execution prerequisites

`POST /api/v1/funding-requests/:id/fund` requires all of the following:

1. authenticated admin with `funding.execute`
2. valid CSRF token
3. recent administrator reauthentication
4. `ENABLE_LIVE_PROVIDER_WRITES=true`
5. `ENABLE_KRIPICARD_CARD_FUNDING=true`
6. `LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED`
7. operation-specific `card_fund` provider readiness
8. request status `accepted`, or `funding_failed` whose previous operation explicitly records `safeToRetry=true`
9. latest receipt scan status `clean`
10. card is still assigned to the Telegram user who submitted the request
11. exact provider `card_id` exists
12. owning Kripicard account is usable and has an encrypted API key

## One-shot funding algorithm

AccAbad starts one local `card_operations` row and takes an advisory/unique-index lock before contacting the provider.

Before the provider write it fetches read-only `carddetails` and `transactions` and stores only safe reconciliation evidence:

- pre-write balance in cents
- card status
- total transaction count
- SHA-256 fingerprints of non-zero transaction metadata

It then sends exactly one `fundcard` request.

### Confirmed success

The response must identify the same provider card and amount. AccAbad records:

- actual provider fee
- expected immutable quote fee
- whether the two differ
- completion timestamp
- operation/audit history
- best-effort refreshed card balance

The Telegram status notification is queued through the existing durable outbox.

### Clean failure

HTTP 429 and documented clean provider rejections become `funding_failed` with `safeToRetry=true`. A later admin click creates a new local operation; AccAbad never loops a provider write automatically.

### Uncertain outcome

Timeout, network failure, HTTP 5xx, HTTP 202/pending, `REFUND_PENDING`, `OPERATION_IN_FLIGHT`, malformed provider output, or a mismatching success payload becomes `needs_reconciliation` with `safeToRetry=false`.

AccAbad will not call `fundcard` again while that operation is unresolved.

### Process-crash recovery

If the application dies after the local funding operation is committed but before the provider outcome is persisted, the request may remain in `funding`. The Recheck action refuses to interfere during the provider timeout safety window. Once the operation is stale (at least 60 seconds and at least three configured provider request timeouts), AccAbad atomically converts it to `needs_reconciliation` and proceeds with read-only evidence collection. It never replays `fundcard` during crash recovery.

## Reconciliation

`POST /api/v1/funding-requests/:id/reconcile` performs **read-only** provider calls and records evidence such as current balance delta and newly observed non-zero transaction fingerprints. It deliberately does not infer that a specific fund-card operation succeeded solely because the card balance changed; unrelated card transactions could make such an inference unsafe.

Manual final resolution uses:

`POST /api/v1/funding-requests/:id/resolve`

and requires recent reauthentication plus a non-empty Kripicard support/ticket/reference. An admin may record either:

- `completed` — provider confirmed the card was funded
- `not_funded` — provider confirmed it was not funded; only then is a future explicit retry allowed

The final transition re-locks both the request and operation so two administrators cannot resolve the same uncertainty in opposite directions. Historical reconciliation remains possible even if the Telegram account assignment changes after the uncertain provider write; only a **new/retry** funding attempt requires current ownership.

## UI

Request Center now exposes:

- **Fund card** for `accepted`
- **Retry safe failure** for clean `funding_failed`
- **Recheck provider state** for `needs_reconciliation`
- **Provider confirms not funded**
- **Provider confirms funded**

Legacy local/demo Add Funds UI cannot perform production provider funding.

## Environment

Keep disabled by default:

```env
ENABLE_LIVE_PROVIDER_WRITES=false
ENABLE_KRIPICARD_CARD_FUNDING=false
```

Controlled staging only:

```env
ENABLE_LIVE_PROVIDER_WRITES=true
ENABLE_KRIPICARD_CARD_FUNDING=true
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
```

`createDeposit` remains unavailable.

## Rollback

Disable `ENABLE_KRIPICARD_CARD_FUNDING` first. Do not roll back database rows for an unresolved real provider operation. Reconcile/resolve any `funding` or `needs_reconciliation` operation before structural rollback.

Migration `0015` adds columns/indexes/permission/readiness evidence and is safe to leave in place with the feature switch disabled.

## Validation target

A live staging acceptance test should prove:

1. one accepted request causes at most one provider `fundcard` submission per explicit attempt;
2. double-clicks/concurrent admins cannot create simultaneous unresolved fund operations;
3. clean provider rejection is explicitly retryable;
4. HTTP 202/timeout/5xx/network uncertainty never causes an automatic second write;
5. manual resolution requires reauthentication and provider evidence;
6. successful provider funding completes the request and notifies the Telegram user;
7. provider API keys and sensitive card data never enter logs or audit metadata.
