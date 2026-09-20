import { scrypt as scryptCallback, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scrypt = promisify(scryptCallback);
const { Pool } = pg;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function hashPassword(password) {
  if (password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const derived = await scrypt(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${Buffer.from(derived).toString("base64")}`;
}

const pool = new Pool({
  host: required("DATABASE_HOST"),
  port: Number(process.env.DATABASE_PORT || 5432),
  database: required("DATABASE_NAME"),
  user: required("DATABASE_USER"),
  password: required("DATABASE_PASSWORD"),
  ssl: process.env.DATABASE_SSL_MODE === "require" ? { rejectUnauthorized: true } : false,
});

try {
  const existing = await pool.query("SELECT COUNT(*)::int AS count FROM admins");
  if ((existing.rows[0]?.count ?? 0) > 0) {
    throw new Error("Bootstrap refused: an admin already exists. Use the authenticated admin-management flow for additional admins.");
  }

  const email = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const displayName = (process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || "Super Admin").trim();
  const passwordHash = await hashPassword(required("BOOTSTRAP_ADMIN_PASSWORD"));

  const result = await pool.query(
    `INSERT INTO admins(email, display_name, role_id, password_hash, status)
     SELECT $1, $2, r.id, $3, 'active'
       FROM roles r
      WHERE r.name = 'super_admin'
     RETURNING id, email, display_name`,
    [email, displayName, passwordHash],
  );
  if (!result.rowCount) throw new Error("super_admin role is missing; apply migrations first.");

  const admin = result.rows[0];
  await pool.query(
    `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted)
     VALUES ('system', NULL, 'admin.bootstrap', 'admin', $1, $2::jsonb)`,
    [admin.id, JSON.stringify({ email: admin.email })],
  );
  console.log(`Created first AccAbad Super Admin: ${admin.email}`);
} finally {
  await pool.end();
}
