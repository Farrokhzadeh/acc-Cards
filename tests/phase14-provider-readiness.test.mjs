import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../db/migrations/0013_provider_operational_readiness.sql", import.meta.url), "utf8");
const readiness = await readFile(new URL("../server/providers/kripicard/readiness.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../server/providers/kripicard/client.ts", import.meta.url), "utf8");
const schemas = await readFile(new URL("../server/providers/kripicard/schemas.ts", import.meta.url), "utf8");
const getRoute = await readFile(new URL("../app/api/v1/provider-readiness/route.ts", import.meta.url), "utf8");
const patchRoute = await readFile(new URL("../app/api/v1/provider-readiness/[key]/route.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard-app.tsx", import.meta.url), "utf8");
const contract = await readFile(new URL("../KRIPICARD-PROVIDER-CONTRACT.md", import.meta.url), "utf8");
const questionnaire = await readFile(new URL("../PROVIDER-READINESS-QUESTIONS.md", import.meta.url), "utf8");

const coins = JSON.parse(await readFile(new URL("./fixtures/kripicard/deposit-coins.json", import.meta.url), "utf8"));
const networks = JSON.parse(await readFile(new URL("./fixtures/kripicard/deposit-networks.json", import.meta.url), "utf8"));
const create = JSON.parse(await readFile(new URL("./fixtures/kripicard/deposit-create.json", import.meta.url), "utf8"));
const status = JSON.parse(await readFile(new URL("./fixtures/kripicard/deposit-status.json", import.meta.url), "utf8"));

test("Phase 14 stores money-critical provider assumptions as evidence-backed readiness checks", () => {
  assert.match(migration, /provider_readiness_checks/);
  assert.match(migration, /provider_readiness_events/);
  assert.match(migration, /wallet_flow/);
  assert.match(migration, /deposit_order_id_idempotency/);
  assert.match(migration, /createcard_idempotency/);
  assert.match(migration, /fundcard_idempotency/);
  assert.match(migration, /deposit_underpayment_behavior/);
  assert.match(migration, /deposit_overpayment_behavior/);
  assert.match(migration, /deposit_late_payment_behavior/);
});

test("supplied-PDF facts are separated from unresolved production questions", () => {
  assert.match(migration, /'wallet_flow'.*'confirmed'.*'supplied_pdf'/s);
  assert.match(migration, /'deposit_order_id_idempotency'.*'confirmed'.*'supplied_pdf'/s);
  assert.match(migration, /'production_rate_limits'.*'unresolved'.*'none'/s);
  assert.match(migration, /'wallet_balance_endpoint'.*'unresolved'.*'none'/s);
});

test("readiness API is RBAC/CSRF protected and changes are audited", () => {
  assert.match(getRoute, /provider\.readiness\.read/);
  assert.match(patchRoute, /provider\.readiness\.manage/);
  assert.match(patchRoute, /requireCsrf/);
  assert.match(readiness, /provider\.readiness\.updated/);
  assert.match(readiness, /provider_readiness_events/);
});

test("public marketing material cannot clear a live-money blocker", () => {
  assert.match(readiness, /official_public/);
  assert.match(readiness, /provider_evidence_insufficient/);
  assert.match(readiness, /provider-written confirmation or a controlled live test/i);
});

test("future money writes have a reusable database readiness assertion", () => {
  assert.match(readiness, /assertProviderMoneyReadiness/);
  assert.match(readiness, /provider_money_not_ready/);
  assert.match(readiness, /deposit_create/);
  assert.match(readiness, /card_create/);
  assert.match(readiness, /card_fund/);
});

test("deposit discovery/status stay read-only while later Phase 15 may add guarded card creation", () => {
  assert.match(client, /depositCoins\(\)/);
  assert.match(client, /depositNetworks/);
  assert.match(client, /depositStatus/);
  assert.match(client, /\/api\/external\/deposits\/coins/);
  assert.match(client, /\/api\/external\/deposits\/networks/);
  assert.match(client, /\/api\/external\/deposits\/status/);
  assert.doesNotMatch(client, /createDeposit\s*\(/);
});

test("deposit documentation fixtures preserve exact payment instruction and terminal-status fields", () => {
  assert.equal(coins.data[0].symbol, "USDT");
  assert.equal(networks.data.networks[0].network, "trx");
  assert.equal(create.data.id, "E48138ADD0CE");
  assert.equal(create.data.pay_amount, "50.01");
  assert.equal(create.data.credited_on_completion_usd, 44);
  assert.equal(status.data.status, "completed");
  assert.equal(status.data.credited, true);
  assert.equal(status.data.credited_amount_usd, 44);
  assert.match(schemas, /kripicardDepositCreateResponseSchema/);
  assert.match(schemas, /pending.*completed.*failed/s);
});

test("Settings shows the database-backed provider readiness gate instead of a static claim", () => {
  assert.match(dashboard, /fetchProviderReadiness/);
  assert.match(dashboard, /Kripicard money readiness/);
  assert.match(dashboard, /Some live money operations remain blocked|Card creation contract cleared/);
  assert.match(dashboard, /blocks live money/);
});

test("provider contract and questionnaire explicitly preserve wallet model and unresolved edge cases", () => {
  assert.match(contract, /Crypto deposit → Kripicard account wallet → create card \/ fund card/);
  assert.match(contract, /`createDeposit` remains unavailable/);
  assert.match(contract, /Card funding — Phase 16/);
  assert.match(questionnaire, /underpayment/i);
  assert.match(questionnaire, /overpayment/i);
  assert.match(questionnaire, /after `expires_at`/i);
  assert.match(questionnaire, /signature/i);
  assert.match(questionnaire, /rate limits/i);
});
