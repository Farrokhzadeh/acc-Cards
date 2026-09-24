import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0014_card_issuance.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../../server/providers/kripicard/client.ts", import.meta.url), "utf8");
const schemas = await readFile(new URL("../../server/providers/kripicard/schemas.ts", import.meta.url), "utf8");
const errors = await readFile(new URL("../../server/providers/kripicard/errors.ts", import.meta.url), "utf8");
const issuance = await readFile(new URL("../../server/card-requests/issuance.ts", import.meta.url), "utf8");
const issueRoute = await readFile(new URL("../../app/api/v1/card-requests/[id]/issue/route.ts", import.meta.url), "utf8");
const reconcileRoute = await readFile(new URL("../../app/api/v1/card-requests/[id]/reconcile/route.ts", import.meta.url), "utf8");
const env = await readFile(new URL("../../config/env-schema.mjs", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const activateRoute = await readFile(new URL("../../app/api/v1/clients/[id]/activate/route.ts", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../../server/clients/onboarding.ts", import.meta.url), "utf8");
const paymentSettingsRoute = await readFile(new URL("../../app/api/v1/settings/payment-card/route.ts", import.meta.url), "utf8");
const firstCardSettingsRoute = await readFile(new URL("../../app/api/v1/settings/first-card/route.ts", import.meta.url), "utf8");
const cardPolicyRoute = await readFile(new URL("../../app/api/v1/settings/card-policy/route.ts", import.meta.url), "utf8");
const readiness = await readFile(new URL("../../server/providers/kripicard/readiness.ts", import.meta.url), "utf8");
const contract = await readFile(new URL("../../docs/KRIPICARD-PROVIDER-CONTRACT.md", import.meta.url), "utf8");
const success = JSON.parse(await readFile(new URL("../fixtures/kripicard/create-card.json", import.meta.url), "utf8"));
const pending = JSON.parse(await readFile(new URL("../fixtures/kripicard/purchase-pending-refunded.json", import.meta.url), "utf8"));
const refundPending = JSON.parse(await readFile(new URL("../fixtures/kripicard/purchase-refund-pending.json", import.meta.url), "utf8"));
const rateLimit = JSON.parse(await readFile(new URL("../fixtures/kripicard/rate-limit.json", import.meta.url), "utf8"));

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

test("provider client exposes one-shot card and deposit money writes", () => {
  assert.match(client, /createCard\(input:/);
  assert.match(client, /\/api\/external\/cards\/createcard/);
  assert.match(client, /return this\.write/);
  assert.match(client, /createDeposit\s*\(/);
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

test("standalone issuance routes are closed and onboarding keeps RBAC, CSRF, and recent reauthentication", () => {
  assert.match(issueRoute, /card_request_flow_disabled/);
  assert.match(reconcileRoute, /card_request_flow_disabled/);
  assert.match(issueRoute, /requireCsrf/);
  assert.match(reconcileRoute, /requireCsrf/);
  assert.match(activateRoute, /requireAdmin\(request, "clients\.assign"\)/);
  assert.match(activateRoute, /requireCsrf\(request, session\)/);
  assert.match(activateRoute, /requireRecentReauthentication\(session\)/);
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
  assert.match(dashboard, /Operations → Kripicard/);
  assert.match(dashboard, /emergency read-only mode/i);
});

test("provider contract states the one-shot purchase rule", () => {
  assert.match(contract, /never auto-retry/i);
  assert.match(contract, /HTTP 202/i);
  assert.match(contract, /REFUND_PENDING/);
  assert.match(contract, /one provider attempt/i);
});


test("first-card configuration validates BINs early and does not retroactively apply a newer minimum", () => {
  assert.match(firstCardSettingsRoute, /unsupported_onboarding_bin/);
  assert.match(firstCardSettingsRoute, /getCardRequestBins/);
  assert.doesNotMatch(paymentSettingsRoute, /onboardingBin|BIN/);
  assert.match(onboarding, /payment_amount_usd_cents/);
  assert.doesNotMatch(onboarding, /amount_below_minimum/);
  assert.doesNotMatch(onboarding, /minCents/);
});

test("first-card creation requires an explicit crypto wallet confirmation", () => {
  assert.match(activateRoute, /provider_wallet_confirmation_required/);
  assert.match(activateRoute, /walletFundingConfirmed/);
  assert.match(dashboard, /Open Kripicard crypto deposit/);
});


test("onboarding checks live card-creation gates before persisting assignment/request state", () => {
  const preflight = activateRoute.indexOf("await assertCardCreationAvailable()");
  const ensure = activateRoute.indexOf("ensureOnboardingCardRequest({", preflight);
  assert.ok(preflight >= 0 && ensure > preflight);
  assert.match(issuance, /export async function assertCardCreationAvailable/);
  assert.match(onboarding, /assignAccountInTransaction/);
});

test("legacy card-policy mutation is closed so provider BIN catalogue cannot drift through hidden UI", () => {
  assert.match(cardPolicyRoute, /card_policy_mutation_disabled/);
  assert.match(cardPolicyRoute, /requireCsrf/);
});


test("onboarding can switch accounts only after safely retryable issuance failures", () => {
  assert.match(onboarding, /\["approved", "issue_failed"\]\.includes\(row\.status\)/);
  assert.match(onboarding, /unassignAccountInTransaction/);
  assert.match(onboarding, /assignAccountInTransaction/);
  assert.match(onboarding, /onboarding_account_locked/);
  assert.match(onboarding, /onboarding\.issuing_account\.changed/);
  assert.match(onboarding, /email=\$3/);
  assert.match(onboarding, /account\.rows\[0\]\.email/);
  assert.match(onboarding, /encrypted_api_key\.startsWith\("v1\."\)/);
  assert.doesNotMatch(onboarding, /\["approved", "issue_failed", "needs_reconciliation"/);
});


test("corrupted provider API keys fail before issuance state is committed", () => {
  const decrypt = issuance.indexOf("apiKey = decryptSecret(account.encrypted_api_key)");
  const operation = issuance.indexOf("INSERT INTO card_operations", decrypt);
  const issuing = issuance.indexOf("SET status='issuing'", decrypt);
  assert.ok(decrypt >= 0 && operation > decrypt && issuing > decrypt);
  assert.match(issuance, /throw new ApiError\(409, "secret_unavailable"/);
  assert.match(issuance, /new KripicardClient\(\{ apiKey \}\)/);
});
