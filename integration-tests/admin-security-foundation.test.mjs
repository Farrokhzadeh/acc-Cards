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

test("phase 4 security migration is present", async () => {
  const columns = await pool.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'admins'
       AND column_name IN ('mfa_secret_encrypted', 'mfa_confirmed_at')
  `);
  assert.deepEqual(new Set(columns.rows.map((row) => row.column_name)), new Set(["mfa_secret_encrypted", "mfa_confirmed_at"]));

  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('admin_auth_challenges', 'admin_login_attempts')
  `);
  assert.deepEqual(new Set(tables.rows.map((row) => row.table_name)), new Set(["admin_auth_challenges", "admin_login_attempts"]));
});

test("super admin role owns all currently seeded permissions", async () => {
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM permissions) AS permissions,
      (SELECT COUNT(*)::int
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
        WHERE r.name = 'super_admin') AS granted
  `);
  assert.equal(counts.rows[0].granted, counts.rows[0].permissions);
});

test("audit log rejects updates", async () => {
  const inserted = await pool.query(`
    INSERT INTO audit_logs(actor_type, action, entity_type)
    VALUES ('system', 'ci.audit', 'ci') RETURNING id
  `);
  await assert.rejects(
    () => pool.query(`UPDATE audit_logs SET action = 'mutated' WHERE id = $1`, [inserted.rows[0].id]),
    /audit_logs is append-only/,
  );
});
