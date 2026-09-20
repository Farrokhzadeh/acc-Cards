# AccAbad Admin — Phase 8 Implementation

Status: implemented in source  
Milestone: Gmail API + Google OAuth 2.0

## Scope

Phase 8 adds Gmail as the second and final mailbox provider for the first production release. Outlook/Hotmail from Phase 7 remains unchanged.

Supported providers are intentionally limited to:

- Outlook / Hotmail — Microsoft Graph
- Gmail — Gmail API

No mailbox password is stored or used for routine Gmail API access.

## Google OAuth flow

AccAbad uses a server-side authorization-code flow with:

- OAuth state bound to the current administrator and admin session
- one-time state consumption
- 10-minute state expiry
- PKCE S256
- `access_type=offline`
- `prompt=consent`
- Gmail read-only scope
- encrypted refresh-token storage

Callback:

```text
${APP_BASE_URL}/api/v1/email/gmail/callback
```

Required Google Cloud configuration:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_GMAIL_TIMEOUT_MS=10000
```

The Gmail API must be enabled for the Google Cloud project and the callback URL must be registered as an authorized redirect URI for the Web OAuth client.

AccAbad requests:

```text
https://www.googleapis.com/auth/gmail.readonly
```

This is a restricted Gmail scope. A production/public Google OAuth application can require Google's OAuth verification process. Deployment owners must complete any Google-required verification before relying on the connector for external users.

## Mailbox identity binding

After OAuth completes, AccAbad calls Gmail `users.me.profile` and verifies `emailAddress` against the mailbox configured for the AccAbad/Kripicard account.

For example, if the account is configured as:

```text
example@gmail.com
```

an administrator cannot authorize a different Gmail identity and attach it accidentally.

## Inbox synchronization

### Initial synchronization

When no Gmail history cursor exists:

1. fetch Gmail profile and current `historyId`
2. list Inbox message IDs
3. fetch each selected message using `messages.get?format=metadata`
4. persist safe metadata/snippet only
5. store the history cursor encrypted

The implementation bounds the initial fetch to four 50-message pages per run. The UI reports when the result is partial.

### Incremental synchronization

Subsequent synchronization uses:

```text
users.me.history.list
```

with the previous Gmail `historyId`.

AccAbad tracks message additions, deletions and relevant label changes, refreshes affected message metadata, and advances the encrypted history cursor.

Gmail history IDs expire. If Google returns HTTP 404 for an old `startHistoryId`, AccAbad automatically falls back to a bounded full Inbox synchronization and rebuilds its cursor.

## Stored email data

Phase 8 stores only normalized/safe Inbox material needed for the admin list:

- Gmail message ID
- sender
- recipient
- subject
- Gmail snippet/preview
- received timestamp
- unread state
- provider identity metadata such as thread/history/message-id references
- attachment-presence hint when visible in returned metadata

Phase 8 does **not** persist arbitrary raw MIME bodies, full HTML bodies, attachments, mailbox passwords, access tokens, or refresh tokens in plaintext.

Attachment download/storage and OTP classification are intentionally deferred to Phase 9.

## Refresh tokens and revocation

Refresh tokens are encrypted using the existing Phase 4 envelope-encryption service.

If refresh authorization is revoked or becomes invalid:

```text
connection_status = reauth_required
```

and token/cursor material is cleared. The admin UI then presents **Reconnect Gmail**.

## Admin API

Added endpoints:

```text
POST /api/v1/accounts/:id/email/gmail/connect
GET  /api/v1/email/gmail/callback
POST /api/v1/accounts/:id/email/gmail/sync
POST /api/v1/accounts/:id/email/gmail/disconnect
```

Connect/disconnect require `inbox.manage`; sync requires `inbox.read`. Mutations retain the existing admin-session and CSRF protections. Disconnect additionally requires recent admin reauthentication.

## Background synchronization

Added:

```text
POST /api/internal/jobs/gmail-sync
```

Authorization:

```text
Authorization: Bearer <GMAIL_SYNC_JOB_SECRET>
```

Generate a scheduler secret with:

```bash
openssl rand -hex 32
```

The worker hook:

- selects connected Gmail mailboxes
- isolates individual mailbox failures
- writes a `job_runs` record
- writes a redacted worker audit event
- never returns OAuth tokens

## Database migration

Migration:

```text
0007_gmail_api_integration.sql
```

The existing OAuth-state table is expanded from Outlook-only to:

```text
outlook | gmail
```

No new third-party mailbox provider is introduced.

## UI

Gmail account cards now support:

- Connect Gmail
- Reconnect Gmail
- Sync Inbox
- Disconnect
- last-sync status
- connection/revocation/error status
- real stored Inbox messages

The previous Phase 7 "Gmail deferred" message has been removed.

## Security boundaries

- Google client secret stays in deployment secrets/environment only.
- Gmail refresh tokens are encrypted at rest.
- Gmail history cursors are encrypted at rest.
- OAuth state is one-time, expiring, admin/session-bound and PKCE-protected.
- The connected Google identity must exactly match the configured Gmail mailbox.
- Full mailbox content and attachments are not exposed to Telegram.
- Phase 8 does not classify or relay OTP/3DS codes; that remains Phase 9.

## Manual test plan

1. Run migrations through `0007`.
2. Configure Google Cloud OAuth credentials and enable the Gmail API.
3. Register `${APP_BASE_URL}/api/v1/email/gmail/callback`.
4. Create/update an AccAbad account with provider `gmail` and an `@gmail.com` mailbox.
5. Click **Connect Gmail**.
6. Authorize the exact configured Gmail account.
7. Verify AccAbad returns to the account page as connected.
8. Click **Sync Inbox** and confirm recent Gmail metadata appears.
9. Run a second sync and verify it uses incremental history state.
10. Disconnect after recent admin reauthentication.
11. Reconnect and repeat.
12. Configure `GMAIL_SYNC_JOB_SECRET` and call the internal sync endpoint from a scheduler.
13. Revoke the Google grant externally and confirm a later sync changes the connection to `reauth_required`.

## Known limitations / next work

Phase 8 intentionally does not implement:

- Gmail Pub/Sub push notifications
- raw MIME retention
- attachment download/storage
- attachment malware scanning
- trusted sender/template classification
- OTP extraction
- OTP expiry/redaction
- Telegram OTP delivery

Those security-sensitive message-processing behaviors belong to Phase 9.
