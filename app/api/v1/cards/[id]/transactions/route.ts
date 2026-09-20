import { apiRoute } from "@/server/http/api";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { listStoredCardTransactions, syncKripicardCardTransactions } from "@/server/providers/kripicard/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "cards.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "card id");
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "100");
    return { items: await listStoredCardTransactions(id, Number.isFinite(limit) ? limit : 100) };
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "cards.read");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "card id");
    return syncKripicardCardTransactions(id, session, request, requestId);
  });
}
