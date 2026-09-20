import { requireAdmin } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { getCardRequestDetail } from "@/server/card-requests/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "card_requests.read");
    const { id } = await context.params;
    return getCardRequestDetail(requireUuid(id, "card request id"));
  });
}
