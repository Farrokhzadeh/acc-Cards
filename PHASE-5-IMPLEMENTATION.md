# AccAbad Admin — Phase 5 Implementation

Status: implemented in source; live Kripicard connectivity requires a real/test account API key.

## Provider documentation used

The supplied Kripicard Virtual Cards and Deposits API PDFs are the contract source for this phase.

Confirmed provider base URL:

`https://appapi.kripicard.com`

Read-only endpoints implemented:

- `POST /api/external/cards/list`
- `POST /api/external/cards/carddetails`
- `POST /api/external/cards/transactions`

Every provider request is made server-side with the decrypted per-account API key. The API key never comes from browser input on provider calls and is never logged.

## Production behavior added

- Per-account Kripicard client.
- Strict response validation with Zod.
- HTTPS base URL configuration.
- Request timeout.
- Bounded exponential retry for read-only calls.
- Provider failure mapping without logging secrets or raw sensitive payloads.
- Test-connection endpoint using `cards/list`.
- Manual card synchronization.
- Upsert by `(account_id, provider_card_id)`.
- Missing provider cards are marked `attention`; financial/history records are not deleted.
- Per-account sync failure/backoff state in PostgreSQL.
- Live card details fetched on demand.
- PAN/CVV are never persisted to PostgreSQL.
- Sensitive card reveal is super-admin-only by default and requires recent reauthentication.
- Transaction synchronization with deterministic SHA-256 fingerprints because the documented transaction response does not contain a provider transaction ID.
- Repeated transaction sync is deduplicated.
- Sanitized contract fixtures based on the supplied API documentation.

## AccAbad API surface added

- `POST /api/v1/accounts/:id/verify`
- `POST /api/v1/accounts/:id/sync`
- `POST /api/v1/cards/:id/details`
- `GET /api/v1/cards/:id/transactions`
- `POST /api/v1/cards/:id/transactions`

## Provider payment-model correction

The supplied Kripicard documentation confirms that:

- card creation deducts the initial amount and fee from the Kripicard account wallet;
- card funding debits the owning account wallet;
- crypto deposits credit the account wallet after on-chain confirmation.

Therefore the earlier demo concept of paying crypto directly for an individual create-card or fund-card operation is **not a documented Kripicard capability**.

Phase 5 records:

- `kripicard_payment_model = "account_wallet"`
- `kripicard_direct_crypto_card_funding_supported = false`

No money-changing provider operation is enabled in Phase 5.

## Account balance

Kripicard's supplied PDFs still do not document a wallet-balance read endpoint. AccAbad therefore continues to show account balance as unavailable unless a future authoritative source provides one or AccAbad displays a clearly labeled derived balance.

## Synchronization and backoff

`account_sync_state` records:

- consecutive failures;
- last started/succeeded/failed timestamps;
- next scheduled attempt time;
- safe error code/message.

The later worker/jobs phase can consume `next_attempt_at`. Manual administrator sync is allowed regardless of backoff.

## Testing

`tests/kripicard-contract.test.mjs` validates the documented endpoint wiring, sanitized response fixtures, sensitive-data non-persistence, reconciliation behavior, transaction fingerprinting, and confirmed wallet model.

`integration-tests/kripicard-read-foundation.test.mjs` checks the PostgreSQL migration when a real test database is available.

## Not implemented in Phase 5

- Create card.
- Fund card.
- Freeze/unfreeze (Phase 6).
- Delete card.
- Deposits.
- Provider webhooks.
- Automated worker scheduling.
- Live account wallet balance (no documented endpoint).

## Manual validation with a test account

1. Deploy/migrate Phase 5.
2. Add a Kripicard account with a real/test API key from the encrypted account form.
3. Click the account sync icon. AccAbad first verifies `cards/list`, then synchronizes cards.
4. Open a synchronized card.
5. Reauthenticate and choose **Reveal number & CVV** to test on-demand `carddetails`.
6. Choose **Sync transactions** to test `cards/transactions` and local deduplication.
7. Repeat transaction sync; the second run must not create duplicate local rows.

Do this against a test/sandbox account if Kripicard provides one. If Kripicard has no sandbox, begin with a low-risk read-only production account and keep `ENABLE_LIVE_PROVIDER_WRITES=false`.
