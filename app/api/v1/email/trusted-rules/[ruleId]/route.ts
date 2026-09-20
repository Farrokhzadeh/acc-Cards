import { z } from "zod";
import { apiRoute } from "@/server/http/api";
import { auditAdminEvent, requireAdmin, requireCsrf } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getPool } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ ruleId: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "inbox.rules.manage");
    requireCsrf(request, session);
    const { ruleId: rawId } = await context.params;
    const ruleId = requireUuid(rawId, "trusted rule id");
    const input = patchSchema.parse(await request.json());
    const result = await getPool().query<{ label: string }>(
      `UPDATE email_trusted_rules SET enabled = $2, updated_at = now() WHERE id = $1::uuid RETURNING label`,
      [ruleId, input.enabled],
    );
    if (!result.rowCount) throw new ApiError(404, "not_found", "Trusted email rule not found.");
    await auditAdminEvent({ adminId: session.principal.id, action: input.enabled ? "email.trusted_rule.enabled" : "email.trusted_rule.disabled", entityType: "email_trusted_rule", entityId: ruleId, request, requestId, metadata: { label: result.rows[0].label } });
    return { ok: true };
  });
}
