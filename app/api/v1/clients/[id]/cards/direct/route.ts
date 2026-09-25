import { z } from "zod";
import { requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { prepareAdminDirectCard } from "@/server/cards/admin-direct";
import { assertCardCreationAvailable, issueApprovedCardRequest } from "@/server/card-requests/issuance";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  accountId: z.string().uuid(),
  bin: z.string().regex(/^\d{6}$/),
  amountUsdCents: z.number().int().positive(),
  nameOnCard: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(320),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  walletFundingConfirmed: z.boolean(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "cards.create_direct");
    requireCsrf(request, session);
    requireRecentReauthentication(session);

    const { id: rawId } = await context.params;
    const clientId = requireUuid(rawId, "client id");
    const input = schema.parse(await request.json());
    if (!input.walletFundingConfirmed) {
      throw new ApiError(409, "provider_wallet_confirmation_required", "Confirm that the selected Kripicard wallet is funded before creating the card.");
    }

    await assertCardCreationAvailable();
    const prepared = await prepareAdminDirectCard({
      clientId,
      accountId: input.accountId,
      bin: input.bin,
      amountUsdCents: input.amountUsdCents,
      nameOnCard: input.nameOnCard,
      email: input.email,
      dateOfBirth: input.dateOfBirth ?? null,
      session,
      request,
      requestId,
    });

    const result = await issueApprovedCardRequest(prepared.id, session, request, requestId);
    return { ...result, reference: prepared.reference, origin: "admin_direct" as const };
  });
}
