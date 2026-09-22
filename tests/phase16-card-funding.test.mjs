import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../db/migrations/0015_card_funding.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../server/providers/kripicard/client.ts", import.meta.url), "utf8");
const schemas = await readFile(new URL("../server/providers/kripicard/schemas.ts", import.meta.url), "utf8");
const execution = await readFile(new URL("../server/funding/execution.ts", import.meta.url), "utf8");
const fundRoute = await readFile(new URL("../app/api/v1/funding-requests/[id]/fund/route.ts", import.meta.url), "utf8");
const reconcileRoute = await readFile(new URL("../app/api/v1/funding-requests/[id]/reconcile/route.ts", import.meta.url), "utf8");
const resolveRoute = await readFile(new URL("../app/api/v1/funding-requests/[id]/resolve/route.ts", import.meta.url), "utf8");
const env = await readFile(new URL("../config/env-schema.mjs", import.meta.url), "utf8");
const readiness = await readFile(new URL("../server/providers/kripicard/readiness.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard-app.tsx", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../lib/admin-api.ts", import.meta.url), "utf8");
const success = JSON.parse(await readFile(new URL("./fixtures/kripicard/fund-card.json", import.meta.url), "utf8"));

test("Phase 16 adds funding operation state, locking, and execution permission", () => {
  assert.match(migration, /needs_reconciliation/);
  assert.match(migration, /card_fund_active_request_uq/);
  assert.match(migration, /card_fund_active_card_uq/);
  assert.match(migration, /operation_type = 'fund'/);
  assert.match(migration, /funding\.execute/);
  assert.match(migration, /last_fund_operation_id/);
});

test("fundcard schema matches the documented response", () => {
  assert.equal(success.success, true);
  assert.equal(success.data.card_id, "MR_A1B2C3D4E5F6G7H8");
  assert.equal(success.data.amount, 50);
  assert.equal(success.data.fee, 3);
  assert.equal(success.data.total_debited, 53);
  assert.match(schemas, /kripicardFundCardResponseSchema/);
  assert.match(schemas, /total_debited/);
});

test("provider client exposes one-shot fundCard and still does not expose deposit creation", () => {
  assert.match(client, /fundCard\(input:/);
  assert.match(client, /\/api\/external\/cards\/fundcard/);
  assert.match(client, /return this\.write/);
  assert.doesNotMatch(client, /createDeposit\s*\(/);
});

test("funding execution is feature gated and requires operation-specific readiness", () => {
  assert.match(execution, /ENABLE_KRIPICARD_CARD_FUNDING/);
  assert.match(execution, /assertProviderMoneyReadiness\("card_fund"\)/);
  assert.match(execution, /telegram_account_assignments/);
  assert.match(execution, /receipt_not_clean/);
  assert.match(execution, /pg_advisory_xact_lock/);
});

test("fundcard is called exactly once per execution attempt and uncertain results are never automatically retried", () => {
  assert.equal((execution.match(/client\.fundCard\(/g) ?? []).length, 1);
  assert.match(execution, /will not send fundcard again/i);
  assert.match(execution, /needs_reconciliation/);
  assert.match(execution, /safeToRetry: false/);
  assert.match(execution, /persistence_error_after_provider_write/);
  assert.match(execution, /stale_pending_recovery/);
  assert.match(execution, /funding_still_in_progress/);
});

test("preflight and reconciliation use only safe read endpoints", () => {
  assert.match(execution, /captureProviderEvidence/);
  assert.match(execution, /client\.cardDetails/);
  assert.match(execution, /client\.transactions/);
  assert.match(execution, /preBalanceUsdCents/);
  assert.match(execution, /preNonZeroTransactionFingerprints/);
  assert.match(execution, /reconciliation_evidence_collected/);
});

test("manual uncertain-outcome resolution requires an explicit provider reference", () => {
  assert.match(execution, /providerReference\.trim/);
  assert.match(execution, /provider_reference_required/);
  assert.match(execution, /confirmed_not_funded/);
  assert.match(resolveRoute, /requireRecentReauthentication/);
  assert.match(resolveRoute, /providerReference/);
});

test("funding routes require RBAC and CSRF, with recent reauthentication for writes and manual resolution", () => {
  assert.match(fundRoute, /funding\.execute/);
  assert.match(fundRoute, /requireCsrf/);
  assert.match(fundRoute, /requireRecentReauthentication/);
  assert.match(reconcileRoute, /funding\.execute/);
  assert.match(reconcileRoute, /requireCsrf/);
  assert.match(resolveRoute, /funding\.execute/);
  assert.match(resolveRoute, /requireRecentReauthentication/);
});


test("reconciliation remains resolvable after assignment changes and final resolution is race protected", () => {
  assert.match(execution, /Do not require the original Telegram assignment to still exist here/);
  assert.match(execution, /FOR UPDATE OF fr,co/);
  assert.match(execution, /already been resolved/);
  assert.match(execution, /funding_request\.reconciliation_resolved_completed/);
});

test("deployment has a dedicated card-funding kill switch", () => {
  assert.match(env, /ENABLE_KRIPICARD_CARD_FUNDING/);
  assert.match(env, /Kripicard card funding requires ENABLE_LIVE_PROVIDER_WRITES=true/);
});

test("card-fund readiness now uses documented rate, fee, and purchase-202 contracts", () => {
  assert.match(readiness, /card_fund: \["wallet_flow", "card_minimum_documented", "production_rate_limits", "production_fee_schedule", "purchase_202_contract"\]/);
  assert.match(migration, /production_fee_schedule/);
  assert.match(migration, /fundcard_idempotency/);
  assert.match(migration, /never auto-retry HTTP 202/);
});

test("admin UI exposes Fund, safe retry, reconciliation, and provider-confirmed resolution", () => {
  assert.match(dashboard, /"Fund card"/);
  assert.match(dashboard, /Retry safe failure/);
  assert.match(dashboard, /Recheck provider state/);
  assert.match(dashboard, /Provider confirms not funded/);
  assert.match(dashboard, /Provider confirms funded/);
  assert.match(dashboard, /Recheck if stuck/);
});

test("funding privileged writes recover from stale admin sessions instead of surfacing raw reauth errors", () => {
  assert.match(dashboard, /queueFundingReauthentication/);
  assert.match(dashboard, /Confirm live card funding/);
  assert.match(dashboard, /Confirm funding reconciliation/);
  assert.match(dashboard, /reauthentication_required/);
  assert.match(dashboard, /Reauthenticate & continue/);
  assert.match(dashboard, /reauthenticateAdmin\(fundingReauthPassword/);
  assert.match(dashboard, /allowReauthPrompt: false/);
});

test("admin API preserves structured backend error details for readiness and retry UX", () => {
  assert.match(adminApi, /public readonly details\?: unknown/);
  assert.match(adminApi, /failure\.error\?\.details/);
  assert.match(dashboard, /provider_money_not_ready/);
  assert.match(dashboard, /details\.blockers|details\?\.blockers/);
});
