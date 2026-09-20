# Kripicard Production Readiness Questions for AccAbad

This tracker reflects the expanded supplied Kripicard documentation for `https://appapi.kripicard.com`.

## Answered by the supplied Overview / Virtual Cards / Deposits docs

- **Rate limits / rate limiting:** per API key; reads and purchases use separate budgets. Responses expose rate-limit remaining/limit information and HTTP 429 supplies a scope plus retry duration.
- **Purchase HTTP 202:** `pending:true` is not success and must never be auto-retried. A no-code 202 says the provider already refunded the charge; `REFUND_PENDING` says the account may remain charged while support resolves the refund.
- **Clean failure:** `success:false` without `pending` is documented as not charged.
- **Documented BIN catalogue:** 539502, 525847, 539578, 525797, 235019, 223600, 238003, 537872, 533171, 246001.
- **Create fields:** exact `createcard` fields and DOB requirements are documented.
- **Deposit create:** caller `order_id` is idempotent; payment instruction/status fields are documented.

## Still useful to confirm with Kripicard

### Wallet

1. Is there a supported endpoint for the current account wallet balance? If yes, provide path/schema/consistency guarantees.
2. If there is no balance endpoint, is provider rejection for insufficient balance the recommended create/fund preflight behavior?

### Card creation

3. Does `createcard` support any caller-controlled idempotency/order reference that is absent from the supplied UI documentation?
4. The Virtual Cards page says slow provisioning returns a pending reference. What is its exact response field name/shape, and is there a dedicated lookup endpoint?
5. After a network disconnect where AccAbad receives no HTTP response at all, is `cards/list` the recommended reconciliation method?

### Card funding

Phase 16 can operate safely without assuming answers to these questions because it sends `fundcard` once and blocks automatic retry after uncertainty. These answers are still valuable for stronger automation and faster reconciliation:

6. Does `fundcard` accept an idempotency/order reference that is absent from the supplied documentation?
7. After an ambiguous fund timeout, what authoritative lookup/reconciliation method identifies whether the debit occurred?
8. Is there a unique funding-operation ID on success that is absent from the supplied success example?

### Fees / account capability

9. Confirm whether create/fund fees vary by BIN, account tier, or negotiated account pricing.
10. Can BIN availability differ by API account even though the Overview lists ten BINs?
11. Is there a machine-readable capabilities/BIN-catalog endpoint?

### Deposits

12. Confirm the uniqueness scope/retention duration of deposit `order_id`.
13. What happens on underpayment?
14. What happens on overpayment?
15. What happens if funds arrive after `expires_at`?
16. Can a failed/expired deposit later become completed after reconciliation?

### Webhooks

The supplied Webhook Control Center shows signed event streams and delivery logs but not enough cryptographic detail to implement verification.

17. What endpoint/API creates a webhook subscription?
18. What are the signing headers and signature algorithm/canonical payload?
19. What is the unique event ID/deduplication key?
20. What are retry intervals, delivery timeout, ordering, and duplicate guarantees?
21. Which card/deposit events are available, including delayed `createcard` provisioning?

### Environment

22. Is there a separate sandbox base URL or does a sandbox API key use the same `appapi.kripicard.com` base?
23. Which capabilities differ between sandbox and production?

For each answer, record the applicable API version/date and a provider ticket/email/document reference in AccAbad's readiness panel.
