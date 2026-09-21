import { apiRoute } from "@/server/http/api";
import { requireAdmin } from "@/server/auth/service";
import { requireUuid } from "@/server/http/ids";
import { getPool } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Latest KYC submission for a client (for the client detail sheet).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async () => {
    await requireAdmin(request, "kyc.read");
    const { id } = await context.params;
    const userId = requireUuid(id, "client id");
    const result = await getPool().query<{
      id: string; status: string; full_name: string; date_of_birth: string | null; country: string;
      national_id: string; phone: string; document_object_key: string | null; document_mime_type: string | null;
      review_note: string | null; submitted_at: Date;
    }>(
      `SELECT id, status, full_name, date_of_birth, country, national_id, phone,
              document_object_key, document_mime_type, review_note, submitted_at
         FROM kyc_submissions
        WHERE telegram_user_id = $1::uuid
        ORDER BY (status = 'approved') DESC, submitted_at DESC
        LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    const payment = await getPool().query<{
      declared_at: Date | null; receipt_key: string | null; receipt_mime: string | null; receipt_at: Date | null; amount_cents: string | null; payment_status: string | null;
    }>(
      `SELECT payment_declared_at AS declared_at, payment_receipt_object_key AS receipt_key,
              payment_receipt_mime AS receipt_mime, payment_receipt_at AS receipt_at,
              payment_amount_usd_cents::text AS amount_cents, payment_status
         FROM telegram_users WHERE id = $1::uuid`,
      [userId],
    );
    const p = payment.rows[0];
    const paymentObj = p ? { declaredAt: p.declared_at ? p.declared_at.toISOString() : null, hasReceipt: Boolean(p.receipt_key), receiptMime: p.receipt_mime, receiptAt: p.receipt_at ? p.receipt_at.toISOString() : null, amountUsdCents: p.amount_cents ?? null, status: p.payment_status ?? null } : null;
    if (!row) return { kyc: null, payment: paymentObj };
    return {
      kyc: {
        id: row.id,
        status: row.status,
        fullName: row.full_name,
        dateOfBirth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null,
        country: row.country,
        nationalId: row.national_id,
        phone: row.phone,
        hasDocument: Boolean(row.document_object_key),
        documentMimeType: row.document_mime_type,
        reviewNote: row.review_note,
        submittedAt: row.submitted_at.toISOString(),
      },
      payment: paymentObj,
    };
  });
}
