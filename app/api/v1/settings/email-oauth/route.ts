import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { parseServerEnv } from "@/config/env-schema.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "configuration.manage");
    const env = parseServerEnv(process.env);
    return {
      appBaseUrl: env.APP_BASE_URL,
      providers: {
        outlook: {
          configured: Boolean(env.MICROSOFT_OAUTH_CLIENT_ID && env.MICROSOFT_OAUTH_CLIENT_SECRET),
          callbackUrl: new URL("/api/v1/email/outlook/callback", env.APP_BASE_URL).toString(),
          accountTypes: env.MICROSOFT_OAUTH_TENANT === "consumers" ? "Personal Microsoft accounts" : `Microsoft tenant ${env.MICROSOFT_OAUTH_TENANT}`,
        },
        gmail: {
          configured: Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET),
          callbackUrl: new URL("/api/v1/email/gmail/callback", env.APP_BASE_URL).toString(),
          accountTypes: "Google accounts",
        },
      },
    };
  });
}
