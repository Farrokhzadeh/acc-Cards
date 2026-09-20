import assert from "node:assert/strict";
import test from "node:test";
import { safeParseServerEnv } from "../config/env-schema.mjs";

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
