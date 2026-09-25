import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { safeParseServerEnv } from "../../config/env-schema.mjs";

const envExample = await readFile(new URL("../../.env.example", import.meta.url), "utf8");
const setupScript = await readFile(new URL("../../setup.sh", import.meta.url), "utf8");
const deployGuide = await readFile(new URL("../../DOCKER-DEPLOY.md", import.meta.url), "utf8");

const encryption = { APP_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=" };

const database = {
  DATABASE_HOST: "postgres",
  DATABASE_PORT: "5432",
  DATABASE_NAME: "accabad",
  DATABASE_USER: "accabad",
  DATABASE_PASSWORD: "a-real-test-password",
  DATABASE_SSL_MODE: "disable",
};

const productionSecurity = {
  RECEIPT_CLAMAV_HOST: "clamav",
  RECEIPT_REQUIRE_ANTIVIRUS: "true",
};

test("accepts a safe production environment with live writes disabled", () => {
  const result = safeParseServerEnv({
    APP_ENV: "production",
    APP_BASE_URL: "https://admin.example.com",
    PORT: "3000",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    ...productionSecurity,
    ...database,
    ...encryption,
  });

  assert.equal(result.success, true);
  assert.equal(result.data.ENABLE_LIVE_PROVIDER_WRITES, false);
  assert.equal(result.data.DATABASE_NAME, "accabad");
});

test("rejects missing database configuration", () => {
  const result = safeParseServerEnv({
    APP_ENV: "staging",
    APP_BASE_URL: "https://staging.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
  });

  assert.equal(result.success, false);
});

test("rejects a placeholder database password in production", () => {
  const result = safeParseServerEnv({
    APP_ENV: "production",
    APP_BASE_URL: "https://admin.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    ...database,
    ...encryption,
    DATABASE_PASSWORD: "replace-this-password",
  });

  assert.equal(result.success, false);
});

test("rejects live provider writes without an explicit confirmation phrase", () => {
  const result = safeParseServerEnv({
    APP_ENV: "production",
    APP_BASE_URL: "https://admin.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "true",
    ...database,
    ...encryption,
  });

  assert.equal(result.success, false);
});

test("accepts live provider writes only with the explicit confirmation phrase", () => {
  const result = safeParseServerEnv({
    APP_ENV: "production",
    APP_BASE_URL: "https://admin.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "true",
    LIVE_PROVIDER_WRITE_CONFIRMATION: "ACCABAD_LIVE_WRITES_ENABLED",
    ...productionSecurity,
    ...database,
    ...encryption,
  });

  assert.equal(result.success, true);
});

test("rejects an invalid encryption key", () => {
  const result = safeParseServerEnv({
    APP_ENV: "staging",
    APP_BASE_URL: "https://staging.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    ...database,
    APP_ENCRYPTION_KEY: "not-a-32-byte-key",
  });
  assert.equal(result.success, false);
});


test("rejects card-state writes when the global provider-write kill switch is off", () => {
  const result = safeParseServerEnv({
    APP_ENV: "staging",
    APP_BASE_URL: "https://staging.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    ENABLE_KRIPICARD_CARD_STATE_WRITES: "true",
    ...database,
    ...encryption,
  });
  assert.equal(result.success, false);
});

test("accepts guarded card-state writes only when both write gates are enabled", () => {
  const result = safeParseServerEnv({
    APP_ENV: "staging",
    APP_BASE_URL: "https://staging.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "true",
    ENABLE_KRIPICARD_CARD_STATE_WRITES: "true",
    LIVE_PROVIDER_WRITE_CONFIRMATION: "ACCABAD_LIVE_WRITES_ENABLED",
    ...database,
    ...encryption,
  });
  assert.equal(result.success, true);
});

test("accepts Outlook integration when Microsoft client credentials are configured together", () => {
  const result = safeParseServerEnv({
    APP_ENV: "staging",
    APP_BASE_URL: "https://staging.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    MICROSOFT_OAUTH_CLIENT_ID: "client-id",
    MICROSOFT_OAUTH_CLIENT_SECRET: "client-secret",
    ...database,
    ...encryption,
  });
  assert.equal(result.success, true);
});

test("rejects a partial Microsoft OAuth configuration", () => {
  const result = safeParseServerEnv({
    APP_ENV: "staging",
    APP_BASE_URL: "https://staging.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    MICROSOFT_OAUTH_CLIENT_ID: "client-id",
    ...database,
    ...encryption,
  });
  assert.equal(result.success, false);
});

test("accepts Gmail integration when Google client credentials are configured together", () => {
  const result = safeParseServerEnv({
    APP_ENV: "staging",
    APP_BASE_URL: "https://staging.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
    ...database,
    ...encryption,
  });
  assert.equal(result.success, true);
});

test("rejects a partial Google OAuth configuration", () => {
  const result = safeParseServerEnv({
    APP_ENV: "staging",
    APP_BASE_URL: "https://staging.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
    ...database,
    ...encryption,
  });
  assert.equal(result.success, false);
});

test("deployment templates expose the required live-write acknowledgment", () => {
  assert.match(envExample, /^LIVE_PROVIDER_WRITE_CONFIRMATION=$/m);
  assert.match(setupScript, /^LIVE_PROVIDER_WRITE_CONFIRMATION=$/m);
  assert.match(deployGuide, /LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED/);
  assert.match(deployGuide, /502 immediately after enabling provider writes/);
});

test("production rollout uses the AccAbad authorization token and keeps legacy upgrade compatibility", () => {
  const current = safeParseServerEnv({
    APP_ENV: "production",
    APP_BASE_URL: "https://admin.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    PRODUCTION_ROLLOUT_BLOCKED: "false",
    PRODUCTION_ROLLOUT_AUTHORIZATION: "ACCABAD_PRODUCTION_RELEASE_AUTHORIZED",
    ...productionSecurity,
    ...database,
    ...encryption,
  });
  const legacy = safeParseServerEnv({
    APP_ENV: "production",
    APP_BASE_URL: "https://admin.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    PRODUCTION_ROLLOUT_BLOCKED: "false",
    PRODUCTION_ROLLOUT_AUTHORIZATION: "PHASE24_RELEASE_AUTHORIZED",
    ...productionSecurity,
    ...database,
    ...encryption,
  });
  const invalid = safeParseServerEnv({
    APP_ENV: "production",
    APP_BASE_URL: "https://admin.example.com",
    ENABLE_LIVE_PROVIDER_WRITES: "false",
    PRODUCTION_ROLLOUT_BLOCKED: "false",
    PRODUCTION_ROLLOUT_AUTHORIZATION: "not-authorized",
    ...productionSecurity,
    ...database,
    ...encryption,
  });

  assert.equal(current.success, true);
  assert.equal(legacy.success, true);
  assert.equal(invalid.success, false);
  assert.match(deployGuide, /PRODUCTION_ROLLOUT_AUTHORIZATION=ACCABAD_PRODUCTION_RELEASE_AUTHORIZED/);
});

test("active deployment templates do not carry phase-specific app version markers", () => {
  assert.doesNotMatch(envExample, /^APP_VERSION=/m);
  assert.doesNotMatch(setupScript, /^APP_VERSION=/m);
});

test("easy setup exposes optional mailbox OAuth credentials and the deploy guide explains per-account connections", () => {
  assert.match(setupScript, /^MICROSOFT_OAUTH_CLIENT_ID=$/m);
  assert.match(setupScript, /^MICROSOFT_OAUTH_CLIENT_SECRET=$/m);
  assert.match(setupScript, /^GOOGLE_OAUTH_CLIENT_ID=$/m);
  assert.match(setupScript, /^GOOGLE_OAUTH_CLIENT_SECRET=$/m);
  assert.match(deployGuide, /one OAuth application per provider for the whole installation/);
  assert.match(deployGuide, /\/api\/v1\/email\/outlook\/callback/);
  assert.match(deployGuide, /\/api\/v1\/email\/gmail\/callback/);
  assert.match(deployGuide, /stores its own encrypted refresh token/);
});

test("deployment guide documents the five minute customer funding receipt window and provider funding step", () => {
  assert.match(deployGuide, /customer has 5 minutes to upload the payment receipt/);
  assert.match(deployGuide, /Click Fund card/);
  assert.match(deployGuide, /single-attempt \(no auto-retry\)/);
  assert.match(deployGuide, /reconciliation/);
});
