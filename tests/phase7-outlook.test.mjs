import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../db/migrations/0006_outlook_graph_integration.sql", import.meta.url), "utf8");
const microsoftClient = await readFile(new URL("../server/providers/microsoft/client.ts", import.meta.url), "utf8");
const microsoftService = await readFile(new URL("../server/providers/microsoft/service.ts", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard-app.tsx", import.meta.url), "utf8");
const backgroundRoute = await readFile(new URL("../app/api/internal/jobs/outlook-sync/route.ts", import.meta.url), "utf8");
const envSchema = await readFile(new URL("../config/env-schema.mjs", import.meta.url), "utf8");

test("phase 7 stores one-time OAuth state and encrypted synchronization state", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS admin_oauth_states/);
  assert.match(migration, /encrypted_pkce_verifier/);
  assert.match(migration, /encrypted_sync_cursor/);
  assert.match(migration, /provider_identity_email/);
});

test("Microsoft OAuth requests delegated mail access plus offline refresh access", () => {
  assert.match(microsoftClient, /offline_access/);
  assert.match(microsoftClient, /Mail\.Read/);
  assert.match(microsoftClient, /User\.Read/);
  assert.match(microsoftClient, /code_challenge_method/);
  assert.match(microsoftClient, /S256/);
});

test("OAuth and delta state are encrypted and mailbox tokens never reach the browser", () => {
  assert.match(microsoftService, /encryptSecret\((?:token\.refresh_token|refreshToken)\)/);
  assert.match(microsoftService, /encryptSecret\(cursor\)/);
  assert.match(microsoftService, /decryptSecret\(connection\.encrypted_refresh_token\)/);
  assert.doesNotMatch(dashboard, /encrypted_refresh_token/);
});

test("Outlook synchronization stores message metadata and provider preview rather than arbitrary full bodies", () => {
  assert.match(microsoftClient, /bodyPreview/);
  assert.match(microsoftService, /INSERT INTO email_messages/);
  assert.match(microsoftService, /hasAttachments/);
  assert.doesNotMatch(microsoftService, /body_html_ref\s*=/);
});


test("Outlook OAuth binds the authorized Microsoft identity to the configured mailbox", () => {
  assert.match(microsoftService, /microsoft_mailbox_mismatch/);
  assert.match(microsoftService, /providerIdentityEmail !== configuredConnection\.email_address/);
});
test("revoked Microsoft authorization moves the connector to reauth_required", () => {
  assert.match(microsoftService, /connection_status = 'reauth_required'/);
  assert.match(microsoftService, /encrypted_refresh_token = NULL/);
});

test("deployment example exposes Microsoft app registration placeholders only", () => {
  assert.match(envExample, /MICROSOFT_OAUTH_CLIENT_ID=/);
  assert.match(envExample, /MICROSOFT_OAUTH_CLIENT_SECRET=/);
  assert.match(envExample, /MICROSOFT_OAUTH_TENANT=consumers/);
  assert.doesNotMatch(envExample, /[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/);
});

const authCookies = await readFile(new URL("../server/auth/cookies.ts", import.meta.url), "utf8");

test("admin session cookie is OAuth callback compatible while mutations still use CSRF", () => {
  assert.match(authCookies, /SESSION_COOKIE.*[\s\S]*SameSite=Lax/);
  assert.match(authCookies, /CSRF_COOKIE.*[\s\S]*SameSite=Strict/);
});

test("Phase 7 exposes a protected background Outlook sync hook", () => {
  assert.match(backgroundRoute, /Authorization|authorization/);
  assert.match(backgroundRoute, /timingSafeEqual/);
  assert.match(backgroundRoute, /OUTLOOK_SYNC_JOB_SECRET/);
  assert.match(microsoftService, /syncConnectedOutlookInboxesSystem/);
  assert.match(microsoftService, /job_runs/);
  assert.ok(microsoftService.includes("VALUES ('worker'"));
  assert.match(envSchema, /OUTLOOK_SYNC_JOB_SECRET/);
});


test("Outlook can fetch message body transiently for trusted OTP parsing without persistence", () => {
  assert.match(microsoftClient, /getMicrosoftMessageText/);
  assert.match(microsoftClient, /\$select.*body/);
  assert.doesNotMatch(microsoftService, /body_html_ref\s*=/);
});
