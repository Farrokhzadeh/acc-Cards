import { z } from "zod";
import { auditAdminEvent, requireAdmin, requireCsrf, requireRecentReauthentication } from "@/server/auth/service";
import { ApiError, apiRoute } from "@/server/http/api";
import { runtimeControlKeys, updateRuntimeControl, type RuntimeControlKey } from "@/server/operations/controls";

const schema = z.object({ enabled: z.boolean(), reason: z.string().trim().min(3).max(500) });

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "operations.controls.manage");
    requireCsrf(request, session);
    requireRecentReauthentication(session);
    const { key } = await context.params;
    if (!runtimeControlKeys.includes(key as RuntimeControlKey)) throw new ApiError(404, "not_found", "Runtime control was not found.");
    const input = schema.parse(await request.json());
    const result = await updateRuntimeControl(key as RuntimeControlKey, input.enabled, input.reason, session.principal.id);
    if (!result) throw new ApiError(404, "not_found", "Runtime control was not found.");
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "operations.control.update",
      entityType: "runtime_control",
      entityId: key,
      request,
      requestId,
      metadata: { enabled: input.enabled, effectiveEnabled: result.effectiveEnabled, reason: input.reason },
    });
    return result;
  });
}
