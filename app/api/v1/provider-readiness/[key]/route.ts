import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { apiRoute } from "@/server/http/api";
import { providerReadinessUpdateSchema, updateProviderReadiness } from "@/server/providers/kripicard/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "provider.readiness.manage");
    requireCsrf(request, session);
    const { key } = await context.params;
    const input = providerReadinessUpdateSchema.parse(await request.json());
    return updateProviderReadiness({ key, ...input, session, request, requestId });
  });
}
