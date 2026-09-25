import { z } from "zod";
import { requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { prepareAdminDirectCard } from "@/server/cards/admin-direct";
import { assertCardCreationAvailable, issueApprovedCardRequest } from "@/server/card-requests/issuance";
import { getCardRequestBins } from "@/server/card-requests/service";
import { listAssignableAccounts } from "@/server/clients/assignments";
import { getPool } from "@/server/database/pool";
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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "cards.create_direct");
    const { id: rawId } = await context.params;
    const clientId = requireUuid(rawId, "client id");
    const [accounts, bins, profile] = await Promise.all([
      listAssignableAccounts(clientId, "", 100),
      getCardRequestBins(),
      getPool().query<{ full_name: string | null; date_of_birth: Date | string | null; display_name: string | null }>(
        `SELECT k.full_name,k.date_of_birth,u.display_name
           FROM telegram_users u
           LEFT JOIN LATERAL (
             SELECT full_name,date_of_birth
               FROM kyc_submissions
              WHERE telegram_user_id=u.id
              ORDER BY (status='approved') DESC,submitted_at DESC
              LIMIT 1
           ) k ON true
          WHERE u.id=$1::uuid`,
        [clientId],
      ),
    ]);
    const row = profile.rows[0];
    if (!row) throw new ApiError(404, "client_not_found", "Telegram client not found.");
    const dateOfBirth = row.date_of_birth
      ? (typeof row.date_of_birth === "string" ? row.date_of_birth.slice(0,10) : row.date_of_birth.toISOString().slice(0,10))
      : null;
    return {
      accounts,
      bins,
      defaults: {
        nameOnCard: row.full_name?.trim() || row.display_name?.trim() || "",
        dateOfBirth,
      },
    };
  });
}

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
