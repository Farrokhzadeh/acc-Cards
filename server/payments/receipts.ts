import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { getTelegramClient } from "@/server/telegram/credentials";
import { deletePrivateReceipt, readPrivateReceipt, storePrivateReceipt } from "@/server/receipts/storage";
import { getCustomerPayment } from "@/server/payments/service";

export async function attachTelegramCustomerPaymentReceipt(input: {
  userId: string;
  paymentId: string;
  telegramFileId: string;
  telegramFileUniqueId?: string | null;
  originalFilename?: string | null;
  declaredMimeType?: string | null;
}) {
  const env = parseServerEnv(process.env);
  const payment = await getCustomerPayment(input.paymentId, input.userId);
  if (!["pending_receipt","correction_needed"].includes(payment.status)) {
    throw new ApiError(409, "invalid_state", "This payment is not waiting for receipt evidence.");
  }

  const telegram = await getTelegramClient();
  const file = await telegram.getFile(input.telegramFileId);
  if (!file.file_path) throw new ApiError(502, "telegram_file_unavailable", "Telegram did not return a downloadable file path.");
  if (file.file_size && file.file_size > env.RECEIPT_MAX_BYTES) throw new ApiError(413, "receipt_too_large", "The receipt exceeds the configured size limit.");

  const bytes = await telegram.downloadFile(file.file_path, env.RECEIPT_MAX_BYTES);
  const stored = await storePrivateReceipt({
    requestId: input.paymentId,
    bytes,
    originalFilename: input.originalFilename,
    declaredMimeType: input.declaredMimeType,
  });

  try {
    const result = await withTransaction(async (db) => {
      const locked = await db.query<{
        id: string;
        purpose: string;
        user_id: string;
        card_request_id: string | null;
        status: string;
      }>(
        `SELECT id,purpose,user_id,card_request_id,status
           FROM customer_payments
          WHERE id=$1::uuid AND user_id=$2::uuid
          FOR UPDATE`,
        [input.paymentId, input.userId],
      );
      const row = locked.rows[0];
      if (!row) throw new ApiError(404, "payment_not_found", "Payment record not found.");
      if (!["pending_receipt","correction_needed"].includes(row.status)) {
        throw new ApiError(409, "invalid_state", "This payment is not waiting for receipt evidence.");
      }

      if (row.status === "correction_needed") {
        await db.query(
          `UPDATE receipts
              SET scan_status='rejected',rejected_reason='superseded_by_client',scan_completed_at=COALESCE(scan_completed_at,now())
            WHERE payment_id=$1::uuid AND scan_status IN ('pending','clean')`,
          [row.id],
        );
      }

      const inserted = await db.query<{ id: string }>(
        `INSERT INTO receipts(
           request_id,payment_id,object_key,original_filename,mime_type,size_bytes,sha256_hex,scan_status,
           source,telegram_file_id,telegram_file_unique_id,detected_mime_type,scan_engine,scan_note,scan_completed_at
         ) VALUES(
           NULL,$1::uuid,$2,$3,$4,$5,$6,$7,'telegram',$8,$9,$10,$11,$12,now()
         ) RETURNING id`,
        [
          row.id,
          stored.objectKey,
          stored.originalFilename,
          stored.declaredMimeType ?? stored.detectedMimeType,
          stored.sizeBytes,
          stored.sha256Hex,
          stored.scanStatus,
          input.telegramFileId,
          input.telegramFileUniqueId ?? file.file_unique_id,
          stored.detectedMimeType,
          stored.scanEngine,
          stored.scanNote,
        ],
      );
      const receiptId = inserted.rows[0]!.id;

      await db.query(
        `UPDATE customer_payments
            SET status='pending_review',receipt_id=$2::uuid,admin_note=NULL,updated_at=now()
          WHERE id=$1::uuid`,
        [row.id, receiptId],
      );

      if (row.purpose === "first_card") {
        await db.query(
          `UPDATE telegram_users
              SET payment_status='pending',payment_receipt_object_key=$2,payment_receipt_mime=$3,payment_receipt_at=now(),updated_at=now()
            WHERE id=$1::uuid AND first_card_payment_id=$4::uuid`,
          [row.user_id, stored.objectKey, stored.detectedMimeType, row.id],
        );
      } else if (row.purpose === "additional_card" && row.card_request_id) {
        await db.query(
          `UPDATE card_requests SET status='pending_review',admin_note=NULL,updated_at=now() WHERE id=$1::uuid`,
          [row.card_request_id],
        );
      }
      return { receiptId };
    });

    return {
      receiptId: result.receiptId,
      payment: await getCustomerPayment(input.paymentId, input.userId),
      receipt: {
        originalFilename: stored.originalFilename,
        detectedMimeType: stored.detectedMimeType,
        sizeBytes: stored.sizeBytes,
        sha256Hex: stored.sha256Hex,
        scanStatus: stored.scanStatus,
      },
    };
  } catch (error) {
    await deletePrivateReceipt(stored.objectKey).catch(() => undefined);
    throw error;
  }
}

export async function getCustomerPaymentReceiptForTelegram(paymentId: string, userId: string) {
  const result = await getPool().query<{
    object_key: string;
    original_filename: string | null;
    detected_mime_type: string | null;
    mime_type: string;
    scan_status: string;
  }>(
    `SELECT r.object_key,r.original_filename,r.detected_mime_type,r.mime_type,r.scan_status
       FROM customer_payments cp
       JOIN receipts r ON r.id=cp.receipt_id
      WHERE cp.id=$1::uuid
        AND cp.user_id=$2::uuid
      LIMIT 1`,
    [paymentId, userId],
  );
  const receipt = result.rows[0];
  if (!receipt) throw new ApiError(404, "receipt_not_found", "No receipt is attached to this payment.");
  if (!["clean","rejected"].includes(receipt.scan_status)) {
    throw new ApiError(409, "receipt_unavailable", "This receipt is not available yet.");
  }
  return {
    bytes: await readPrivateReceipt(receipt.object_key),
    filename: receipt.original_filename || `payment-receipt-${paymentId}`,
    mimeType: receipt.detected_mime_type || receipt.mime_type,
    scanStatus: receipt.scan_status,
  };
}

export async function getCustomerPaymentReceiptForAdmin(paymentId: string) {
  const result = await getPool().query<{
    object_key: string;
    original_filename: string | null;
    detected_mime_type: string | null;
    mime_type: string;
    scan_status: string;
  }>(
    `SELECT object_key,original_filename,detected_mime_type,mime_type,scan_status
       FROM receipts
      WHERE payment_id=$1::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    [paymentId],
  );
  const receipt = result.rows[0];
  if (!receipt) throw new ApiError(404, "receipt_not_found", "Receipt evidence not found.");
  if (receipt.scan_status !== "clean") throw new ApiError(409, "receipt_not_clean", "Receipt evidence is not available because validation did not pass.");
  return {
    bytes: await readPrivateReceipt(receipt.object_key),
    filename: receipt.original_filename || `receipt-${paymentId}`,
    mimeType: receipt.detected_mime_type || receipt.mime_type,
  };
}
