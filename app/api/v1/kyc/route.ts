import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { parsePageRequest } from "@/server/http/query";
import { listKycSubmissions } from "@/server/kyc/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "kyc.read");
    const page = parsePageRequest(request);
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    const result = await listKycSubmissions({ ...page, status });
    return { items: result.items, nextCursor: result.nextCursor ?? null };
  });
}
