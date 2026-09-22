import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(new URL("../../server/providers/kripicard/client.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../../server/providers/kripicard/service.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../../db/migrations/0004_kripicard_read_integration.sql", import.meta.url), "utf8");
const stateMigration = await readFile(new URL("../../db/migrations/0005_card_state_actions.sql", import.meta.url), "utf8");
const env = await readFile(new URL("../../.env.example", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const list = JSON.parse(await readFile(new URL("../fixtures/kripicard/cards-list.json", import.meta.url), "utf8"));
const details = JSON.parse(await readFile(new URL("../fixtures/kripicard/card-details.json", import.meta.url), "utf8"));
const transactions = JSON.parse(await readFile(new URL("../fixtures/kripicard/transactions.json", import.meta.url), "utf8"));
const freeze = JSON.parse(await readFile(new URL("../fixtures/kripicard/freeze-unfreeze.json", import.meta.url), "utf8"));

test("provider base URL and documented read endpoints are wired", () => {
  assert.match(env, /KRIPICARD_BASE_URL=https:\/\/appapi\.kripicard\.com/);
  assert.match(client, /\/api\/external\/cards\/list/);
  assert.match(client, /\/api\/external\/cards\/carddetails/);
  assert.match(client, /\/api\/external\/cards\/transactions/);
  assert.match(client, /\/api\/external\/premium\/Freeze_Unfreeze/);
});

test("sanitized documentation fixtures contain the provider fields Phase 5 depends on", () => {
  assert.equal(list.success, true);
  assert.equal(list.data[0].card_id, "MR_A1B2C3D4E5F6G7H8");
  assert.equal(list.data[0].last4, "4321");
  assert.equal(details.card_number, "5395020000001234");
  assert.equal(details.cvv, "123");
  assert.equal(transactions.data.transactions[1].reason_code, "insufficient_funds");
  assert.equal(transactions.data.transactions[2].type, "OTP");
  assert.equal(freeze.success, true);
  assert.match(freeze.message, /freezed/i);
});

test("sensitive PAN and CVV are returned on demand but never inserted into PostgreSQL", () => {
  assert.match(service, /cardNumber: response\.card_number/);
  assert.match(service, /cvv: response\.cvv/);
  assert.doesNotMatch(service, /INSERT[^;]*(card_number|cvv)/is);
});

test("card list synchronization reconciles missing provider cards without deleting history", () => {
  assert.match(service, /missingFromProvider/);
  assert.match(service, /status = 'attention'/);
  assert.doesNotMatch(service, /DELETE FROM cards/);
});

test("provider transaction sync is deterministic and deduplicated", () => {
  assert.match(service, /createHash\("sha256"\)/);
  assert.match(service, /ON CONFLICT \(card_id, fingerprint\)/);
});

test("Phase 5 records the confirmed wallet-based provider payment model", () => {
  assert.match(migration, /kripicard_payment_model/);
  assert.match(migration, /account_wallet/);
  assert.match(migration, /direct_crypto_card_funding_supported/);
});


test("freeze/unfreeze writes are single-attempt and reconciled instead of automatically retried", () => {
  assert.match(client, /private write<[\s\S]*return this\.requestOnce\(path, body, schema\)/);
  assert.match(service, /ambiguous_write_outcome/);
  assert.match(service, /reconciled_by_cards_list/);
  assert.match(stateMigration, /card_state_active_operation_uq/);
});

test("Phase 6 provider writes remain guarded by deployment flags", () => {
  assert.match(service, /ENABLE_KRIPICARD_CARD_STATE_WRITES/);
  assert.match(env, /ENABLE_KRIPICARD_CARD_STATE_WRITES=false/);
});


test("card-state UI explains deployment and runtime kill-switch failures", () => {
  assert.match(dashboard, /Freeze\/unfreeze is installed but disabled/);
  assert.match(dashboard, /runtime_kill_switch/);
  assert.match(dashboard, /Read-only mode/);
});
