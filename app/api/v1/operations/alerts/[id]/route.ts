import { z } from "zod";
import { auditAdminEvent, requireAdmin, requireCsrf } from "@/server/auth/service";
import { ApiError, apiRoute } from "@/server/http/api";
import { updateOperationalAlert } from "@/server/operations/service";

const schema = z.object({ action: z.enum(["acknowledge", "resolve"]) });
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "operations.manage");
    requireCsrf(request, session);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const result = await updateOperationalAlert(id, input.action, session.principal.id);
    if (!result) throw new ApiError(404, "not_found", "Operational alert was not found.");
    await auditAdminEvent({ adminId:session.principal.id, action:`operations.alert.${input.action}`, entityType:"operational_alert", entityId:id, request, requestId, metadata:{ alertKey:result.alert_key } });
    return result;
  });
}
