import { requireAdmin } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { getFundingRequestDetail } from "@/server/funding/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "funding.read");
    const { id } = await context.params;
    return getFundingRequestDetail(requireUuid(id, "funding request id"));
  });
}
