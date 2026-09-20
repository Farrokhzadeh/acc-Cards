# External Penetration Test Scope — Pending

Status: **required before production; not yet performed**.

## In scope

- production-equivalent admin web application and every `/api` route;
- all admin roles, permission boundaries, object identifiers, account/client ownership transitions, and horizontal/vertical authorization;
- password, TOTP MFA, enrollment/disable flows, reauthentication, sessions, logout, fixation, replay, idle expiry, and concurrent sessions;
- CSRF, CORS/origin handling, clickjacking, CSP, cache behavior, proxy-header trust, request smuggling assumptions, and TLS configuration;
- Telegram webhook authentication, replay/deduplication, callbacks, file retrieval, authorization changes, and rate-limit bypass attempts;
- Outlook and Gmail OAuth state, callback, token storage, disconnect, and revoked-authorization flows;
- receipt/support uploads and downloads, polyglots, malformed files, active PDFs, malware-scanner failure, path traversal, MIME confusion, decompression/resource exhaustion, and cross-user access;
- card reveal, issuance, funding, freeze/unfreeze, reconciliation, runtime controls, kill switches, read-only bypass, and provider-error ambiguity;
- injection classes, SSRF, stored/reflected DOM injection, sensitive-data exposure, log leakage, mass assignment, concurrency, and business-logic abuse;
- container/reverse-proxy exposure and production environment/configuration review.

## Rules and evidence

- Use staging with test accounts and non-real card/payment data.
- Do not perform destructive denial-of-service testing without a separately approved window.
- Record timestamps, role/account used, request/response evidence with secrets redacted, impact, reproducibility, and remediation guidance.
- Treat any path to PAN/CVV, provider credentials, OAuth tokens, admin takeover, unauthorized money-changing action, or kill-switch bypass as critical/high according to impact.

## Acceptance

- Critical/high findings must be fixed and independently retested.
- Medium findings need remediation or written risk acceptance with an owner and deadline.
- The final report and retest letter must be retained with the release evidence.
- Production rollout remains blocked until the application owner and security reviewer sign off.
