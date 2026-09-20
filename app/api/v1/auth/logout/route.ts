import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf, revokeSession } from "@/server/auth/service";
import { loggedOutResponse } from "@/server/auth/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request);
    requireCsrf(request, session);
    await revokeSession(session, request, requestId);
    return loggedOutResponse({ ok: true }, requestId);
  });
}
