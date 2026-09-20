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

test("Phase 12 card request timeline and permissions are installed", async () => {
  const table = await pool.query(`SELECT to_regclass('public.card_request_events') AS name`);
  assert.equal(table.rows[0].name, "card_request_events");
  const permissions = await pool.query(`SELECT key FROM permissions WHERE key IN ('card_requests.read','card_requests.review') ORDER BY key`);
  assert.deepEqual(permissions.rows.map((row) => row.key), ["card_requests.read", "card_requests.review"]);
});

test("card request timeline is append-only", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userId = "44444444-4444-4444-8444-444444444441";
    const requestId = "44444444-4444-4444-8444-444444444442";
    await client.query(`INSERT INTO telegram_users(id,telegram_user_id,display_name) VALUES ($1,900000000212,'Phase12 CI')`, [userId]);
    await client.query(
      `INSERT INTO card_requests(id,reference,user_id,bin,initial_amount_usd_cents,name_on_card,email,status)
       VALUES ($1,'CR-CI-P12',$2,'539502',2000,'Phase Twelve','phase12@example.invalid','pending_review')`,
      [requestId, userId],
    );
    const event = await client.query(
      `INSERT INTO card_request_events(request_id,to_status,actor_type,telegram_user_id)
       VALUES ($1,'pending_review','telegram_user',$2) RETURNING id`,
      [requestId, userId],
    );
    await assert.rejects(
      () => client.query(`DELETE FROM card_request_events WHERE id=$1`, [event.rows[0].id]),
      /append-only/,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
