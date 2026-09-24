import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { createAccountDeposit, createDepositInput, listAccountDeposits } from "@/server/providers/kripicard/deposits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "accounts.read");
    const { id } = await context.params;
    return listAccountDeposits(requireUuid(id, "account id"));
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "accounts.manage");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const { id } = await context.params;
    const input = createDepositInput.parse(await request.json());
    return createAccountDeposit({ accountId: requireUuid(id, "account id"), ...input, session, request, requestId });
  });
}
