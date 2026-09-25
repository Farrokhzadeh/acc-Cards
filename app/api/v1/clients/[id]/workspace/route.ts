import { requireAdmin } from "@/server/auth/service";
import { getClientWorkspace } from "@/server/clients/workspace";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "dashboard.read");
    const { id } = await context.params;
    return getClientWorkspace(requireUuid(id, "client id"));
  });
}
