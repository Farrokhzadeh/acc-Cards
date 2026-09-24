import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { refreshAccountDeposit } from "@/server/providers/kripicard/deposits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string; depositId: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "accounts.manage");
    requireCsrf(request, session);
    const { id, depositId } = await context.params;
    return refreshAccountDeposit({ accountId: requireUuid(id, "account id"), depositId: requireUuid(depositId, "deposit id"), session, request, requestId });
  });
}
