import { ApiError, apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { parsePageRequest } from "@/server/http/query";
import { serializeCard } from "@/server/http/serializers";
import { getUnitOfWork } from "@/server/repositories/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "cards.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "account id");
    const uow = getUnitOfWork();
    const account = await uow.accounts.findById(id);
    if (!account) throw new ApiError(404, "not_found", "Account not found.");
    const result = await uow.cards.listForAccount(id, parsePageRequest(request));
    return { items: result.items.map(serializeCard), nextCursor: result.nextCursor ?? null };
  });
}
