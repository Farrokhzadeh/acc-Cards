import { timingSafeEqual } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { apiRoute, ApiError } from "@/server/http/api";
import { classifyPendingEmailMessages, expireOtpDeliveries } from "@/server/email/classifier";
import { getPool } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const env = parseServerEnv(process.env);
    const expected = env.EMAIL_CLASSIFY_JOB_SECRET;
    const auth = request.headers.get("authorization") ?? "";
    const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const valid = Boolean(expected) && supplied.length === expected!.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected!));
    if (!valid) throw new ApiError(401, "unauthenticated", "Invalid email classification job secret.");
    const classified = await classifyPendingEmailMessages({ limit: 500 });
    const expired = await expireOtpDeliveries(1000);
    await getPool().query(
      `INSERT INTO job_runs(job_type, job_key, status, safe_metadata, started_at, finished_at) VALUES ('email_classify', 'email-classify', 'succeeded', $1::jsonb, now(), now())`,
      [JSON.stringify({ ...classified, ...expired, requestId })],
    );
    return { ...classified, ...expired };
  });
}
