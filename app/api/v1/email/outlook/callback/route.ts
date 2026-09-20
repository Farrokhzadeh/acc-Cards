import { randomUUID } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { ApiError } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { completeOutlookConnection } from "@/server/providers/microsoft/service";

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
  if (providerError) {
    return appRedirect({ oauth: "outlook-error", code: providerError });
  }
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!state || !code) return appRedirect({ oauth: "outlook-error", code: "missing_callback_parameters" });

  try {
    const session = await requireAdmin(request, "inbox.manage");
    const result = await completeOutlookConnection({ state, code, session, request, requestId });
    return appRedirect({ oauth: "outlook-connected", account: result.accountId });
  } catch (error) {
    const codeValue = error instanceof ApiError ? error.code : "outlook_connection_failed";
    return appRedirect({ oauth: "outlook-error", code: codeValue });
  }
}
