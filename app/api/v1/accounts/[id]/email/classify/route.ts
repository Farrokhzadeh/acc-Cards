import { apiRoute } from "@/server/http/api";
import { auditAdminEvent, requireAdmin, requireCsrf } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { classifyPendingEmailMessages } from "@/server/email/classifier";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "inbox.manage");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const accountId = requireUuid(rawId, "account id");
    const result = await classifyPendingEmailMessages({ accountId, limit: 200 });
    await auditAdminEvent({ adminId: session.principal.id, action: "email.classification.manual", entityType: "kripi_account", entityId: accountId, request, requestId, metadata: result });
    return result;
  });
}
