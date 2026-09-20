import { z } from "zod";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { getPool } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({
  chatId: z.string().trim().min(2).max(128),
  title: z.string().trim().min(1).max(120).optional(),
  inviteUrl: z.string().url().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
});

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "telegram.manage");
    const result = await getPool().query(
      `SELECT id, chat_id, title, invite_url, enabled, sort_order, created_at, updated_at
         FROM force_join_channels ORDER BY sort_order ASC, created_at ASC`,
    );
    return { items: result.rows.map((row) => ({ id: row.id, chatId: row.chat_id, title: row.title, inviteUrl: row.invite_url, enabled: row.enabled, sortOrder: row.sort_order })) };
  });
}

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "telegram.manage");
    requireCsrf(request, session);
    const input = inputSchema.parse(await request.json());
    const title = input.title ?? (input.chatId.startsWith("@") ? input.chatId : `Channel ${input.chatId}`);
    const result = await getPool().query<{ id: string }>(
      `INSERT INTO force_join_channels(chat_id, title, invite_url, enabled, created_by)
       VALUES ($1,$2,$3,$4,$5::uuid)
       ON CONFLICT (chat_id) DO UPDATE SET title=EXCLUDED.title, invite_url=EXCLUDED.invite_url, enabled=EXCLUDED.enabled, updated_at=now()
       RETURNING id`,
      [input.chatId, title, input.inviteUrl ?? null, input.enabled ?? true, session.principal.id],
    );
    await auditAdminEvent({ adminId: session.principal.id, action: "telegram.force_join.upsert", entityType: "force_join_channel", entityId: result.rows[0]!.id, request, requestId, metadata: { chatId: input.chatId, enabled: input.enabled ?? true } });
    return { id: result.rows[0]!.id };
  });
}

export async function DELETE(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "telegram.manage");
    requireCsrf(request, session);
    const input = z.object({ chatId: z.string().trim().min(2).max(128) }).parse(await request.json());
    const result = await getPool().query<{ id: string }>(`DELETE FROM force_join_channels WHERE chat_id=$1 RETURNING id`, [input.chatId]);
    if (!result.rows[0]) throw new ApiError(404, "not_found", "Required channel not found.");
    await auditAdminEvent({ adminId: session.principal.id, action: "telegram.force_join.delete", entityType: "force_join_channel", entityId: result.rows[0].id, request, requestId, metadata: { chatId: input.chatId } });
    return { deleted: true };
  });
}
