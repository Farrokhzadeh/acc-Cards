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

test("Phase 11 assignment history table and permission are installed", async () => {
  const table = await pool.query(`SELECT to_regclass('public.telegram_account_assignment_events') AS name`);
  assert.equal(table.rows[0].name, "telegram_account_assignment_events");

  const permission = await pool.query(`SELECT key FROM permissions WHERE key='clients.assign'`);
  assert.equal(permission.rowCount, 1);
});

test("assignment history is append-only", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accountId = "33333333-3333-4333-8333-333333333331";
    const userId = "33333333-3333-4333-8333-333333333332";
    await client.query(
      `INSERT INTO kripi_accounts(id,label,login_email,encrypted_password,encrypted_api_key)
       VALUES ($1,'Phase11 CI','phase11@example.invalid','ci','ci')`,
      [accountId],
    );
    await client.query(
      `INSERT INTO telegram_users(id,telegram_user_id,display_name)
       VALUES ($1, 900000000111, 'Phase11 CI')`,
      [userId],
    );
    const event = await client.query(
      `INSERT INTO telegram_account_assignment_events(telegram_user_id,account_id,event_type)
       VALUES ($1,$2,'assigned') RETURNING id`,
      [userId, accountId],
    );
    await assert.rejects(
      () => client.query(`DELETE FROM telegram_account_assignment_events WHERE id=$1`, [event.rows[0].id]),
      /append-only/,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
