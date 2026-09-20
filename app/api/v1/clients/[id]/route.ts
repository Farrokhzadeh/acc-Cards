import { ApiError, apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { serializeClient } from "@/server/http/serializers";
import { getUnitOfWork } from "@/server/repositories/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "clients.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "client id");
    const client = await getUnitOfWork().telegramUsers.findSummaryById(id);
    if (!client) throw new ApiError(404, "not_found", "Client not found.");
    return serializeClient(client);
  });
}
