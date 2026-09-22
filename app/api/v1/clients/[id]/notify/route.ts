import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getPool } from "@/server/database/pool";
import { randomToken } from "@/server/security/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    requireCsrf(request, session);
    const { id } = await context.params;
    const userId = requireUuid(id, "client id");
    const exists = await getPool().query<{ id: string }>(`SELECT id FROM telegram_users WHERE id = $1::uuid`, [userId]);
    if (!exists.rows[0]) throw new ApiError(404, "not_found", "Client not found.");
    await getPool().query(
      `INSERT INTO outbox_events(topic, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status, available_at)
       VALUES ('telegram', 'telegram_user', $1, 'client.notify', $2::jsonb, $3, 'pending', now())`,
      [userId, JSON.stringify({ userId }), `client-notify:${userId}:${randomToken(8)}`],
    );
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "client.notify",
      entityType: "telegram_user",
      entityId: userId,
      request,
      requestId,
    });
    return { ok: true as const };
  });
}
