# Phase 9 — Email Classification and Secure OTP / 3DS Handling

## Status
Implemented in the Phase 9 source baseline.

## Scope
Phase 9 sits on top of the real Outlook/Hotmail and Gmail connectors from Phases 7–8. It does **not** forward arbitrary mailbox content and does **not** send Telegram messages yet; Telegram delivery is Phase 10.

## Implemented

- Trusted sender/template allowlist table (`email_trusted_rules`).
- Exact sender or `@domain` matching plus optional subject substring matching.
- Fixed, versioned OTP parser. Admins cannot supply arbitrary regex patterns.
- Message states: pending, classified, quarantined, ignored.
- Classifications: normal, verification, security, otp_3ds, quarantined.
- OTP-like content from a sender/template that is not allowlisted is quarantined.
- Trusted OTP templates with no safely parsed code are quarantined.
- OTP values are encrypted with the application envelope key.
- OTP lifetime is configurable per trusted rule (1–60 minutes, default 10).
- Expired OTPs are redacted by clearing the encrypted value and marking the delivery expired.
- Card last-four matching is best-effort and never used as authorization.
- The current Telegram assignment is resolved at classification time.
- If no user is assigned, the OTP delivery remains quarantined.
- If a user is assigned, an outbox event `otp.ready_for_delivery` is created. The event contains IDs only — never the plaintext OTP.
- Admin OTP reveal requires `inbox.otp.reveal`, CSRF, and recent reauthentication and is audited.
- Trusted-rule creation requires `inbox.rules.manage` and is audited.
- Outlook and Gmail synchronization invoke classification immediately after successful message persistence.
- Protected `/api/internal/jobs/email-classify` hook classifies backlog messages and redacts expired OTPs.

## Important limitation
Phases 7–8 intentionally persist provider subject + snippet/preview instead of full raw email bodies. The Phase 9 parser therefore classifies/extracts from that safe synchronized content. If a provider places the OTP only in a body portion not present in its preview/snippet, AccAbad will not guess; the message remains quarantined or unclassified until a future trusted body-fetch/parser extension is implemented.

## Security invariants

1. Unknown senders/templates are never auto-forwarded.
2. Plaintext OTPs are never stored in logs, audit metadata, or outbox payloads.
3. Telegram delivery is not performed in this phase.
4. Full mailbox access remains admin-only.
5. Last-four card hints are contextual only; account ownership/assignment remains authoritative.
6. OTPs are short-lived and redacted after expiry.

## Deployment
Generate a worker secret:

```bash
openssl rand -hex 32
```

Configure:

```env
EMAIL_CLASSIFY_JOB_SECRET=<generated-secret>
```

Schedule:

```http
POST /api/internal/jobs/email-classify
Authorization: Bearer <EMAIL_CLASSIFY_JOB_SECRET>
```

A one-minute cadence is suitable once Telegram delivery is enabled; a slower cadence is acceptable while Phase 10 is not active because Outlook/Gmail sync already triggers classification inline.

## Trusted rules
No issuer-specific sender is seeded because the supplied Kripicard API documents do not identify the actual 3DS email sender/template. Add rules only after observing and validating real issuer messages in a test mailbox.

Examples of rule shape (examples only, not production issuer claims):

```json
{
  "label": "Issuer 3DS",
  "senderMatch": "security@example-issuer.com",
  "subjectContains": "verification",
  "category": "otp_3ds",
  "otpExpiryMinutes": 10
}
```

A domain rule can use `@example-issuer.com`.

## Phase 10 handoff
Phase 10 should consume only `otp.ready_for_delivery` outbox events, re-resolve the active account assignment immediately before sending, decrypt the OTP only at delivery time, avoid notification previews where practical, and mark `otp_deliveries.delivered_at` / `delivery_status` transactionally.
