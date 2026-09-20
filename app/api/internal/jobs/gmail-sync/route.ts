import { timingSafeEqual } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { apiRoute, ApiError } from "@/server/http/api";
import { sha256Hex } from "@/server/security/crypto";
import { syncConnectedGmailInboxesSystem } from "@/server/providers/google/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: Request, expected: string) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  const supplied = header.slice(7).trim();
  if (!supplied) return false;
  const left = Buffer.from(sha256Hex(supplied), "hex");
  const right = Buffer.from(sha256Hex(expected), "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const env = parseServerEnv(process.env);
    if (!env.GMAIL_SYNC_JOB_SECRET) {
      throw new ApiError(503, "gmail_sync_job_disabled", "The Gmail background sync hook is not configured.");
    }
    if (!authorized(request, env.GMAIL_SYNC_JOB_SECRET)) {
      throw new ApiError(401, "unauthenticated", "The job authorization token is invalid.");
    }
    return syncConnectedGmailInboxesSystem(requestId);
  });
}
