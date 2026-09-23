import { requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { executeAcceptedFundingRequest } from "@/server/funding/execution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "funding.execute");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const input = await request.json().catch(() => ({})) as { walletFundingConfirmed?: unknown };
    if (input.walletFundingConfirmed !== true) throw new ApiError(409, "provider_wallet_confirmation_required", "Fund the card's Kripicard account wallet with crypto and confirm it before funding the card.");
    const { id } = await context.params;
    return executeAcceptedFundingRequest(requireUuid(id, "funding request id"), session, request, requestId);
  });
}
