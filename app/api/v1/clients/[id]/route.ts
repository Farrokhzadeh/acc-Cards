import { z } from "zod";
import { ApiError, apiRoute } from "@/server/http/api";
import { auditAdminEvent, requireAdmin, requireCsrf } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { serializeClient } from "@/server/http/serializers";
import { getUnitOfWork } from "@/server/repositories/postgres";
import { getPool } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "clients.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "client id");
    const client = await getUnitOfWork().telegramUsers.findSummaryById(id);
    if (!client) throw new ApiError(404, "not_found", "Client not found.");
    return serializeClient(client);
  });
}


const moderationSchema = z.object({ banned: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "client id");
    const input = moderationSchema.parse(await request.json());
    const result = await getPool().query<{ banned_at: Date | null }>(
      `UPDATE telegram_users
          SET banned_at = CASE WHEN $2::boolean THEN COALESCE(banned_at, now()) ELSE NULL END,
              updated_at = now()
        WHERE id = $1::uuid
        RETURNING banned_at`,
      [id, input.banned],
    );
    if (!result.rowCount) throw new ApiError(404, "not_found", "Client not found.");
    await auditAdminEvent({
      adminId: session.principal.id,
      action: input.banned ? "client.ban" : "client.unban",
      entityType: "telegram_user",
      entityId: id,
      request,
      requestId,
    });
    return { banned: Boolean(result.rows[0]?.banned_at), bannedAt: result.rows[0]?.banned_at?.toISOString() ?? null };
  });
}
