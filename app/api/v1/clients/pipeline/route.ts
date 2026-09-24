import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { getPool } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return apiRoute(request, async () => {
    await requireAdmin(request);
    const result = await getPool().query<{
      id: string;
      declared: boolean;
      status: string | null;
      has_receipt: boolean;
      receipt_mime: string | null;
      receipt_at: Date | null;
      amount_usd_cents: string | null;
    }>(
      `SELECT id,(payment_declared_at IS NOT NULL) AS declared,payment_status AS status,
              (payment_receipt_object_key IS NOT NULL) AS has_receipt,payment_receipt_mime AS receipt_mime,
              payment_receipt_at AS receipt_at,payment_amount_usd_cents::text AS amount_usd_cents
         FROM telegram_users`,
    );
    return { items: result.rows.map((row) => ({
      id: row.id,
      declared: row.declared,
      status: row.status,
      hasReceipt: row.has_receipt,
      receiptMime: row.receipt_mime,
      receiptAt: row.receipt_at?.toISOString() ?? null,
      amountUsdCents: row.amount_usd_cents,
    })) };
  });
}
