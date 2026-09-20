import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { withTransaction } from "@/server/database/pool";
import { requireUuid } from "@/server/http/ids";
import { randomToken } from "@/server/security/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "messaging.retry");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "message id");
    await withTransaction(async (db) => {
      const result = await db.query<{ status: string; direction: string; user_id: string; banned_at: Date | null }>(
        `SELECT m.status,m.direction,c.user_id,tu.banned_at FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN telegram_users tu ON tu.id=c.user_id WHERE m.id=$1::uuid FOR UPDATE OF m`,
        [id],
      );
      const row = result.rows[0];
      if (!row) throw new ApiError(404, "not_found", "Message not found.");
      if (row.direction !== "admin_to_client") throw new ApiError(409, "not_outbound", "Only admin-to-client messages can be retried.");
      if (row.status !== "failed") throw new ApiError(409, "not_failed", "Only failed support messages can be retried.");
      if (row.banned_at) throw new ApiError(409, "client_banned", "The Telegram client is banned.");
      const key = `support-retry:${id}:${randomToken(10)}`;
      await db.query(`UPDATE messages SET status='pending',failed_at=NULL,last_delivery_error=NULL WHERE id=$1::uuid`, [id]);
      await db.query(
        `INSERT INTO outbox_events(topic,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
         VALUES ('telegram','message',$1,'support.admin_message',$2::jsonb,$3)`,
        [id, JSON.stringify({ messageId: id, userId: row.user_id }), key],
      );
      await db.query(
        `INSERT INTO conversation_events(conversation_id,actor_type,actor_id,event_type,metadata_redacted)
         SELECT conversation_id,'admin',$2::uuid,'message.retry_queued',$3::jsonb FROM messages WHERE id=$1::uuid`,
        [id, session.principal.id, JSON.stringify({ messageId: id })],
      );
    });
    await auditAdminEvent({ adminId: session.principal.id, action: "telegram.support.message_retry_queued", entityType: "message", entityId: id, request, requestId });
    return { queued: true };
  });
}
