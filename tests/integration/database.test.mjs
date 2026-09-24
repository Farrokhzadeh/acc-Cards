import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const pool = new pg.Pool({
  host: process.env.PGHOST ?? process.env.DATABASE_HOST,
  port: Number(process.env.PGPORT ?? process.env.DATABASE_PORT ?? 5432),
  database: process.env.PGDATABASE ?? process.env.DATABASE_NAME,
  user: process.env.PGUSER ?? process.env.DATABASE_USER,
  password: process.env.PGPASSWORD ?? process.env.DATABASE_PASSWORD,
  ssl: false,
});

test.after(async () => {
  await pool.end();
});

test("migrations produce the required runtime schema", async () => {
  const tables = [
    "admins",
    "telegram_users",
    "kripi_accounts",
    "cards",
    "card_requests",
    "funding_requests",
    "email_accounts",
    "email_messages",
    "otp_deliveries",
    "scheduled_jobs",
    "runtime_controls",
    "kyc_submissions",
  ];
  const result = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
    [tables],
  );
  assert.deepEqual(new Set(result.rows.map((row) => row.tablename)), new Set(tables));
});

test("runtime jobs and controls are seeded", async () => {
  const jobs = await pool.query("SELECT job_key FROM scheduled_jobs");
  const jobKeys = new Set(jobs.rows.map((row) => row.job_key));
  for (const key of ["gmail-sync", "outlook-sync", "telegram-outbox", "email-classify"]) {
    assert.equal(jobKeys.has(key), true, `missing scheduled job: ${key}`);
  }

  const controls = await pool.query("SELECT control_key FROM runtime_controls");
  const controlKeys = new Set(controls.rows.map((row) => row.control_key));
  for (const key of ["gmail_sync", "outlook_sync", "telegram_sends"]) {
    assert.equal(controlKeys.has(key), true, `missing runtime control: ${key}`);
  }
});

test("core configurable card and funding defaults exist without an automatic card-count limit", async () => {
  const expected = [
    "minimum_card_creation_usd_cents",
    "minimum_card_funding_usd_cents",
    "card_request_bins",
  ];
  const result = await pool.query(
    "SELECT key FROM settings WHERE key = ANY($1::text[])",
    [expected],
  );
  const keys = new Set(result.rows.map((row) => row.key));
  for (const key of expected) {
    assert.equal(keys.has(key), true, `missing setting: ${key}`);
  }
});
