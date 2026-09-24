import { z } from "zod";
import { requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { issueApprovedCardRequest } from "@/server/card-requests/issuance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ walletFundingConfirmed: z.boolean() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "card_requests.issue");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    if (!input.walletFundingConfirmed) {
      throw new ApiError(409, "provider_wallet_confirmation_required", "Confirm that the selected Kripicard wallet is funded with crypto before creating the card.");
    }
    return issueApprovedCardRequest(requireUuid(id, "card request id"), session, request, requestId);
  });
}
