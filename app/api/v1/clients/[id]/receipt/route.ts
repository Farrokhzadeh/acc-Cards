import { apiRoute, ApiError } from "@/server/http/api";
import { requireAdmin, auditAdminEvent } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getPool } from "@/server/database/pool";
import { getCustomerPaymentReceiptForAdmin } from "@/server/payments/receipts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const session = await requireAdmin(request, "clients.assign");
    const { id } = await context.params;
    const userId = requireUuid(id, "client id");
    const result = await getPool().query<{ first_card_payment_id: string | null }>(
      `SELECT first_card_payment_id FROM telegram_users WHERE id = $1::uuid`,
      [userId],
    );
    const paymentId = result.rows[0]?.first_card_payment_id;
    if (!paymentId) throw new ApiError(404, "not_found", "No first-card payment receipt is linked to this customer.");
    const receipt = await getCustomerPaymentReceiptForAdmin(paymentId);
    const bytes = receipt.bytes;
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
        "content-type": receipt.mimeType || "application/octet-stream",
        "content-length": String(bytes.length),
        "content-disposition": `inline; filename*=UTF-8''payment-receipt`,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
