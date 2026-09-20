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
    await requireAdmin(request, "clients.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "client id");
    const uow = getUnitOfWork();
    const client = await uow.telegramUsers.findById(id);
    if (!client) throw new ApiError(404, "not_found", "Client not found.");
    const result = await uow.cards.listForTelegramUser(id, parsePageRequest(request));
    return { items: result.items.map(serializeCard), nextCursor: result.nextCursor ?? null };
  });
}
