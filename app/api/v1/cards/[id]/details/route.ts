import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getLiveKripicardCardDetails } from "@/server/providers/kripicard/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "cards.sensitive.read");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "card id");
    return getLiveKripicardCardDetails(id, session, request, requestId);
  });
}
