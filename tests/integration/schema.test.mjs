import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0001_initial_schema.sql", import.meta.url), "utf8");
const defaults = await readFile(new URL("../../db/migrations/0002_seed_safe_defaults.sql", import.meta.url), "utf8");
const cryptoDeposits = await readFile(new URL("../../db/migrations/0029_kripicard_crypto_deposits.sql", import.meta.url), "utf8");

test("defines the core production tables", () => {
  for (const table of [
    "admins",
    "telegram_users",
    "kripi_accounts",
    "telegram_account_assignments",
    "cards",
    "card_requests",
    "funding_requests",
    "funding_request_events",
    "card_operations",
    "card_transactions",
    "email_accounts",
    "email_messages",
    "otp_deliveries",
    "audit_logs",
    "webhook_events",
    "idempotency_keys",
    "outbox_events",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
  }
});

test("enforces one Telegram owner per Kripicard account", () => {
  assert.match(migration, /account_id uuid NOT NULL UNIQUE REFERENCES kripi_accounts/);
});

test("limits production email providers to Outlook and Gmail", () => {
  assert.match(migration, /provider IN \('outlook', 'gmail'\)/);
  assert.match(defaults, /\["outlook", "gmail"\]/);
});

test("does not fabricate unavailable account balance as zero", () => {
  assert.match(migration, /account_balance_usd_cents bigint,/);
  assert.match(migration, /account_balance_source text NOT NULL DEFAULT 'unavailable'/);
  assert.match(migration, /account_balance_source <> 'unavailable' OR account_balance_usd_cents IS NULL/);
});

test("defines durable deduplication and idempotency constraints", () => {
  assert.match(migration, /idempotency_key text NOT NULL UNIQUE/);
  assert.match(migration, /UNIQUE \(source, external_id\)/);
  assert.match(migration, /UNIQUE \(scope, idempotency_key\)/);
  assert.match(migration, /UNIQUE INDEX card_transactions_provider_id_uq/);
});

test("crypto deposits reference the canonical admin table", () => {
  assert.match(cryptoDeposits, /created_by uuid REFERENCES admins\(id\)/);
  assert.doesNotMatch(cryptoDeposits, /admin_users/);
});
