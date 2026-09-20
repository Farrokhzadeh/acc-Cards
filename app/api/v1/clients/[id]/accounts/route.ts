import { z } from "zod";
import { requireAdmin, requireCsrf } from "@/server/auth/service";
import { assignAccount, listAssignableAccounts, replaceClientAccounts, unassignAllAccounts } from "@/server/clients/assignments";
import { apiRoute } from "@/server/http/api";
import { requireUuid } from "@/server/http/ids";
import { requestIp } from "@/server/auth/request-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const replaceSchema = z.object({
  accountIds: z.array(z.string().uuid()).max(100),
});
const assignSchema = z.object({
  accountId: z.string().uuid(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "clients.read");
    const { id: rawId } = await context.params;
    const clientId = requireUuid(rawId, "client id");
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? "";
    const parsedLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    return { items: await listAssignableAccounts(clientId, search, limit) };
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const clientId = requireUuid(rawId, "client id");
    const input = assignSchema.parse(await request.json());
    return assignAccount({ clientId, accountId: input.accountId, adminId: session.principal.id, requestId, ip: requestIp(request) });
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const clientId = requireUuid(rawId, "client id");
    const input = replaceSchema.parse(await request.json());
    return replaceClientAccounts({ clientId, accountIds: input.accountIds, adminId: session.principal.id, requestId, ip: requestIp(request) });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const clientId = requireUuid(rawId, "client id");
    return unassignAllAccounts({ clientId, adminId: session.principal.id, requestId, ip: requestIp(request) });
  });
}
