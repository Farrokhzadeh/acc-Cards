import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../db/migrations/0014_card_issuance.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../server/providers/kripicard/client.ts", import.meta.url), "utf8");
const schemas = await readFile(new URL("../server/providers/kripicard/schemas.ts", import.meta.url), "utf8");
const errors = await readFile(new URL("../server/providers/kripicard/errors.ts", import.meta.url), "utf8");
const issuance = await readFile(new URL("../server/card-requests/issuance.ts", import.meta.url), "utf8");
const issueRoute = await readFile(new URL("../app/api/v1/card-requests/[id]/issue/route.ts", import.meta.url), "utf8");
const reconcileRoute = await readFile(new URL("../app/api/v1/card-requests/[id]/reconcile/route.ts", import.meta.url), "utf8");
const env = await readFile(new URL("../config/env-schema.mjs", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard-app.tsx", import.meta.url), "utf8");
const activateRoute = await readFile(new URL("../app/api/v1/clients/[id]/activate/route.ts", import.meta.url), "utf8");
const readiness = await readFile(new URL("../server/providers/kripicard/readiness.ts", import.meta.url), "utf8");
const contract = await readFile(new URL("../docs/KRIPICARD-PROVIDER-CONTRACT.md", import.meta.url), "utf8");
const success = JSON.parse(await readFile(new URL("./fixtures/kripicard/create-card.json", import.meta.url), "utf8"));
const pending = JSON.parse(await readFile(new URL("./fixtures/kripicard/purchase-pending-refunded.json", import.meta.url), "utf8"));
const refundPending = JSON.parse(await readFile(new URL("./fixtures/kripicard/purchase-refund-pending.json", import.meta.url), "utf8"));
const rateLimit = JSON.parse(await readFile(new URL("./fixtures/kripicard/rate-limit.json", import.meta.url), "utf8"));

test("Phase 15 adds guarded create-card operation state and permissions", () => {
  assert.match(migration, /card_create_active_request_uq/);
  assert.match(migration, /operation_type = 'create'/);
  assert.match(migration, /status IN \('created','pending','needs_reconciliation'\)/);
  assert.match(migration, /card_requests\.issue/);
  assert.match(migration, /issuance_started_at/);
  assert.match(migration, /last_issue_operation_id/);
});

test("the documented Overview contract updates rate limits, BINs, and HTTP 202 readiness", () => {
  assert.match(migration, /production_rate_limits/);
  assert.match(migration, /Overview PDF pp\.2-3/);
  assert.match(migration, /purchase_202_contract/);
  assert.match(migration, /REFUND_PENDING/);
  for (const bin of ["539502","525847","539578","525797","235019","223600","238003","537872","533171","246001"]) {
    assert.match(migration, new RegExp(bin));
  }
});

test("createcard is the only new money-changing provider client method", () => {
  assert.match(client, /createCard\(input:/);
  assert.match(client, /\/api\/external\/cards\/createcard/);
  assert.match(client, /return this\.write/);
  assert.doesNotMatch(client, /createDeposit\s*\(/);
});

test("create-card success schema matches the supplied provider fields", () => {
  assert.equal(success.success, true);
  assert.equal(success.card_id, "MR_A1B2C3D4E5F6G7H8");
  assert.equal(success.last_4, "4321");
  assert.equal(success.fee, 1.8);
  assert.match(schemas, /kripicardCreateCardResponseSchema/);
  assert.match(schemas, /total_charged/);
});

test("provider errors preserve the documented no-retry purchase states and rate metadata", () => {
  assert.equal(pending.pending, true);
  assert.equal(refundPending.code, "REFUND_PENDING");
  assert.equal(rateLimit.retry_after_seconds, 39);
  assert.match(client, /purchase_pending_refunded/);
  assert.match(client, /refund_pending/);
  assert.match(client, /OPERATION_IN_FLIGHT/);
  assert.match(client, /retry_after_seconds/);
  assert.match(errors, /safeToRetry/);
});

test("issuance is feature-gated, rechecks capacity and account ownership, and snapshots cards before the write", () => {
  assert.match(issuance, /ENABLE_KRIPICARD_CARD_CREATION/);
  assert.match(issuance, /assertProviderMoneyReadiness\("card_create"\)/);
  assert.match(issuance, /pg_advisory_xact_lock/);
  assert.match(issuance, /telegram_account_assignments/);
  assert.match(issuance, /preProviderCardIds/);
  assert.match(issuance, /before = await client\.listCards\(\)/);
  assert.match(issuance, /result = await client\.createCard/);
});

test("ambiguous provider outcomes are reconciled with cards/list and never cause an automatic second createcard", () => {
  const createCalls = (issuance.match(/client\.createCard\(/g) ?? []).length;
  assert.equal(createCalls, 1);
  assert.match(issuance, /needs_reconciliation/);
  assert.match(issuance, /reconcileWithList/);
  assert.match(issuance, /candidateCard/);
  assert.match(issuance, /will not send createcard again/i);
  assert.match(issuance, /persistence_error_after_provider_write/);
});

test("issuance routes require RBAC, CSRF and recent reauthentication for the purchase", () => {
  assert.match(issueRoute, /card_requests\.issue/);
  assert.match(issueRoute, /requireCsrf/);
  assert.match(issueRoute, /requireRecentReauthentication/);
  assert.match(reconcileRoute, /card_requests\.issue/);
  assert.match(reconcileRoute, /requireCsrf/);
});

test("deployment has a dedicated card-creation kill switch", () => {
  assert.match(env, /ENABLE_KRIPICARD_CARD_CREATION/);
  assert.match(env, /Kripicard card creation requires ENABLE_LIVE_PROVIDER_WRITES=true/);
});

test("readiness is operation-specific so unresolved deposit/funding questions do not silently redefine card-create requirements", () => {
  assert.match(readiness, /requiredByOperation/);
  assert.match(readiness, /card_create/);
  assert.match(readiness, /purchase_202_contract/);
  assert.match(readiness, /readyByOperation/);
});

test("first-card onboarding exposes guarded Create/Reconcile actions and interactive reauthentication", () => {
  assert.match(dashboard, /Create first card/);
  assert.match(dashboard, /Reconcile first card/);
  assert.match(dashboard, /reauthentication_required/);
  assert.match(dashboard, /Confirm live provider action/);
  assert.match(dashboard, /Reauthenticate & continue/);
  assert.match(dashboard, /reauthenticateAdmin\(reauthPassword/);
  assert.match(activateRoute, /input\.action === "create_card"/);
  assert.match(activateRoute, /input\.action === "reconcile_card"/);
  assert.match(activateRoute, /requireRecentReauthentication\(session\)/);
  assert.match(activateRoute, /issueApprovedCardRequest/);
  assert.match(activateRoute, /reconcileCardIssuance/);
});

test("first-card onboarding turns provider gates into actionable admin guidance", () => {
  assert.match(dashboard, /feature_disabled/);
  assert.match(dashboard, /runtime_kill_switch/);
  assert.match(dashboard, /provider_money_not_ready/);
  assert.match(dashboard, /LIVE_PROVIDER_WRITE_CONFIRMATION/);
  assert.match(dashboard, /Kripicard money readiness/);
  assert.match(dashboard, /emergency read-only mode/i);
});

test("provider contract states the one-shot purchase rule", () => {
  assert.match(contract, /never auto-retry/i);
  assert.match(contract, /HTTP 202/i);
  assert.match(contract, /REFUND_PENDING/);
  assert.match(contract, /one provider attempt/i);
});
