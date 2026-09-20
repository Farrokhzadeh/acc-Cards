# AccAbad Admin — Phase 14 Implementation

## Scope

Phase 14 converts the remaining Kripicard money-operation assumptions into an explicit, auditable production-readiness gate. It does **not** enable account deposits, card creation, card funding, or card deletion.

The two supplied Kripicard PDFs remain the authority for the `https://appapi.kripicard.com` contract used by AccAbad. Official public Kripicard pages were also reviewed on 2026-09-12 as secondary context. Those pages advertise sandbox access and webhook capabilities for approved partners, but they do not publish the exact `appapi` rate limits, webhook signature/delivery contract, or create/fund idempotency semantics. Public/marketing material therefore cannot clear a blocking readiness check.

## Confirmed payment model

The supplied PDFs establish this flow:

```text
Crypto deposit
    ↓
Kripicard account wallet
    ↓
Create card / Fund card
```

The earlier demo concept of paying crypto directly for one card-create or card-fund operation is not part of the supplied `appapi` contract.

Confirmed from the supplied PDFs:

- provider base URL: `https://appapi.kripicard.com`;
- deposit coin discovery: `/api/external/deposits/coins`;
- deposit network discovery: `/api/external/deposits/networks`;
- deposit create: `/api/external/deposits/create`;
- deposit status: `/api/external/deposits/status`;
- deposit `order_id` is documented as idempotent;
- deposit create returns `pay_address`, exact `pay_amount`, `pay_currency`, `network`, `expires_at`, `fee_usd`, and the net USD credit on completion;
- deposit statuses are `pending`, `completed`, and `failed`;
- completed deposit status reports whether it was credited and the credited USD amount;
- card creation and card funding debit the account wallet;
- fund-card documentation states a USD 1 fixed fee plus 4%; examples are retained as documentation evidence, not treated as an eternal production price list;
- no live account-wallet balance endpoint is present in the supplied PDFs.

## New readiness database gate

Migration:

```text
db/migrations/0013_provider_operational_readiness.sql
```

adds:

- `provider_readiness_checks` — current authoritative readiness state;
- `provider_readiness_events` — append-only history of every change;
- `provider.readiness.read` permission;
- `provider.readiness.manage` permission.

Every check records:

- category;
- requirement;
- status: `confirmed`, `partial`, `unresolved`, or `not_applicable`;
- evidence source;
- evidence reference;
- safe note;
- whether it blocks live money;
- confirming administrator/time.

The seed deliberately separates facts supported by the PDFs from production questions that remain unanswered.

## Readiness API

```text
GET   /api/v1/provider-readiness
PATCH /api/v1/provider-readiness/:key
```

`GET` is available to roles with `provider.readiness.read`.

`PATCH` requires:

- `provider.readiness.manage`;
- authenticated administrator session;
- CSRF protection;
- an evidence reference before a check can be marked `confirmed` or `not_applicable`.

A live-money blocker cannot be cleared using `official_public`/marketing material. It requires either:

- `provider_written` evidence, such as a support ticket/email/partner document; or
- `live_test` evidence from a controlled sandbox/production test with the result recorded.

Updates create an immutable readiness event and an admin audit event.

## Reusable money-operation assertion

`server/providers/kripicard/readiness.ts` exports:

```text
assertProviderMoneyReadiness("deposit_create" | "card_create" | "card_fund")
```

Later phases must call this before a money-changing Kripicard workflow can progress to the provider write.

Phase 14 itself still contains no `createDeposit`, `createCard`, or `fundCard` client method, so clearing the checklist alone cannot move funds.

## Deposit contract validation

The Kripicard client now implements only the safe deposit reads needed for discovery/reconciliation:

```text
depositCoins()
depositNetworks({ currency })
depositStatus({ id })
```

There is deliberately no `createDeposit()` in Phase 14.

Zod contracts and sanitized fixtures were added for:

- coins;
- networks;
- deposit-create response shape;
- deposit status.

The create-response schema exists for contract testing and later implementation; it is not wired to a provider write.

## Admin UI

Settings now displays a database-backed **Kripicard money readiness** panel containing:

- provider base/profile;
- wallet-based payment model;
- confirmed count;
- blocking count;
- every readiness check and its evidence;
- a prominent live-money blocked/cleared state.

The UI does not contain a bypass button.

## Remaining blocking provider questions

Before Phase 15/16 provider money writes can be enabled, obtain authoritative answers for:

1. live account-wallet balance endpoint, if any;
2. production API rate limits and concurrency guidance;
3. create-card idempotency or exact reconciliation after timeout/pending outcomes;
4. fund-card idempotency or exact reconciliation after timeout/unknown outcomes;
5. current production create/fund/deposit fee schedule and variability;
6. live BIN/product catalogue and required fields/capabilities;
7. deposit webhook registration, signature verification, unique event ID, retries, ordering, duplicates, and delivery guarantees;
8. deposit underpayment behavior;
9. deposit overpayment behavior;
10. payment arriving after `expires_at`;
11. account-tier/capability differences in production.

A ready-to-send questionnaire is included in `PROVIDER-READINESS-QUESTIONS.md`.

## Safety rules retained

- No fabricated account wallet balance.
- No direct crypto-to-card claim for the supplied `appapi` contract.
- No automatic retry of ambiguous money writes.
- No fee assumption is treated as permanent production truth.
- Provider secrets stay server-side.
- General live-write flags remain insufficient to enable money movement because those methods do not exist yet.

## Validation boundary

Dependency-independent tests validate the new readiness migration/API/service, deposit schemas/fixtures, UI gate, and absence of money-write client methods.

A real Phase 14 operational clearance still requires written provider answers and/or a controlled sandbox/live account. The source correctly remains **not ready for money writes** until those evidence-backed checks are updated.
