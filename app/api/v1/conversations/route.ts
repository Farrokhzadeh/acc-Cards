import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { getPool } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "messaging.read");
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 120);
    const status = (url.searchParams.get("status") ?? "").trim();
    const result = await getPool().query<{
      id: string; user_id: string; status: string; assigned_admin_id: string | null; assigned_admin_name: string | null;
      unread_admin_count: number; unread_client_count: number; last_message_at: Date | null; updated_at: Date;
      display_name: string | null; username: string | null; telegram_user_id: string | bigint; banned_at: Date | null;
      last_text: string | null; last_direction: string | null; last_status: string | null;
    }>(
      `SELECT c.id,c.user_id,c.status,c.assigned_admin_id,a.display_name AS assigned_admin_name,
              c.unread_admin_count,c.unread_client_count,c.last_message_at,c.updated_at,
              tu.display_name,tu.username,tu.telegram_user_id,tu.banned_at,
              lm.text_body AS last_text,lm.direction AS last_direction,lm.status AS last_status
         FROM conversations c
         JOIN telegram_users tu ON tu.id=c.user_id
         LEFT JOIN admins a ON a.id=c.assigned_admin_id
         LEFT JOIN LATERAL (
           SELECT m.text_body,m.direction,m.status FROM messages m
            WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1
         ) lm ON true
        WHERE ($1='' OR c.status=$1)
          AND ($2='' OR COALESCE(tu.display_name,'') ILIKE '%'||$2||'%' OR COALESCE(tu.username,'') ILIKE '%'||$2||'%' OR tu.telegram_user_id::text ILIKE '%'||$2||'%' OR COALESCE(lm.text_body,'') ILIKE '%'||$2||'%')
        ORDER BY c.unread_admin_count DESC,c.last_message_at DESC NULLS LAST,c.updated_at DESC
        LIMIT 200`,
      [status, search],
    );
    return { items: result.rows.map((row) => ({
      id: row.id, userId: row.user_id, status: row.status, assignedAdminId: row.assigned_admin_id,
      assignedAdminName: row.assigned_admin_name, unreadAdminCount: row.unread_admin_count,
      unreadClientCount: row.unread_client_count, lastMessageAt: row.last_message_at?.toISOString() ?? null,
      client: { displayName: row.display_name, username: row.username, telegramUserId: String(row.telegram_user_id), banned: Boolean(row.banned_at) },
      lastMessage: row.last_text ? { text: row.last_text, direction: row.last_direction, status: row.last_status } : null,
    })) };
  });
}
