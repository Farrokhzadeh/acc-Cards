import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../db/migrations/0007_gmail_api_integration.sql", import.meta.url), "utf8");
const googleClient = await readFile(new URL("../server/providers/google/client.ts", import.meta.url), "utf8");
const googleService = await readFile(new URL("../server/providers/google/service.ts", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard-app.tsx", import.meta.url), "utf8");
const backgroundRoute = await readFile(new URL("../app/api/internal/jobs/gmail-sync/route.ts", import.meta.url), "utf8");
const envSchema = await readFile(new URL("../config/env-schema.mjs", import.meta.url), "utf8");


test("Phase 8 expands OAuth state storage to Gmail without adding another mailbox provider", () => {
  assert.match(migration, /provider IN \('outlook', 'gmail'\)/);
  assert.doesNotMatch(migration, /proton|atomic|yahoo/i);
});

test("Google OAuth uses readonly Gmail access, offline refresh access, and PKCE", () => {
  assert.match(googleClient, /gmail\.readonly/);
  assert.match(googleClient, /access_type/);
  assert.match(googleClient, /offline/);
  assert.match(googleClient, /code_challenge_method/);
  assert.match(googleClient, /S256/);
  assert.match(googleClient, /prompt/);
  assert.match(googleClient, /consent/);
});

test("Gmail refresh tokens and incremental synchronization cursors are encrypted at rest", () => {
  assert.match(googleService, /encryptSecret\((?:token\.refresh_token|refreshToken)\)/);
  assert.match(googleService, /encryptSecret\(args\.cursor\)/);
  assert.match(googleService, /decryptSecret\(connection\.encrypted_refresh_token\)/);
  assert.doesNotMatch(dashboard, /encrypted_refresh_token/);
});

test("Gmail binds the authorized identity to the configured @gmail.com mailbox", () => {
  assert.match(googleService, /google_mailbox_mismatch/);
  assert.match(googleService, /providerIdentityEmail !== configuredConnection\.email_address/);
  assert.match(googleClient, /users\/me\/profile/);
});

test("Gmail uses full inbox sync followed by history-based incremental sync with 404 rebuild", () => {
  assert.match(googleClient, /users\/me\/messages/);
  assert.match(googleClient, /users\/me\/history/);
  assert.match(googleClient, /startHistoryId/);
  assert.match(googleService, /collectFullInbox/);
  assert.match(googleService, /collectIncrementalInbox/);
  assert.match(googleService, /gmail_sync_cursor_expired/);
});

test("Gmail stores metadata/snippets and does not persist raw message bodies or mailbox passwords", () => {
  assert.match(googleClient, /format.*metadata/s);
  assert.match(googleService, /INSERT INTO email_messages/);
  assert.match(googleService, /message\.preview/);
  assert.doesNotMatch(googleService, /body_html_ref\s*=/);
  assert.doesNotMatch(googleService, /mailbox_password|gmail_password/i);
});

test("revoked Google authorization moves the Gmail connector to reauth_required", () => {
  assert.match(googleService, /connection_status = 'reauth_required'/);
  assert.match(googleService, /encrypted_refresh_token = NULL/);
  assert.match(googleClient, /google_reauth_required/);
});

test("dashboard exposes real Gmail connect, sync, and disconnect controls", () => {
  assert.match(dashboard, /connectGmailMailbox/);
  assert.match(dashboard, /syncGmailMailbox/);
  assert.match(dashboard, /disconnectGmailMailbox/);
  assert.match(dashboard, /Reconnect Gmail/);
  assert.doesNotMatch(dashboard, /Gmail OAuth is intentionally deferred to Phase 8/);
});

test("Phase 8 exposes a protected background Gmail sync hook", () => {
  assert.match(backgroundRoute, /Authorization|authorization/);
  assert.match(backgroundRoute, /timingSafeEqual/);
  assert.match(backgroundRoute, /GMAIL_SYNC_JOB_SECRET/);
  assert.match(googleService, /syncConnectedGmailInboxesSystem/);
  assert.match(googleService, /job_runs/);
  assert.ok(googleService.includes("VALUES ('worker'"));
  assert.match(envSchema, /GMAIL_SYNC_JOB_SECRET/);
});

test("deployment example exposes Google OAuth placeholders only", () => {
  assert.match(envExample, /GOOGLE_OAUTH_CLIENT_ID=/);
  assert.match(envExample, /GOOGLE_OAUTH_CLIENT_SECRET=/);
  assert.match(envExample, /GOOGLE_GMAIL_TIMEOUT_MS=10000/);
  assert.match(envExample, /GMAIL_SYNC_JOB_SECRET=/);
});


test("Gmail can fetch full message text transiently for trusted OTP parsing without persistence", () => {
  assert.match(googleClient, /getGmailMessageText/);
  assert.match(googleClient, /format.*full/s);
  assert.doesNotMatch(googleService, /body_html_ref\s*=/);
});


test("unconfigured Gmail fails manual connect clearly but scheduled sync is a no-op", () => {
  assert.match(googleService, /startGmailConnection[\s\S]*throw new ApiError\(503, "google_not_configured"/);
  assert.match(googleService, /syncConnectedGmailInboxesSystem[\s\S]*reason: "google_not_configured"/);
});
