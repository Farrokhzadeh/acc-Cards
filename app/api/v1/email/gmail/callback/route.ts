import { randomUUID } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { ApiError } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { completeGmailConnection } from "@/server/providers/google/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function appRedirect(params: Record<string, string>) {
  const env = parseServerEnv(process.env);
  const url = new URL("/", env.APP_BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url, 303);
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  if (providerError) return appRedirect({ oauth: "gmail-error", code: providerError });
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!state || !code) return appRedirect({ oauth: "gmail-error", code: "missing_callback_parameters" });

  try {
    const session = await requireAdmin(request, "inbox.manage");
    const result = await completeGmailConnection({ state, code, session, request, requestId });
    return appRedirect({ oauth: "gmail-connected", account: result.accountId });
  } catch (error) {
    const codeValue = error instanceof ApiError ? error.code : "gmail_connection_failed";
    return appRedirect({ oauth: "gmail-error", code: codeValue });
  }
}
