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

test.after(async () => {
  await pool.end();
});

test("PostgreSQL is queryable and core tables exist", async () => {
  const ping = await pool.query("SELECT 1::int AS ok");
  assert.equal(ping.rows[0].ok, 1);

  const tables = await pool.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('kripi_accounts', 'cards', 'telegram_users', 'telegram_account_assignments')
  `);
  assert.deepEqual(
    new Set(tables.rows.map((row) => row.table_name)),
    new Set(["kripi_accounts", "cards", "telegram_users", "telegram_account_assignments"]),
  );
});

test("database prevents assigning one account to two Telegram users", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accountId = "11111111-1111-4111-8111-111111111111";
    const userA = "22222222-2222-4222-8222-222222222221";
    const userB = "22222222-2222-4222-8222-222222222222";

    await client.query(
      `INSERT INTO kripi_accounts(id, label, login_email, encrypted_password, encrypted_api_key)
       VALUES ($1, 'CI account', 'ci-account@example.invalid', 'ci', 'ci')`,
      [accountId],
    );
    await client.query(
      `INSERT INTO telegram_users(id, telegram_user_id, display_name)
       VALUES ($1, 900000000001, 'CI A'), ($2, 900000000002, 'CI B')`,
      [userA, userB],
    );
    await client.query(
      `INSERT INTO telegram_account_assignments(telegram_user_id, account_id) VALUES ($1, $2)`,
      [userA, accountId],
    );

    await assert.rejects(
      () => client.query(
        `INSERT INTO telegram_account_assignments(telegram_user_id, account_id) VALUES ($1, $2)`,
        [userB, accountId],
      ),
      (error) => error?.code === "23505",
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
