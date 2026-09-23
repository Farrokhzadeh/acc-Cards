import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getPool } from "@/server/database/pool";
import { parseServerEnv } from "@/config/env-schema.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "funding.execute");
    const { id } = await context.params;
    const accountId = requireUuid(id, "account id");
    const result = await getPool().query<{ label: string; login_email: string }>(
      `SELECT label,login_email FROM kripi_accounts WHERE id=$1::uuid AND archived_at IS NULL`,
      [accountId],
    );
    const account = result.rows[0];
    if (!account) throw new ApiError(404, "not_found", "Kripicard account not found.");
    const env = parseServerEnv(process.env);
    return {
      accountId,
      accountLabel: account.label,
      loginEmail: account.login_email,
      portalUrl: env.KRIPICARD_PORTAL_URL,
      paymentMethod: "crypto_only" as const,
      balanceVerification: "unavailable" as const,
    };
  });
}
