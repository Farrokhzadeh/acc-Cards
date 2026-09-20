import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSafeStagingTarget, loadAcceptanceConfig } from "../scripts/acceptance/safety.mjs";

const REQUIRED_STEPS = [
  "admin_login", "add_kripicard_test_account", "test_provider_connection", "sync_test_cards",
  "connect_test_mailbox", "read_test_inbox", "start_test_telegram_bot", "register_test_telegram_user",
  "assign_account", "view_assigned_cards", "freeze_unfreeze", "card_request", "funding_request",
  "receipt_review", "sandbox_create_fund", "transaction_sync_notification", "otp_parse_delivery",
  "duplicate_replay_protection",
];

function splitSetCookie(value) {
  return value ? value.split(/,(?=\s*[^;,=]+=[^;,]+)/g) : [];
}

function absorbCookies(jar, response) {
  const headers = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : splitSetCookie(response.headers.get("set-cookie"));
  for (const header of headers) {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(jar) {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(baseUrl, pathname, init = {}, jar = new Map()) {
  const headers = new Headers(init.headers);
  if (jar.size) headers.set("cookie", cookieHeader(jar));
  const response = await fetch(new URL(pathname, baseUrl), { ...init, headers, redirect: "manual" });
  absorbCookies(jar, response);
  return response;
}

test("staging health, readiness, and unauthenticated boundary", async () => {
  const { config } = await loadAcceptanceConfig();
  const target = assertSafeStagingTarget(config);
  const health = await request(target, "/health");
  assert.equal(health.status, 200);
  const ready = await request(target, "/ready");
  assert.equal(ready.status, 200);
  const protectedResponse = await request(target, "/api/v1/accounts");
  assert.equal(protectedResponse.status, 401);
  assert.equal(protectedResponse.headers.get("cache-control")?.includes("no-store"), true);
  assert.equal(protectedResponse.headers.get("x-content-type-options"), "nosniff");
});

test("admin login, MFA when enabled, cookies, and authenticated API", async () => {
  const { config } = await loadAcceptanceConfig();
  const target = assertSafeStagingTarget(config);
  const jar = new Map();
  const login = await request(target, "/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: target.origin },
    body: JSON.stringify({ email: process.env.ACCEPTANCE_ADMIN_EMAIL, password: process.env.ACCEPTANCE_ADMIN_PASSWORD }),
  }, jar);
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  if (loginBody.data?.mfaRequired) {
    assert.match(process.env.ACCEPTANCE_ADMIN_TOTP ?? "", /^\d{6}$/, "Set ACCEPTANCE_ADMIN_TOTP for MFA-enabled staging login.");
    const mfa = await request(target, "/api/v1/auth/mfa", {
      method: "POST",
      headers: { "content-type": "application/json", origin: target.origin },
      body: JSON.stringify({ code: process.env.ACCEPTANCE_ADMIN_TOTP }),
    }, jar);
    assert.equal(mfa.status, 200);
  }
  assert.ok(jar.get("accabad_session"));
  assert.ok(jar.get("accabad_csrf"));
  const me = await request(target, "/api/v1/auth/me", {}, jar);
  assert.equal(me.status, 200);
  const accounts = await request(target, "/api/v1/accounts?limit=10", {}, jar);
  assert.equal(accounts.status, 200);
});

test("complete live workflow evidence satisfies the Phase 23 release gate", async () => {
  const evidencePath = process.env.ACCEPTANCE_LIVE_EVIDENCE_FILE;
  assert.ok(evidencePath, "Set ACCEPTANCE_LIVE_EVIDENCE_FILE after executing the staging workflow.");
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const { config } = await loadAcceptanceConfig();
  const target = assertSafeStagingTarget(config);
  assert.equal(evidence.targetOrigin, target.origin);
  assert.equal(evidence.noManualDatabaseModification, true);
  assert.equal(evidence.duplicateSafetyConfirmed, true);
  assert.ok(evidence.executedAt);
  assert.ok(evidence.operator);
  const byId = new Map((evidence.steps ?? []).map((step) => [step.id, step]));
  for (const id of REQUIRED_STEPS) {
    const step = byId.get(id);
    assert.ok(step, `Missing acceptance step: ${id}`);
    assert.equal(step.status, "passed", `${id} has not passed.`);
    assert.ok(step.evidence, `${id} requires a redacted evidence reference.`);
  }
});
