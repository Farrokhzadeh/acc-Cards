import { z } from "zod";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { withTransaction } from "@/server/database/pool";
import { requireUuid } from "@/server/http/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "messaging.manage");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "conversation id");
    const input = z.object({
      status: z.enum(["open","pending","closed"]).optional(),
      assignedAdminId: z.string().uuid().nullable().optional(),
    }).refine((value: { status?: "open" | "pending" | "closed"; assignedAdminId?: string | null }) => value.status !== undefined || value.assignedAdminId !== undefined, "No conversation change supplied.").parse(await request.json());

    const result = await withTransaction(async (db) => {
      const current = await db.query<{ status: string; assigned_admin_id: string | null }>(`SELECT status,assigned_admin_id FROM conversations WHERE id=$1::uuid FOR UPDATE`, [id]);
      if (!current.rows[0]) throw new ApiError(404, "not_found", "Conversation not found.");
      if (input.assignedAdminId) {
        const admin = await db.query(`SELECT 1 FROM admins WHERE id=$1::uuid AND disabled_at IS NULL`, [input.assignedAdminId]);
        if (!admin.rows[0]) throw new ApiError(400, "invalid_assignee", "The selected admin is not active.");
      }
      const nextStatus = input.status ?? current.rows[0].status;
      const nextAssigned = input.assignedAdminId === undefined ? current.rows[0].assigned_admin_id : input.assignedAdminId;
      await db.query(
        `UPDATE conversations SET status=$2,assigned_admin_id=$3::uuid,closed_at=CASE WHEN $2='closed' THEN COALESCE(closed_at,now()) ELSE NULL END,updated_at=now() WHERE id=$1::uuid`,
        [id, nextStatus, nextAssigned],
      );
      await db.query(
        `INSERT INTO conversation_events(conversation_id,actor_type,actor_id,event_type,metadata_redacted)
         VALUES ($1::uuid,'admin',$2::uuid,'conversation.updated',$3::jsonb)`,
        [id, session.principal.id, JSON.stringify({ fromStatus: current.rows[0].status, toStatus: nextStatus, fromAssignedAdminId: current.rows[0].assigned_admin_id, toAssignedAdminId: nextAssigned })],
      );
      return { status: nextStatus, assignedAdminId: nextAssigned };
    });
    await auditAdminEvent({ adminId: session.principal.id, action: "support.conversation.updated", entityType: "conversation", entityId: id, request, requestId, metadata: result });
    return result;
  });
}
