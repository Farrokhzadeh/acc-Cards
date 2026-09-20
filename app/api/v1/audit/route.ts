import { requireAdmin } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { listAuditLog } from "@/server/operations/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "audit.read");
    const url = new URL(request.url);
    return listAuditLog(Number(url.searchParams.get("limit") ?? 100));
  });
}
