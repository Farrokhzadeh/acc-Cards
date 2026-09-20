import { createHash } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { parseCookies, SESSION_COOKIE } from "@/server/auth/cookies";
import { requestIp, requestUserAgent } from "@/server/auth/request-meta";
import { getPool } from "@/server/database/pool";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

function requestClass(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/telegram/webhook") return "telegram_webhook";
  return ["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()) ? "read" : "mutation";
}

function limitFor(request: Request) {
  const env = parseServerEnv(process.env);
  const classification = requestClass(request);
  if (classification === "telegram_webhook") return env.WEBHOOK_RATE_LIMIT_PER_MINUTE;
  if (classification === "mutation") return env.API_MUTATION_RATE_LIMIT_PER_MINUTE;
  return env.API_RATE_LIMIT_PER_MINUTE;
}

function identityFor(request: Request) {
  const session = parseCookies(request).get(SESSION_COOKIE);
  if (session) return `session:${session}`;
  const ip = requestIp(request);
  if (ip) return `ip:${ip}`;
  return `anonymous:${requestUserAgent(request) ?? "unknown"}`;
}

export async function consumeApiRateLimit(request: Request): Promise<RateLimitResult> {
  const now = new Date();
  const bucket = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const retryAfterSeconds = Math.max(1, 60 - Math.floor((now.getTime() - bucket.getTime()) / 1000));
  const scope = `${requestClass(request)}:${new URL(request.url).pathname}:${identityFor(request)}`;
  const keyHash = createHash("sha256").update(scope).digest("hex");
  const result = await getPool().query<{ request_count: number }>(
    `INSERT INTO security_rate_limits(key_hash, bucket_started_at, request_count, expires_at)
     VALUES ($1, $2, 1, $2::timestamptz + interval '2 minutes')
     ON CONFLICT (key_hash, bucket_started_at)
     DO UPDATE SET request_count = security_rate_limits.request_count + 1
     RETURNING request_count`,
    [keyHash, bucket],
  );
  return { allowed: (result.rows[0]?.request_count ?? 1) <= limitFor(request), retryAfterSeconds };
}
