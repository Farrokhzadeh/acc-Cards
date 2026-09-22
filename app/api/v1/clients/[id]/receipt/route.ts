import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, auditAdminEvent } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getPool } from "@/server/database/pool";
import { readPrivateSupportAttachment } from "@/server/support/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    const { id } = await context.params;
    const userId = requireUuid(id, "client id");
    const result = await getPool().query<{ object_key: string; mime: string | null }>(
      `SELECT payment_receipt_object_key AS object_key, payment_receipt_mime AS mime
         FROM telegram_users WHERE id = $1::uuid AND payment_receipt_object_key IS NOT NULL`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "not_found", "No payment receipt on file.");
    const bytes = await readPrivateSupportAttachment(row.object_key);
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "client.receipt.viewed",
      entityType: "telegram_user",
      entityId: userId,
      request,
      requestId,
    });
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": row.mime || "application/octet-stream",
        "content-length": String(bytes.length),
        "content-disposition": `inline; filename*=UTF-8''payment-receipt`,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
