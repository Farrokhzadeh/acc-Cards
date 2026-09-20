# Phase 22 — Security Hardening

Phase 22 adds enforceable application and deployment safeguards before staging acceptance and production use.

## Implemented controls

- Database-backed, per-minute API rate limits separated into reads, mutations, and Telegram webhook traffic. Only SHA-256 rate-limit keys are stored.
- Request-body limits at the API boundary and an independent 1 MB Telegram webhook limit.
- Configurable trusted-proxy depth. Forwarding headers are ignored unless the deployment explicitly trusts a known number of proxy hops.
- Absolute and idle admin-session expiry, high-priority secure cookies, origin-bound CSRF validation, and mandatory MFA for privileged operations by default.
- Timing-safe Telegram webhook secret verification, JSON-only webhook input, deduplication, size checks, and throttling.
- Strict private-upload signatures and structural checks, declared/content MIME agreement, rejection of active PDF constructs, randomized private object names, mode `0600`, path containment, hashing, and fail-closed production ClamAV scanning.
- Centralized error-text redaction for tokens, secrets, passwords, card-like data, and email addresses in worker/database logs.
- Browser and API hardening headers, including CSP, HSTS in production, frame denial, MIME sniffing denial, a restrictive permissions policy, and no-store API responses.
- Production validation requires HTTPS and a configured fail-closed malware scanner.
- Container processes use read-only filesystems where applicable, no-new-privileges, dropped Linux capabilities for application/tool containers, PID ceilings, and no-exec temporary filesystems.
- Existing AES-256-GCM secret encryption and the provider-ID/last4-only card persistence model were reviewed and retained. Live PAN/CVV responses remain explicit, audited, recently reauthenticated, MFA-gated, and non-cacheable.

## Review status

| Area | Phase 22 result |
|---|---|
| RBAC / IDOR | Existing permission checks and ownership joins retained; privileged actions now also require MFA and recent reauthentication. External authorization testing remains in the pentest scope. |
| Sessions / CSRF | Idle expiry, absolute expiry, hardened cookies, double-submit token, and exact-origin validation implemented. |
| API / webhook abuse | Database-backed throttling, size limits, verified Telegram secret, JSON-only input, and deduplication implemented. |
| Uploads | Structural validation, active-PDF rejection, private storage, hashing, and mandatory production antivirus implemented. |
| Logs / card data | Shared redaction added; PAN/CVV is not persisted and sensitive responses are no-store. |
| TLS / headers / CSP | HTTPS is mandatory in production; HSTS and a restrictive CSP/security-header set are configured. |
| Dependency / secret scans | Reproducible commands are configured but were not executed in this pass. |
| Penetration test | External engagement is pending and remains a production release gate. |

## Required release gates

Phase 22 code implementation does **not** by itself authorize production use. Before real customers or funds:

1. run `npm run security:dependencies` and resolve every high/critical finding;
2. install Gitleaks and run `npm run security:secrets`, then rotate any exposed credential;
3. complete the external test defined in `PENETRATION-TEST-SCOPE.md` and resolve every high/critical finding;
4. verify the reverse proxy strips inbound forwarding headers, sets the expected chain, redirects HTTP to HTTPS, and uses current TLS policy;
5. verify CSP behavior in staging and remove any unnecessary inline allowances when the runtime supports nonces;
6. record application-owner acceptance of residual medium/low findings.

The Phase 22 exit criterion “no high-severity issue remains open” remains pending until the scans and external penetration test finish.
