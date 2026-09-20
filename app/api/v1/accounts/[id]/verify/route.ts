import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { verifyKripicardAccount } from "@/server/providers/kripicard/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "accounts.manage");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "account id");
    return verifyKripicardAccount(id, session, request, requestId);
  });
}
