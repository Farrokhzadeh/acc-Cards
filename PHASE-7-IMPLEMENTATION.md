# AccAbad Admin — Phase 7 Implementation

Status: implemented in source; live OAuth requires a Microsoft app registration and a real Outlook/Hotmail mailbox.

## Goal

Connect AccAbad accounts to consumer Outlook/Hotmail mailboxes through Microsoft Graph using delegated OAuth 2.0, without storing mailbox passwords for inbox access.

## Microsoft integration model

AccAbad uses the authorization-code flow with PKCE and a server-side client secret.

Requested delegated scopes:

- `openid`
- `profile`
- `email`
- `offline_access`
- `User.Read`
- `Mail.Read`

The deployment defaults to the Microsoft `consumers` authority so the connector is for personal Microsoft accounts.

For safety, the Microsoft identity returned by Graph must exactly match the `@outlook.com` or `@hotmail.com` address configured on the AccAbad account. Authorizing a different Microsoft mailbox is rejected and no token is stored.

## Required Microsoft app registration

Create one Microsoft Entra application that supports personal Microsoft accounts and configure a **Web** redirect URI matching:

```text
https://YOUR-ACCABAD-DOMAIN/api/v1/email/outlook/callback
```

For local staging, use the exact local/staging `APP_BASE_URL` equivalent.

Set:

```env
MICROSOFT_OAUTH_CLIENT_ID=...
MICROSOFT_OAUTH_CLIENT_SECRET=...
MICROSOFT_OAUTH_TENANT=consumers
MICROSOFT_GRAPH_TIMEOUT_MS=10000
```

The client secret is a deployment secret. It must never be stored in PostgreSQL or exposed to the browser.

## OAuth security

Phase 7 adds `admin_oauth_states`.

Each connection attempt uses:

- cryptographically random `state`
- SHA-256 state hash in PostgreSQL
- PKCE S256 challenge
- encrypted PKCE verifier
- current admin ID and current admin session ID binding
- 10-minute expiry
- one-time atomic consumption

The admin session cookie is `SameSite=Lax` so Microsoft can redirect back to the OAuth callback on a top-level GET. All application mutations still require the separate CSRF cookie/header check.

## Token storage

AccAbad stores only the Microsoft refresh token persistently and encrypts it with the existing AES-256-GCM secret service.

It does not persist Microsoft access tokens during normal operation.

Also encrypted:

- Graph delta/next synchronization cursor
- PKCE verifier while an OAuth attempt is pending

The browser never receives refresh tokens, access tokens, sync tokens, or the Microsoft client secret.

## Connection lifecycle

Admin account detail now supports:

- Connect Outlook
- Reconnect Outlook after revoked/expired authorization
- Sync inbox
- Disconnect Outlook

Disconnect requires recent AccAbad admin reauthentication.

If Microsoft returns an invalid/revoked grant, the connection transitions to:

```text
reauth_required
```

and the stored refresh token is removed.

## Inbox synchronization

Synchronization uses Microsoft Graph Inbox delta queries.

AccAbad stores normalized safe message metadata only:

- provider message ID
- sender
- recipient
- subject
- body preview
- received timestamp
- unread state
- attachment-present flag
- Internet Message-ID when supplied

Full message bodies and attachments are intentionally not persisted in Phase 7. Later email/OTP phases can add a retention/storage policy before that data is stored.

The Graph delta cursor is encrypted at rest so subsequent syncs are incremental.

If a Graph delta cursor expires, AccAbad rebuilds the Inbox delta state from a fresh cursor instead of requiring an administrator to reconnect the mailbox.

Provider-deleted messages are not physically deleted from AccAbad history; they are marked as removed in safe metadata.

## API routes

- `POST /api/v1/accounts/:id/email/outlook/connect`
- `GET /api/v1/email/outlook/callback`
- `POST /api/v1/accounts/:id/email/outlook/sync`
- `POST /api/v1/accounts/:id/email/outlook/disconnect`
- `GET /api/v1/accounts/:id/email/messages`

Permissions:

- connection/disconnection: `inbox.manage`
- synchronization/read: `inbox.read`

Operators receive ordinary inbox management permissions; finance reviewers do not.

## Mailbox-provider policy

The v1 account form remains limited to:

- `@outlook.com`
- `@hotmail.com`
- `@gmail.com`

Gmail records can be stored, but Gmail OAuth is still deferred to Phase 8.

Changing the configured mailbox/provider invalidates its OAuth connection. Editing unrelated account fields no longer accidentally disconnects an existing Outlook mailbox.

## Database migration

`db/migrations/0006_outlook_graph_integration.sql`

Adds:

- Microsoft provider identity metadata
- encrypted synchronization cursor
- OAuth scopes
- sync-attempt timestamps
- connection timestamp
- one-time admin OAuth state table
- `inbox.manage` permission

## Audit events

Phase 7 records:

- `email.outlook.connect_started`
- `email.outlook.connected`
- `email.outlook.sync`
- `email.outlook.disconnected`

No access token, refresh token, authorization code, PKCE verifier, or raw email body is placed in audit metadata.

## Background synchronization hook

Phase 7 includes a narrow cron-safe background synchronization endpoint:

```text
POST /api/internal/jobs/outlook-sync
Authorization: Bearer <OUTLOOK_SYNC_JOB_SECRET>
```

Configure the secret with a high-entropy value (minimum 32 characters):

```bash
openssl rand -hex 32
```

```env
OUTLOOK_SYNC_JOB_SECRET=...
```

Each invocation:

- selects up to 100 connected Outlook mailboxes, oldest-sync-attempt first
- runs the same incremental Graph delta synchronization used by manual sync
- isolates failures so one revoked/broken mailbox does not stop all other mailboxes
- records a `job_runs` entry
- records a worker audit event
- returns only safe counts/internal references, never tokens or mailbox contents

This hook can be called by systemd timer, cron, a platform scheduler, or the later general-purpose worker system. The broader job queue remains Phase 19.

## Not implemented in Phase 7

- Gmail OAuth (Phase 8)
- OTP/3DS classification and forwarding (Phase 9)
- full email-body retention
- attachment download/storage/scanning
- Microsoft Graph change-notification webhooks
- generic queue/worker scheduling (the narrow Outlook cron hook is implemented)

## Manual staging validation

1. Configure the Microsoft app registration and environment variables.
2. Log into AccAbad as an administrator with `inbox.manage`.
3. Open an account configured with an `@outlook.com` or `@hotmail.com` mailbox.
4. Click **Connect Outlook**.
5. Complete Microsoft consent using the intended mailbox.
6. Confirm AccAbad returns to the account and shows `connected`.
7. Click **Sync inbox**.
8. Confirm recent Inbox message metadata appears in the account Inbox tab.
9. Confirm PostgreSQL contains encrypted refresh/cursor values rather than plaintext tokens.
10. Revoke the app's Microsoft permission and sync again; confirm the state becomes `reauth_required`.
11. Reconnect and confirm synchronization resumes.
12. Reauthenticate the AccAbad admin and test **Disconnect**.
13. Configure `OUTLOOK_SYNC_JOB_SECRET`, call the internal sync endpoint with its Bearer token, and confirm a `job_runs` row plus worker audit event is created.
