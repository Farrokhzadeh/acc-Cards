import { requireAdmin } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { listFundingRequests } from "@/server/funding/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "funding.read");
    const url = new URL(request.url);
    const raw = Number(url.searchParams.get("limit") ?? "50");
    return listFundingRequests({
      search: url.searchParams.get("search") ?? "",
      status: url.searchParams.get("status") && url.searchParams.get("status") !== "all" ? url.searchParams.get("status") : null,
      limit: Number.isFinite(raw) ? raw : 50,
      cursor: url.searchParams.get("cursor"),
    });
  });
}
