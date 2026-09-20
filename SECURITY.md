# Security Policy

## Reporting

Report suspected vulnerabilities privately to the designated AccAbad security owner. Do not include production credentials, full PAN/CVV, OAuth tokens, Telegram tokens, or customer attachments in tickets or chat. Preserve a request ID and timestamp, redact sensitive fields, and use the approved secure evidence channel.

## Production rules

- Keep all provider-write deployment gates disabled until staging and security release gates are complete.
- Store deployment credentials only in the approved secret manager; never in source, images, backup manifests, analytics, or support conversations.
- Terminate current TLS at the trusted edge, strip inbound forwarding headers, and set `TRUST_PROXY_HOPS` to the exact controlled proxy depth.
- Rotate the 32-byte application encryption key only through a planned decrypt/re-encrypt migration; changing it in place makes existing ciphertext unreadable.
- Use a dedicated, least-privilege database account, encrypted database transport across hosts, encrypted backups, and restricted private-file mounts.
- Configure ClamAV and keep `RECEIPT_REQUIRE_ANTIVIRUS=true` in production.
- Run dependency and secret scanning for every release and after dependency/credential changes.
- Never log request bodies, provider payloads, authorization headers, card data, credentials, OTP values, or attachment contents.

## Supported branch

Security remediation applies to the current production release line. Older phase archives are historical artifacts and must not be deployed.
