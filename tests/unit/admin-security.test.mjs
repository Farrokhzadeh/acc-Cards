import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0003_admin_security.sql", import.meta.url), "utf8");
const authService = await readFile(new URL("../../server/auth/service.ts", import.meta.url), "utf8");
const accountService = await readFile(new URL("../../server/accounts/service.ts", import.meta.url), "utf8");
const envExample = await readFile(new URL("../../.env.example", import.meta.url), "utf8");

test("phase 4 adds server-side admin session and MFA structures", () => {
  assert.match(migration, /admin_auth_challenges/);
  assert.match(migration, /admin_login_attempts/);
  assert.match(migration, /csrf_token_hash/);
  assert.match(migration, /mfa_secret_encrypted/);
});

test("audit log becomes append-only", () => {
  assert.match(migration, /BEFORE UPDATE OR DELETE ON audit_logs/);
  assert.match(migration, /audit_logs is append-only/);
});

test("authenticated routes use RBAC and CSRF helpers", () => {
  assert.match(authService, /requireAdmin/);
  assert.match(authService, /requireCsrf/);
  assert.match(authService, /requireRecentReauthentication/);
  assert.match(authService, /ADMIN_LOGIN_RATE_MAX_FAILURES/);
});

test("account credentials are envelope encrypted and reveal is audited", () => {
  assert.match(accountService, /encryptSecret\(input\.password\)/);
  assert.match(accountService, /encryptSecret\(input\.apiKey\)/);
  assert.match(accountService, /account\.secrets\.reveal/);
  assert.match(accountService, /decryptSecret/);
});

test("phase 4 requires a dedicated encryption key", () => {
  assert.match(envExample, /APP_ENCRYPTION_KEY=/);
  assert.doesNotMatch(envExample, /ENABLE_PHASE3_UNAUTHENTICATED_READ_API/);
});
