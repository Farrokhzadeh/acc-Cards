import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME ?? "accabad",
  user: process.env.DATABASE_USER ?? "accabad",
  password: process.env.DATABASE_PASSWORD ?? "ci-database-password",
  ssl: false,
  connectionTimeoutMillis: 3000,
});

test.after(async () => pool.end());

test("Phase 5 synchronization table and provider card timestamp exist", async () => {
  const table = await pool.query(`SELECT to_regclass('public.account_sync_state') AS name`);
  assert.equal(table.rows[0].name, "account_sync_state");
  const column = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='cards' AND column_name='provider_created_at'`);
  assert.equal(column.rowCount, 1);
});

test("direct crypto-to-card is explicitly disabled by provider contract", async () => {
  const settings = await pool.query(`SELECT key, typed_value FROM settings WHERE key IN ('kripicard_payment_model','kripicard_direct_crypto_card_funding_supported') ORDER BY key`);
  assert.equal(settings.rowCount, 2);
  const map = new Map(settings.rows.map((row) => [row.key, row.typed_value]));
  assert.equal(map.get("kripicard_payment_model"), "account_wallet");
  assert.equal(map.get("kripicard_direct_crypto_card_funding_supported"), false);
});

test("sensitive card read permission is not granted to operator by default", async () => {
  const rows = await pool.query(`
    SELECT r.name
      FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'cards.sensitive.read'
     ORDER BY r.name
  `);
  assert.deepEqual(rows.rows.map((row) => row.name), ["super_admin"]);
});


test("Phase 6 installs a single-active card-state operation constraint", async () => {
  const index = await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='card_state_active_operation_uq'`);
  assert.equal(index.rowCount, 1);
  const setting = await pool.query(`SELECT typed_value FROM settings WHERE key='kripicard_card_state_writes_enabled'`);
  assert.equal(setting.rowCount, 1);
  assert.equal(setting.rows[0].typed_value, false);
});
