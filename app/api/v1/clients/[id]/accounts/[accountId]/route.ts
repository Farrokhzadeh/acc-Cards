import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { assignAccount, unassignAccount } from "@/server/clients/assignments";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { requestIp } from "@/server/auth/request-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string; accountId: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    const params = await context.params;
    return assignAccount({
      clientId: requireUuid(params.id, "client id"),
      accountId: requireUuid(params.accountId, "account id"),
      adminId: session.principal.id,
      requestId,
      ip: requestIp(request),
    });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; accountId: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    const params = await context.params;
    return unassignAccount({
      clientId: requireUuid(params.id, "client id"),
      accountId: requireUuid(params.accountId, "account id"),
      adminId: session.principal.id,
      requestId,
      ip: requestIp(request),
    });
  });
}
