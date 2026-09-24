import { z } from "zod";
import { getPool, withTransaction, type DatabaseQueryable } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";

export type CustomerPaymentPurpose = "first_card" | "additional_card" | "card_funding";
export type CustomerPaymentStatus = "pending_receipt" | "pending_review" | "correction_needed" | "accepted" | "rejected" | "completed" | "cancelled";

type PaymentRow = {
  id: string;
  reference: string;
  user_id: string;
  purpose: CustomerPaymentPurpose;
  card_request_id: string | null;
  funding_request_id: string | null;
  card_id: string | null;
  amount_usd_cents: string | bigint;
  provider_fee_usd_cents: string | bigint;
  service_fee_usd_cents: string | bigint;
  customer_pays_usd_cents: string | bigint;
  rate_id: string;
  rate_rial_per_usd: string | bigint;
  customer_pays_rial: string | bigint;
  status: CustomerPaymentStatus;
  receipt_id: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function serialize(row: PaymentRow) {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    purpose: row.purpose,
    cardRequestId: row.card_request_id,
    fundingRequestId: row.funding_request_id,
    cardId: row.card_id,
    amountUsdCents: String(row.amount_usd_cents),
    providerFeeUsdCents: String(row.provider_fee_usd_cents),
    serviceFeeUsdCents: String(row.service_fee_usd_cents),
    customerPaysUsdCents: String(row.customer_pays_usd_cents),
    rateId: row.rate_id,
    rateRialPerUsd: String(row.rate_rial_per_usd),
    customerPaysRial: String(row.customer_pays_rial),
    status: row.status,
    receiptId: row.receipt_id,
    adminNote: row.admin_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rialFor(cents: bigint, rialPerUsd: bigint) {
  return (cents * rialPerUsd + 50n) / 100n;
}

export async function currentPaymentRate(db: DatabaseQueryable = getPool()) {
  const result = await db.query<{ id: string; rial_per_usd: string | bigint; source: string; effective_at: Date; expires_at: Date }>(
    `SELECT id,rial_per_usd,source,effective_at,expires_at
       FROM exchange_rates
      WHERE effective_at<=now() AND expires_at>now()
      ORDER BY effective_at DESC,created_at DESC
      LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(503, "payment_rate_unavailable", "Payments are temporarily unavailable because no current approved Rial/USD rate is configured.");
  return {
    id: row.id,
    rialPerUsd: String(row.rial_per_usd),
    source: row.source,
    effectiveAt: row.effective_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

export async function previewSimpleCustomerPayment(amountUsdCents: number) {
  if (!Number.isInteger(amountUsdCents) || amountUsdCents <= 0) {
    throw new ApiError(400, "invalid_amount", "Enter a valid payment amount.");
  }
  const rate = await currentPaymentRate();
  const customerPaysUsdCents = BigInt(amountUsdCents);
  return {
    amountUsdCents: String(amountUsdCents),
    providerFeeUsdCents: "0",
    serviceFeeUsdCents: "0",
    customerPaysUsdCents: customerPaysUsdCents.toString(),
    rateId: rate.id,
    rateRialPerUsd: rate.rialPerUsd,
    customerPaysRial: rialFor(customerPaysUsdCents, BigInt(rate.rialPerUsd)).toString(),
    rateSource: rate.source,
    rateExpiresAt: rate.expiresAt,
  };
}

export async function createCustomerPaymentInTransaction(db: DatabaseQueryable, input: {
  userId: string;
  purpose: CustomerPaymentPurpose;
  cardRequestId?: string | null;
  fundingRequestId?: string | null;
  cardId?: string | null;
  amountUsdCents: string | number | bigint;
  providerFeeUsdCents?: string | number | bigint;
  serviceFeeUsdCents?: string | number | bigint;
  rateId?: string | null;
  rateRialPerUsd?: string | number | bigint | null;
  customerPaysRial?: string | number | bigint | null;
}) {
  const amount = BigInt(input.amountUsdCents);
  const providerFee = BigInt(input.providerFeeUsdCents ?? 0);
  const serviceFee = BigInt(input.serviceFeeUsdCents ?? 0);
  if (amount <= 0n || providerFee < 0n || serviceFee < 0n) throw new ApiError(400, "invalid_amount", "Payment amounts are invalid.");
  const total = amount + providerFee + serviceFee;

  let rateId = input.rateId ?? null;
  let rateRialPerUsd = input.rateRialPerUsd == null ? null : BigInt(input.rateRialPerUsd);
  if (!rateId || !rateRialPerUsd) {
    const rate = await currentPaymentRate(db);
    rateId = rate.id;
    rateRialPerUsd = BigInt(rate.rialPerUsd);
  } else {
    const rate = await db.query<{ rial_per_usd: string | bigint }>(
      `SELECT rial_per_usd FROM exchange_rates WHERE id=$1::uuid`,
      [rateId],
    );
    if (!rate.rows[0] || BigInt(rate.rows[0].rial_per_usd) !== rateRialPerUsd) {
      throw new ApiError(409, "payment_rate_mismatch", "The payment exchange-rate snapshot does not match the stored rate.");
    }
  }

  const customerPaysRial = input.customerPaysRial == null
    ? rialFor(total, rateRialPerUsd)
    : BigInt(input.customerPaysRial);
  if (customerPaysRial <= 0n) throw new ApiError(400, "invalid_amount", "The Rial payment amount is invalid.");

  const existing = input.cardRequestId
    ? await db.query<PaymentRow>(`SELECT * FROM customer_payments WHERE card_request_id=$1::uuid LIMIT 1`, [input.cardRequestId])
    : input.fundingRequestId
      ? await db.query<PaymentRow>(`SELECT * FROM customer_payments WHERE funding_request_id=$1::uuid LIMIT 1`, [input.fundingRequestId])
      : { rows: [] as PaymentRow[] };
  if (existing.rows[0]) return serialize(existing.rows[0]);

  const inserted = await db.query<PaymentRow>(
    `INSERT INTO customer_payments(
       reference,user_id,purpose,card_request_id,funding_request_id,card_id,
       amount_usd_cents,provider_fee_usd_cents,service_fee_usd_cents,customer_pays_usd_cents,
       rate_id,rate_rial_per_usd,customer_pays_rial,status
     ) VALUES(
       'PAY-'||nextval('customer_payment_reference_seq')::text,$1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,
       $6,$7,$8,$9,$10::uuid,$11,$12,'pending_receipt'
     ) RETURNING *`,
    [
      input.userId,
      input.purpose,
      input.cardRequestId ?? null,
      input.fundingRequestId ?? null,
      input.cardId ?? null,
      amount.toString(),
      providerFee.toString(),
      serviceFee.toString(),
      total.toString(),
      rateId,
      rateRialPerUsd.toString(),
      customerPaysRial.toString(),
    ],
  );
  return serialize(inserted.rows[0]!);
}

export async function createFirstCardPayment(userId: string, amountUsdCents: number) {
  return withTransaction(async (db) => {
    const user = await db.query<{ id: string; payment_status: string | null; first_card_payment_id: string | null }>(
      `SELECT id,payment_status,first_card_payment_id FROM telegram_users WHERE id=$1::uuid FOR UPDATE`,
      [userId],
    );
    const row = user.rows[0];
    if (!row) throw new ApiError(404, "client_not_found", "Telegram client not found.");
    if (row.payment_status && row.payment_status !== "denied") {
      throw new ApiError(409, "invalid_state", "This first-card payment can no longer be changed.");
    }
    if (row.first_card_payment_id) {
      const old = await db.query<PaymentRow>(`SELECT * FROM customer_payments WHERE id=$1::uuid FOR UPDATE`, [row.first_card_payment_id]);
      const previous = old.rows[0];
      if (previous && ["pending_receipt","correction_needed","rejected"].includes(previous.status)) {
        await db.query(`UPDATE customer_payments SET status='cancelled',updated_at=now() WHERE id=$1::uuid`, [previous.id]);
      }
    }
    const rate = await currentPaymentRate(db);
    const amount = BigInt(amountUsdCents);
    const payment = await createCustomerPaymentInTransaction(db, {
      userId,
      purpose: "first_card",
      amountUsdCents: amount,
      rateId: rate.id,
      rateRialPerUsd: rate.rialPerUsd,
      customerPaysRial: rialFor(amount, BigInt(rate.rialPerUsd)),
    });
    await db.query(
      `UPDATE telegram_users
          SET first_card_payment_id=$2::uuid,payment_amount_usd_cents=$3,payment_declared_at=now(),
              payment_status=NULL,payment_receipt_object_key=NULL,payment_receipt_mime=NULL,payment_receipt_at=NULL,updated_at=now()
        WHERE id=$1::uuid`,
      [userId, payment.id, amountUsdCents],
    );
    return payment;
  });
}

export async function getCustomerPayment(paymentId: string, userId?: string | null) {
  const result = await getPool().query<PaymentRow>(
    `SELECT * FROM customer_payments WHERE id=$1::uuid AND ($2::uuid IS NULL OR user_id=$2::uuid)`,
    [paymentId, userId ?? null],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "payment_not_found", "Payment record not found.");
  return serialize(row);
}

export async function getPaymentForCardRequest(cardRequestId: string) {
  const result = await getPool().query<PaymentRow>(`SELECT * FROM customer_payments WHERE card_request_id=$1::uuid LIMIT 1`, [cardRequestId]);
  return result.rows[0] ? serialize(result.rows[0]) : null;
}

export async function getPaymentForFundingRequest(fundingRequestId: string) {
  const result = await getPool().query<PaymentRow>(`SELECT * FROM customer_payments WHERE funding_request_id=$1::uuid LIMIT 1`, [fundingRequestId]);
  return result.rows[0] ? serialize(result.rows[0]) : null;
}

export async function assertAcceptedFirstCardPayment(db: DatabaseQueryable, userId: string) {
  const result = await db.query<PaymentRow>(
    `SELECT cp.*
       FROM telegram_users tu
       JOIN customer_payments cp ON cp.id=tu.first_card_payment_id
      WHERE tu.id=$1::uuid
      FOR UPDATE OF cp`,
    [userId],
  );
  const payment = result.rows[0];
  if (!payment) throw new ApiError(409, "payment_required", "The first-card payment record is missing.");
  if (payment.status !== "accepted" && payment.status !== "completed") {
    throw new ApiError(409, "payment_not_approved", "Approve the customer's first-card receipt before performing the card operation.");
  }
  return serialize(payment);
}

export async function markFirstCardPaymentCompleted(db: DatabaseQueryable, userId: string) {
  await db.query(
    `UPDATE customer_payments cp
        SET status='completed',updated_at=now()
       FROM telegram_users tu
      WHERE tu.id=$1::uuid
        AND cp.id=tu.first_card_payment_id
        AND cp.status='accepted'`,
    [userId],
  );
}

export async function assertAcceptedPaymentForCardRequest(db: DatabaseQueryable, cardRequestId: string) {
  const result = await db.query<PaymentRow>(
    `SELECT * FROM customer_payments WHERE card_request_id=$1::uuid FOR UPDATE`,
    [cardRequestId],
  );
  const payment = result.rows[0];
  if (!payment) throw new ApiError(409, "payment_required", "The customer payment record is missing for this card request.");
  if (payment.status !== "accepted" && payment.status !== "completed") {
    throw new ApiError(409, "payment_not_approved", "Approve the customer's receipt before performing the card operation.");
  }
  return serialize(payment);
}

export async function markCardRequestPaymentCompleted(db: DatabaseQueryable, cardRequestId: string) {
  await db.query(
    `UPDATE customer_payments SET status='completed',updated_at=now()
      WHERE card_request_id=$1::uuid AND status='accepted'`,
    [cardRequestId],
  );
}

export async function syncFundingPaymentStatus(db: DatabaseQueryable, fundingRequestId: string, status: CustomerPaymentStatus, input?: {
  adminId?: string | null;
  note?: string | null;
}) {
  await db.query(
    `UPDATE customer_payments
        SET status=$2,admin_note=$3,reviewed_by=COALESCE($4::uuid,reviewed_by),
            reviewed_at=CASE WHEN $4::uuid IS NULL THEN reviewed_at ELSE now() END,updated_at=now()
      WHERE funding_request_id=$1::uuid`,
    [fundingRequestId, status, input?.note?.slice(0, 1000) ?? null, input?.adminId ?? null],
  );
}

export async function reviewCustomerPayment(input: {
  paymentId: string;
  action: "accept" | "correction" | "reject";
  adminId: string;
  note?: string | null;
}) {
  return withTransaction(async (db) => {
    const result = await db.query<PaymentRow>(`SELECT * FROM customer_payments WHERE id=$1::uuid FOR UPDATE`, [input.paymentId]);
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "payment_not_found", "Payment record not found.");
    if (row.status !== "pending_review") throw new ApiError(409, "invalid_state", `This payment cannot be reviewed from status ${row.status}.`);

    const receipt = await db.query<{ id: string; scan_status: string }>(
      `SELECT id,scan_status FROM receipts WHERE payment_id=$1::uuid ORDER BY created_at DESC LIMIT 1`,
      [row.id],
    );
    if (input.action === "accept" && receipt.rows[0]?.scan_status !== "clean") {
      throw new ApiError(409, "receipt_not_clean", "A validated receipt is required before accepting this payment.");
    }

    const next: CustomerPaymentStatus = input.action === "accept" ? "accepted" : input.action === "correction" ? "correction_needed" : "rejected";
    if (input.action !== "accept" && receipt.rows[0]) {
      await db.query(
        `UPDATE receipts SET scan_status='rejected',rejected_reason=$2,scan_completed_at=COALESCE(scan_completed_at,now())
          WHERE id=$1::uuid`,
        [receipt.rows[0].id, input.action === "correction" ? "correction_requested" : "payment_rejected"],
      );
    }
    const updated = await db.query<PaymentRow>(
      `UPDATE customer_payments
          SET status=$2,admin_note=$3,reviewed_by=$4::uuid,reviewed_at=now(),updated_at=now()
        WHERE id=$1::uuid RETURNING *`,
      [row.id, next, input.note?.trim().slice(0, 1000) || null, input.adminId],
    );

    if (row.purpose === "first_card") {
      await db.query(
        `UPDATE telegram_users
            SET payment_status=$2,
                payment_receipt_object_key=CASE WHEN $2='accepted' THEN payment_receipt_object_key ELSE NULL END,
                payment_receipt_mime=CASE WHEN $2='accepted' THEN payment_receipt_mime ELSE NULL END,
                payment_receipt_at=CASE WHEN $2='accepted' THEN payment_receipt_at ELSE NULL END,
                updated_at=now()
          WHERE id=$1::uuid AND first_card_payment_id=$3::uuid`,
        [row.user_id, input.action === "accept" ? "accepted" : "denied", row.id],
      );
    } else if (row.purpose === "additional_card" && row.card_request_id) {
      const requestStatus = input.action === "accept" ? "pending_review" : input.action === "correction" ? "correction_needed" : "rejected";
      await db.query(
        `UPDATE card_requests SET status=$2,admin_note=$3,updated_at=now() WHERE id=$1::uuid`,
        [row.card_request_id, requestStatus, input.note?.trim().slice(0, 1000) || null],
      );
      await db.query(
        `INSERT INTO outbox_events(topic,aggregate_type,aggregate_id,event_type,payload,status,available_at)
         VALUES('telegram','card_request',$1::uuid,'card_request.status_changed',$2::jsonb,'pending',now())`,
        [row.card_request_id, JSON.stringify({ cardRequestId: row.card_request_id, status: requestStatus })],
      );
    }

    return serialize(updated.rows[0]!);
  });
}

export const customerPaymentIdSchema = z.string().uuid();
