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
      payment_id: string | null;
      payment_reference: string | null;
      payment_record_status: string | null;
      rate_rial_per_usd: string | null;
      customer_pays_rial: string | null;
    }>(
      `SELECT u.id,(u.payment_declared_at IS NOT NULL) AS declared,u.payment_status AS status,
              (u.payment_receipt_object_key IS NOT NULL) AS has_receipt,u.payment_receipt_mime AS receipt_mime,
              u.payment_receipt_at AS receipt_at,u.payment_amount_usd_cents::text AS amount_usd_cents,
              cp.id AS payment_id,cp.reference AS payment_reference,cp.status AS payment_record_status,
              cp.rate_rial_per_usd::text AS rate_rial_per_usd,cp.customer_pays_rial::text AS customer_pays_rial
         FROM telegram_users u
         LEFT JOIN customer_payments cp ON cp.id=u.first_card_payment_id`,
    );
    return { items: result.rows.map((row) => ({
      id: row.id,
      declared: row.declared,
      status: row.status,
      hasReceipt: row.has_receipt,
      receiptMime: row.receipt_mime,
      receiptAt: row.receipt_at?.toISOString() ?? null,
      amountUsdCents: row.amount_usd_cents,
      paymentId: row.payment_id,
      paymentReference: row.payment_reference,
      paymentRecordStatus: row.payment_record_status,
      rateRialPerUsd: row.rate_rial_per_usd,
      customerPaysRial: row.customer_pays_rial,
    })) };
  });
}
