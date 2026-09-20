import { requireAdmin } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { getProviderReadiness } from "@/server/providers/kripicard/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "provider.readiness.read");
    return getProviderReadiness();
  });
}
