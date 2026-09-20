import { z } from "zod";
import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, requireCsrf, auditAdminEvent } from "@/server/auth/service";
import { getPool, withTransaction } from "@/server/database/pool";
import { requireUuid } from "@/server/http/ids";
import { randomToken } from "@/server/security/crypto";
import { deletePrivateSupportAttachment, storePrivateSupportAttachment } from "@/server/support/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "messaging.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "client id");
    return withTransaction(async (db) => {
      const result = await db.query<{
        id: string; direction: string; text_body: string | null; status: string; created_at: Date; delivered_at: Date | null;
        last_delivery_error: string | null; attachment_id: string | null; original_filename: string | null;
        detected_mime_type: string | null; size_bytes: string | null; scan_status: string | null;
      }>(
        `SELECT m.id,m.direction,m.text_body,m.status,m.created_at,m.delivered_at,m.last_delivery_error,
                sa.id AS attachment_id,sa.original_filename,sa.detected_mime_type,sa.size_bytes::text,sa.scan_status
           FROM conversations c
           JOIN messages m ON m.conversation_id=c.id
           LEFT JOIN support_attachments sa ON sa.message_id=m.id
          WHERE c.user_id=$1::uuid
          ORDER BY m.created_at ASC,m.id ASC LIMIT 500`,
        [id],
      );
      await db.query(
        `UPDATE conversations SET unread_admin_count=0,last_admin_read_at=now(),updated_at=now() WHERE user_id=$1::uuid`,
        [id],
      );
      return {
        items: result.rows.map((row) => ({
          id: row.id,
          direction: row.direction,
          text: row.text_body ?? "",
          status: row.status,
          createdAt: row.created_at.toISOString(),
          deliveredAt: row.delivered_at?.toISOString() ?? null,
          lastDeliveryError: row.last_delivery_error,
          attachment: row.attachment_id ? {
            id: row.attachment_id,
            filename: row.original_filename ?? "attachment",
            mimeType: row.detected_mime_type,
            sizeBytes: row.size_bytes,
            scanStatus: row.scan_status,
            downloadUrl: `/api/v1/messages/${encodeURIComponent(row.id)}/attachment`,
          } : null,
        })),
      };
    });
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "messaging.send");
    requireCsrf(request, session);
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "client id");
    const user = await getPool().query<{ banned_at: Date | null }>(`SELECT banned_at FROM telegram_users WHERE id=$1::uuid`, [id]);
    if (!user.rows[0]) throw new ApiError(404, "not_found", "Telegram client not found.");
    if (user.rows[0].banned_at) throw new ApiError(409, "client_banned", "This Telegram client is banned.");

    const contentType = request.headers.get("content-type") ?? "";
    let text = "";
    let file: File | null = null;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      text = String(form.get("text") ?? "").trim();
      const candidate = form.get("attachment");
      if (candidate instanceof File && candidate.size > 0) file = candidate;
    } else {
      const input = z.object({ text: z.string().trim().min(1).max(4000) }).parse(await request.json());
      text = input.text;
    }
    if (!text && !file) throw new ApiError(400, "message_empty", "Write a message or attach a file.");
    if (text.length > (file ? 900 : 4000)) throw new ApiError(400, "message_too_long", file ? "Messages with attachments are limited to 900 characters." : "Messages are limited to 4000 characters.");

    const conversation = await getPool().query<{ id: string }>(
      `INSERT INTO conversations(user_id,status,assigned_admin_id,closed_at,updated_at)
       VALUES ($1::uuid,'open',$2::uuid,NULL,now())
       ON CONFLICT (user_id) DO UPDATE SET status='open',closed_at=NULL,assigned_admin_id=COALESCE(conversations.assigned_admin_id,$2::uuid),updated_at=now()
       RETURNING id`,
      [id, session.principal.id],
    );
    const conversationId = conversation.rows[0]!.id;
    let stored: Awaited<ReturnType<typeof storePrivateSupportAttachment>> | null = null;
    if (file) {
      stored = await storePrivateSupportAttachment({
        conversationId,
        bytes: Buffer.from(await file.arrayBuffer()),
        originalFilename: file.name,
        declaredMimeType: file.type,
      });
    }

    try {
      const messageId = await withTransaction(async (db) => {
        const sendKey = `support:${randomToken(18)}`;
        const message = await db.query<{ id: string }>(
          `INSERT INTO messages(conversation_id,direction,actor_admin_id,text_body,idempotent_send_key,status)
           VALUES ($1::uuid,'admin_to_client',$2::uuid,NULLIF($3,''),$4,'pending') RETURNING id`,
          [conversationId, session.principal.id, text, sendKey],
        );
        const newId = message.rows[0]!.id;
        if (stored) {
          await db.query(
            `INSERT INTO support_attachments(message_id,object_key,original_filename,declared_mime_type,detected_mime_type,size_bytes,sha256_hex,scan_status,scan_engine,scan_note)
             VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [newId, stored.objectKey, stored.originalFilename, stored.declaredMimeType, stored.detectedMimeType, stored.sizeBytes, stored.sha256Hex, stored.scanStatus, stored.scanEngine, stored.scanNote],
          );
        }
        await db.query(
          `INSERT INTO outbox_events(topic,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
           VALUES ('telegram','message',$1,'support.admin_message',$2::jsonb,$3)`,
          [newId, JSON.stringify({ messageId: newId, userId: id }), sendKey],
        );
        await db.query(
          `UPDATE conversations SET last_message_at=now(),updated_at=now(),unread_admin_count=0,last_admin_read_at=now() WHERE id=$1::uuid`,
          [conversationId],
        );
        await db.query(
          `INSERT INTO conversation_events(conversation_id,actor_type,actor_id,event_type,metadata_redacted)
           VALUES ($1::uuid,'admin',$2::uuid,'message.queued',$3::jsonb)`,
          [conversationId, session.principal.id, JSON.stringify({ messageId: newId, attachment: Boolean(stored) })],
        );
        return newId;
      });
      await auditAdminEvent({ adminId: session.principal.id, action: "telegram.support.message_queued", entityType: "message", entityId: messageId, request, requestId, metadata: { userId: id, attachment: Boolean(stored) } });
      return { id: messageId, queued: true };
    } catch (error) {
      if (stored) await deletePrivateSupportAttachment(stored.objectKey).catch(() => {});
      throw error;
    }
  });
}
