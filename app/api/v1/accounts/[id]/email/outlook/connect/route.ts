import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { startOutlookConnection } from "@/server/providers/microsoft/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "inbox.manage");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "account id");
    return startOutlookConnection(id, session, request, requestId);
  });
}
