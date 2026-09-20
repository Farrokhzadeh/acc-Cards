import { requireAdmin } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { listCardRequests } from "@/server/card-requests/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "card_requests.read");
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
    const status = url.searchParams.get("status");
    return listCardRequests({
      search: url.searchParams.get("search") ?? "",
      status: status && status !== "all" ? status : null,
      limit,
      cursor: url.searchParams.get("cursor"),
    });
  });
}
