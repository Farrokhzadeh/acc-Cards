import { Pool, type PoolClient, type Queryable } from "pg";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { redactSensitiveText } from "@/server/security/redaction";

declare global {
  var __accabadPgPool: Pool | undefined;
}

function createPool() {
  const env = parseServerEnv(process.env);
  const pool = new Pool({
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    database: env.DATABASE_NAME,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    ssl: env.DATABASE_SSL_MODE === "require" ? { rejectUnauthorized: true } : false,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
    statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
    application_name: `accabad-admin-${env.APP_ENV}`,
  });

  pool.on("error", (error) => {
    // Do not log query text/parameters or credentials.
    console.error("[database] unexpected idle client error", {
      name: error.name,
      message: redactSensitiveText(error),
    });
  });

  return pool;
}

export function getPool() {
  if (!globalThis.__accabadPgPool) {
    globalThis.__accabadPgPool = createPool();
  }
  return globalThis.__accabadPgPool;
}

export async function pingDatabase() {
  const result = await getPool().query<{ ok: number }>("SELECT 1::int AS ok");
  return result.rows[0]?.ok === 1;
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error. Connection cleanup still happens below.
    }
    throw error;
  } finally {
    client.release();
  }
}

export type DatabaseQueryable = Queryable;
