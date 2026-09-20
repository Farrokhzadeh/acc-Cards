import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, auditAdminEvent } from "@/server/auth/service";
import { getPool } from "@/server/database/pool";
import { requireUuid } from "@/server/http/ids";
import { readPrivateSupportAttachment, sanitizeSupportFilename } from "@/server/support/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "messaging.read");
    const { id: rawId } = await context.params;
    const id = requireUuid(rawId, "message id");
    const result = await getPool().query<{ object_key: string; original_filename: string | null; detected_mime_type: string }>(
      `SELECT object_key,original_filename,detected_mime_type FROM support_attachments WHERE message_id=$1::uuid AND scan_status='clean'`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "not_found", "Support attachment not found.");
    const bytes = await readPrivateSupportAttachment(row.object_key);
    const filename = sanitizeSupportFilename(row.original_filename) ?? "attachment";
    await auditAdminEvent({ adminId: session.principal.id, action: "support.attachment.downloaded", entityType: "message", entityId: id, request, requestId, metadata: { mimeType: row.detected_mime_type, sizeBytes: bytes.length } });
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": row.detected_mime_type,
        "content-length": String(bytes.length),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
