# First-card onboarding use cases

## Scope

This flow starts when a new Telegram user opens the bot and ends when the user can open the card menu and see the first assigned card.

## Actors

| Actor | Responsibility |
| --- | --- |
| User | Select a language, submit KYC, choose the first-card amount, pay, and upload a receipt |
| Admin | Review KYC and payment, choose an available Kripicard account, create the card, reconcile uncertain issuance, and complete onboarding |
| Bot | Validate input, preserve progress, enforce state gates, and notify the user |
| Kripicard | Create the provider card and return card state |

## Preconditions

- Telegram webhook and bot credentials are configured.
- KYC is enabled.
- The admin has configured the destination payment card, card-holder name, minimum first-card amount, and onboarding BIN.
- At least one eligible Kripicard account is available.
- Live provider writes and card creation are enabled before the admin creates the card.

## Happy path

| Step | User experience | System and admin result |
| --- | --- | --- |
| 1 | The user sends `/start`. | The bot creates or refreshes the Telegram user record. |
| 2 | The user selects English or Persian. | The language is stored and all later onboarding messages use it. |
| 3 | The user starts KYC. | The bot opens a time-limited KYC session. |
| 4 | The user enters legal name, date of birth, country, national ID or passport, phone number, and uploads an ID image or PDF. | Each value and document type is validated. The bot shows a confirmation summary. |
| 5 | The user confirms the submission. | KYC becomes `pending` and appears in the admin KYC queue. |
| 6 | The admin reviews the details and document, then approves KYC. | KYC becomes `approved`; the bot notifies the user and unlocks first-card payment. |
| 7 | The user chooses the first-card amount. | The bot enforces the configured minimum, which defaults to `$25`. |
| 8 | The bot shows the exact amount, destination card number, and card-holder name. The user pays. | The selected amount is preserved as the intended initial card balance. |
| 9 | The user uploads a payment image or PDF. | The receipt is stored privately and payment becomes `pending`. The admin sees the onboarding payment in the client view. |
| 10 | The admin opens the receipt and accepts it. | Payment becomes `accepted`. Acceptance is blocked unless the receipt, amount, and approved KYC all exist. |
| 11 | The admin selects an eligible Kripicard account and chooses **Create first card**. | The account is assigned to the user, an approved onboarding card request is created, and payment becomes `card_creating`. |
| 12 | Kripicard creates the card using the approved KYC name, selected account email, configured BIN, and paid amount. | The local card is linked to both the account and onboarding request. Payment becomes `card_ready`. |
| 13 | The admin checks the result and chooses **Complete onboarding**. | The system confirms that the linked card belongs to the user's assigned account, changes payment to `complete`, and queues the Telegram notification. |
| 14 | The user receives the completion message and opens **My cards**. | The bot unlocks the normal menu and shows the card's last four digits, status, balance, and transactions. |

## Alternate paths

| Condition | Result |
| --- | --- |
| KYC is rejected | The user is notified and may submit KYC again. |
| KYC session expires or is cancelled | Temporary state is removed; an uploaded draft document is deleted. |
| Amount is below the configured minimum | The bot rejects it and asks for another amount. |
| Payment destination is not configured | Payment cannot start; the user is directed to support. |
| Receipt is invalid, too large, or late | The bot rejects it without advancing payment. |
| Admin denies the receipt | Amount and receipt data are cleared, the stored receipt is deleted, and the user can retry. |
| No eligible Kripicard account exists | Card creation remains blocked until an account becomes available. |
| Provider credentials or write gates are unavailable | Card creation stops before a provider write. |
| Provider result is uncertain | Payment becomes `card_reconciliation`; the admin must reconcile with read-only provider evidence before continuing. |
| Provider creation safely fails | The request remains retryable; an admin may retry and may change the account only while issuance is still safe to change. |
| User is banned | Onboarding and card access are blocked. |

## State progression

| Area | States |
| --- | --- |
| KYC | `none` → `pending` → `approved` or `rejected` |
| Payment and first card | `none` or `denied` → `pending` → `accepted` → `card_creating` → `card_ready` → `complete` |
| Uncertain issuance | `card_creating` → `card_reconciliation` → `card_ready` |

## Current behavior boundary

The Telegram card view exposes the card's last four digits, status, balance, and transaction history. It does not expose the full card number, expiry date, or CVV.
