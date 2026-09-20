import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { reconcileFundingRequest } from "@/server/funding/execution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "funding.execute");
    requireCsrf(request, session);
    const { id } = await context.params;
    return reconcileFundingRequest(requireUuid(id, "funding request id"), session, request, requestId);
  });
}
