# AccAbad Admin — Phase 6 Implementation

Status: implemented in source; live freeze/unfreeze requires a real/test Kripicard account and explicit deployment flags.

## Goal

Enable non-money card operations safely before card creation, card funding, or deposits are implemented.

## Provider endpoint implemented

`POST /api/external/premium/Freeze_Unfreeze`

Documented request fields:

- `api_key`
- `card_id`
- `action`: `freeze` or `unfreeze`

The provider response confirms success with `success: true` and a message. The supplied API does not document an idempotency key for this endpoint.

## Safety model

Freeze/unfreeze is a provider write, but it does not move money. AccAbad still treats it as a consequential write.

It is protected by both deployment gates:

```env
ENABLE_LIVE_PROVIDER_WRITES=false
ENABLE_KRIPICARD_CARD_STATE_WRITES=false
```

To test Phase 6 writes in staging, both must be enabled and the existing confirmation phrase must be present:

```env
ENABLE_LIVE_PROVIDER_WRITES=true
ENABLE_KRIPICARD_CARD_STATE_WRITES=true
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
```

Keep the flags disabled until a real/test account has passed the read-only Phase 5 checks.

## Write retry / reconciliation behavior

AccAbad never automatically retries the Freeze_Unfreeze write.

Flow:

1. Refresh the card from `cards/list`.
2. If the card is already in the requested state, return a no-op without writing.
3. Insert one pending `card_operations` record.
4. Submit Freeze_Unfreeze exactly once.
5. On explicit provider success, record success and update local state.
6. On timeout/network/5xx/invalid-response ambiguity, perform a safe `cards/list` read.
7. If the desired state is visible, mark the operation succeeded by reconciliation.
8. Otherwise mark `needs_reconciliation` and block another state write for that card.
9. Explicit provider rejections are marked failed rather than retried.

A partial unique index permits at most one unresolved freeze/unfreeze operation per card.

## Provider capability handling

`kripi_accounts.provider_capabilities` is updated dynamically:

- successful Freeze_Unfreeze → `freezeUnfreeze: true`
- a provider rejection that clearly indicates premium/unsupported/not-enabled access → `freezeUnfreeze: false`
- otherwise capability remains unknown

This avoids assuming that every Kripicard account tier supports the premium endpoint.

## Status refresh

Phase 6 adds a non-sensitive card-status refresh that uses `cards/list` rather than `carddetails`. This prevents PAN/CVV from being returned to the browser merely to refresh status.

API:

- `POST /api/v1/cards/:id/status`

## Card state operation API

- `POST /api/v1/cards/:id/state`

Body:

```json
{ "action": "freeze" }
```

or:

```json
{ "action": "unfreeze" }
```

Requires:

- authenticated admin session
- `cards.operate` permission
- CSRF token
- provider-write feature flags

## Card details and transactions

Phase 5 functionality remains active:

- explicit reauthenticated live PAN/CVV reveal
- no PAN/CVV persistence
- transaction synchronization and SHA-256 deduplication

Phase 6 additionally shows synchronized card transactions inside the card details dialog and provides an explicit **Refresh status** action.

## Audit

The following actions are recorded:

- `card.provider.status_refresh`
- `card.provider.freeze`
- `card.provider.unfreeze`
- `card.provider.state_noop`

Audit metadata contains operation IDs/outcomes but no API key, PAN, CVV, or raw provider payload.

## Migration

`db/migrations/0005_card_state_actions.sql`

Adds:

- one-unresolved-state-operation-per-card partial unique index
- safe setting `kripicard_card_state_writes_enabled = false`

## Not implemented in Phase 6

- Create card
- Fund card
- Delete card
- Crypto deposits
- Account wallet balance read (not documented)
- Provider webhooks
- Telegram user freeze/unfreeze callbacks (later Telegram phase)

## Manual staging validation

1. Complete Phase 5 with a real/test account and synchronized card.
2. Keep all money operations unavailable.
3. Enable the two provider-write flags in staging.
4. Open a synchronized active card.
5. Click **Refresh status** and confirm the provider state is reflected locally.
6. Click **Freeze** once.
7. Confirm local state becomes Frozen and a `card_operations` row is `succeeded`.
8. Click **Freeze** again and confirm it is handled as a no-op without another provider write.
9. Click **Unfreeze** and confirm state returns Active.
10. Disable `ENABLE_KRIPICARD_CARD_STATE_WRITES` and confirm the action is rejected safely.
11. Test a provider/account without premium access if available; capability should become false on an explicit unsupported response.

For ambiguous timeout testing, use a controlled test proxy or provider test environment. The expected behavior is `needs_reconciliation`, never an automatic write retry.
