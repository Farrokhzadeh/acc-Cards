import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { getTelegramClient } from "@/server/telegram/credentials";
import { deletePrivateReceipt, storePrivateReceipt, readPrivateReceipt } from "@/server/receipts/storage";
import { markReceiptAttachedInTransaction } from "@/server/funding/service";

export async function attachTelegramReceipt(input: {
  userId: string;
  requestId: string;
  telegramFileId: string;
  telegramFileUniqueId?: string | null;
  originalFilename?: string | null;
  declaredMimeType?: string | null;
}) {
  const env = parseServerEnv(process.env);
  const request = await getPool().query<{ id: string; status: string }>(
    `SELECT id,status FROM funding_requests WHERE id=$1::uuid AND user_id=$2::uuid`, [input.requestId,input.userId],
  );
  if (!request.rows[0]) throw new ApiError(404,"not_found","Funding request not found.");
  if (!["pending_receipt","correction_needed"].includes(request.rows[0].status)) throw new ApiError(409,"invalid_state","This request is not waiting for receipt evidence.");

  const telegram = await getTelegramClient();
  const file = await telegram.getFile(input.telegramFileId);
  if (!file.file_path) throw new ApiError(502,"telegram_file_unavailable","Telegram did not return a downloadable file path.");
  if (file.file_size && file.file_size > env.RECEIPT_MAX_BYTES) throw new ApiError(413,"receipt_too_large","The receipt exceeds the configured size limit.");
  const bytes = await telegram.downloadFile(file.file_path, env.RECEIPT_MAX_BYTES);
  const stored = await storePrivateReceipt({ requestId: input.requestId, bytes, originalFilename: input.originalFilename, declaredMimeType: input.declaredMimeType });

  try {
    const result = await withTransaction(async (db)=>{
      const payment = await db.query<{id:string}>(
        `SELECT id FROM customer_payments WHERE funding_request_id=$1::uuid FOR UPDATE`,
        [input.requestId],
      );
      const paymentId = payment.rows[0]?.id ?? null;
      if (request.rows[0]!.status === "correction_needed") {
        await db.query(`UPDATE receipts SET scan_status='rejected',rejected_reason='superseded_by_client',scan_completed_at=COALESCE(scan_completed_at,now()) WHERE request_id=$1::uuid AND scan_status IN('pending','clean')`,[input.requestId]);
      }
      const inserted=await db.query<{id:string}>(
        `INSERT INTO receipts(request_id,payment_id,object_key,original_filename,mime_type,size_bytes,sha256_hex,scan_status,source,telegram_file_id,telegram_file_unique_id,detected_mime_type,scan_engine,scan_note,scan_completed_at)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,'telegram',$9,$10,$11,$12,$13,now()) RETURNING id`,
        [input.requestId,paymentId,stored.objectKey,stored.originalFilename,stored.declaredMimeType??stored.detectedMimeType,stored.sizeBytes,stored.sha256Hex,stored.scanStatus,input.telegramFileId,input.telegramFileUniqueId??file.file_unique_id,stored.detectedMimeType,stored.scanEngine,stored.scanNote],
      );
      const receiptId=inserted.rows[0]!.id;
      const updated=await markReceiptAttachedInTransaction(db,{requestId:input.requestId,userId:input.userId,receiptId});
      return {receiptId,updated};
    });
    return {receiptId:result.receiptId,request:result.updated,receipt:{...stored,objectKey:undefined}};
  } catch (error) {
    await deletePrivateReceipt(stored.objectKey).catch(()=>undefined);
    throw error;
  }
}

export async function getReceiptForAdmin(requestId:string){
  const result=await getPool().query<{object_key:string;original_filename:string|null;detected_mime_type:string|null;mime_type:string;scan_status:string}>(`SELECT object_key,original_filename,detected_mime_type,mime_type,scan_status FROM receipts WHERE request_id=$1::uuid ORDER BY created_at DESC LIMIT 1`,[requestId]);
  const receipt=result.rows[0]; if(!receipt) throw new ApiError(404,"receipt_not_found","Receipt evidence not found.");
  if(receipt.scan_status!=="clean") throw new ApiError(409,"receipt_not_clean","Receipt evidence is not available because validation did not pass.");
  return {bytes:await readPrivateReceipt(receipt.object_key),filename:receipt.original_filename||`receipt-${requestId}`,mimeType:receipt.detected_mime_type||receipt.mime_type};
}
