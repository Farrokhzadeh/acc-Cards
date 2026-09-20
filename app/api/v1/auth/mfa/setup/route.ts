import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf, setupMfa } from "@/server/auth/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request);
    requireCsrf(request, session);
    return setupMfa(session, request, requestId);
  });
}
