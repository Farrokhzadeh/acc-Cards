import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { disconnectOutlook } from "@/server/providers/microsoft/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "inbox.manage");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "account id");
    return disconnectOutlook(id, session, request, requestId);
  });
}
