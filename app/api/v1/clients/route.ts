import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { parsePageRequest } from "@/server/http/query";
import { serializeClient } from "@/server/http/serializers";
import { getUnitOfWork } from "@/server/repositories/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "clients.read");
    const result = await getUnitOfWork().telegramUsers.list(parsePageRequest(request));
    return { items: result.items.map(serializeClient), nextCursor: result.nextCursor ?? null };
  });
}
