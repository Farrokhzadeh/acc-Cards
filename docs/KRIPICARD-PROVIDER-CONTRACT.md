# Kripicard Provider Contract — AccAbad Phase 16

Authority for the card/deposit integration is the supplied Kripicard developer documentation for `https://appapi.kripicard.com`, especially the Overview, Virtual Cards, and Deposits PDFs. Other Kripicard product modules are out of scope for Phase 16.

## Payment model

```text
Crypto deposit → Kripicard account wallet → create card / fund card
```

The supplied contract does not document direct crypto payment for an individual create/fund operation. AccAbad therefore does not implement the earlier direct-crypto-to-card demo assumption.

## Authentication and rate behavior

All provider requests send the account's `api_key` from the server. The Overview contract states that limits are counted per API key and that read and purchase budgets are separate. Responses expose `RateLimit-Limit` and `RateLimit-Remaining`; HTTP 429 identifies the budget through `scope` and supplies a real wait time through `Retry-After` / `retry_after_seconds`.

AccAbad does not hard-code the numeric quota as a permanent product guarantee. It records returned rate-limit metadata and surfaces the provider's retry delay.

## Purchase outcome contract

The Overview documentation adds an important rule for every purchase endpoint:

- HTTP 202 with `pending: true` is **not success** and must **never auto-retry**.
- HTTP 202 without a `code` says the provider could not confirm the upstream result and has already refunded the charge. AccAbad still does not retry automatically because an upstream order may exist.
- HTTP 202 with `code: REFUND_PENDING` means the purchase failed but the automatic refund has not completed; the account may still be charged while Kripicard support resolves it. Do not retry.
- `success:false` without `pending` is a clean failure. AccAbad may expose an explicit later retry to an administrator, but never loops a purchase automatically.
- `OPERATION_IN_FLIGHT` is not treated as a normal rate-limit retry.

These rules are implemented in the provider client before schema-specific success parsing.

## Card creation — Phase 15

Endpoint:

```text
POST /api/external/cards/createcard
```

Documented request fields:

- `api_key`
- `bin`
- `amount` (provider docs say minimum USD 10; AccAbad keeps its stricter configurable minimum)
- `name_on_card`
- optional `email`
- `dateOfBirth` in `YYYY-MM-DD` only for the documented US/Singapore/UK BINs

Documented success fields include `card_id`, `last_4`, `bin`, `amount`, `fee`, and `total_charged`.

### One-shot issuance rule

`createcard` does **not** document a caller-controlled idempotency key. AccAbad therefore makes exactly **one provider attempt** per issuance operation.

Before sending `createcard`, AccAbad snapshots `cards/list`. If the provider result is ambiguous—HTTP 202/pending, `REFUND_PENDING`, timeout, network failure, 5xx, invalid response, or another non-clean outcome—the request moves to `needs_reconciliation`. AccAbad may call `cards/list` to look for one newly-created card matching the request, but it does not submit a second `createcard` automatically.

A clean rejection or HTTP 429 moves the request to `issue_failed`; any later retry is an explicit administrator action and creates a fresh internal operation only after the previous operation is terminal.

### Supported BINs from supplied Overview PDF

| BIN | Region | DOB required by Virtual Cards PDF |
|---|---|---:|
| 539502 | Hong Kong | No |
| 525847 | Hong Kong | No |
| 539578 | Hong Kong | No |
| 525797 | Hong Kong | No |
| 235019 | Hong Kong | No |
| 223600 | Hong Kong | No |
| 238003 | Hong Kong | No |
| 537872 | United States | Yes |
| 533171 | Singapore | Yes |
| 246001 | United Kingdom | Yes |

The list is treated as the supplied documented catalogue, not as a guarantee that every account tier can issue every BIN forever. Provider rejection remains authoritative at execution time.

## Safe reads already implemented

| Operation | Endpoint | AccAbad use |
|---|---|---|
| List cards | `/api/external/cards/list` | connection test, sync, status refresh, create reconciliation |
| Card details | `/api/external/cards/carddetails` | reauthenticated live PAN/expiry/CVV/balance reveal; never persisted |
| Transactions | `/api/external/cards/transactions` | transaction and card-balance synchronization |
| Deposit coins | `/api/external/deposits/coins` | discover provider-active deposit currencies |
| Deposit networks | `/api/external/deposits/networks` | discover networks/minimums |
| Deposit status | `/api/external/deposits/status` | reconcile a known deposit ID in a later phase |

## Card funding — Phase 16

Endpoint:

```text
POST /api/external/cards/fundcard
```

Documented request fields are `api_key`, preferred `card_id` (or `last4` as an alternative), and `amount`. AccAbad always uses the exact provider `card_id`. The supplied Virtual Cards contract documents a USD 10 minimum and a fixed USD 1.00 + 4% service fee; AccAbad keeps its stricter configurable request minimum and compares the provider-returned fee with the immutable request quote.

The documented success body contains the provider card ID, funded amount, fee, and total debited. No caller-controlled `fundcard` idempotency key or authoritative funding-operation ID is documented. Therefore Phase 16 uses a one-shot write: it captures pre-write live balance/transaction fingerprints, calls `fundcard` exactly once, records the provider result, and performs only read calls after an uncertain outcome.

HTTP 429 and a documented clean `success:false`/non-pending rejection are terminal safe failures for that individual attempt and may be explicitly retried later by an authorized admin. HTTP 202/pending, `REFUND_PENDING`, timeout, network failure, 5xx, invalid response, `OPERATION_IN_FLIGHT`, or a success payload that mismatches the intended card/amount enter `needs_reconciliation` and are never automatically resubmitted.

Read-only reconciliation stores observed balance/transaction evidence but deliberately does not infer a successful funding action from balance movement alone. Manual resolution requires recent admin reauthentication and a Kripicard provider/support/ticket reference. Concurrent unresolved funding is serialized per funding request and per card in PostgreSQL.

## Other writes

Freeze/unfreeze remains a guarded Phase 6 state write with read-after-error reconciliation.

`createDeposit` remains unavailable in the provider client in Phase 16. Card deletion is also not exposed by the launch workflow.

## Account-wallet balance

No live account-wallet-balance endpoint is present in the supplied documentation. AccAbad keeps the account-balance area visible but does not fabricate a provider balance.

## Webhooks

The supplied Webhook Control Center material confirms that signed event streams and delivery inspection exist, but it does not contain the signature algorithm, headers, payload schema, duplicate/event-ID contract, or retry schedule. AccAbad therefore does not treat the webhook security contract as fully confirmed yet.

See `PHASE-15-IMPLEMENTATION.md`, `PHASE-16-IMPLEMENTATION.md`, and `PROVIDER-READINESS-QUESTIONS.md`.
