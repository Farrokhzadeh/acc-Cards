import { getPool } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";

export async function listStoredEmailMessages(accountId: string, limit = 100) {
  const boundedLimit = Math.max(1, Math.min(200, limit));
  const connection = await getPool().query<{ id: string }>(
    `SELECT id FROM email_accounts WHERE account_id = $1::uuid`,
    [accountId],
  );
  const emailAccountId = connection.rows[0]?.id;
  if (!emailAccountId) throw new ApiError(404, "email_account_not_found", "This account does not have an email connection record.");
  const result = await getPool().query<{
    id: string;
    provider_message_id: string;
    sender: string;
    recipient: string | null;
    subject: string | null;
    preview: string | null;
    category: string;
    received_at: Date;
    is_unread: boolean;
    safe_metadata: Record<string, unknown>;
    classification_status: string;
    parser_note: string | null;
    otp_delivery_status: string | null;
    otp_code_last2: string | null;
    otp_expires_at: Date | null;
  }>(
    `SELECT em.id, em.provider_message_id, em.sender, em.recipient, em.subject, em.preview, em.category, em.received_at, em.is_unread, em.safe_metadata,
            em.classification_status, em.parser_note, od.delivery_status AS otp_delivery_status, od.code_last2 AS otp_code_last2, od.expires_at AS otp_expires_at
       FROM email_messages em
       LEFT JOIN otp_deliveries od ON od.email_message_id = em.id
      WHERE em.email_account_id = $1::uuid
      ORDER BY received_at DESC, id DESC
      LIMIT $2`,
    [emailAccountId, boundedLimit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    providerMessageId: row.provider_message_id,
    sender: row.sender,
    recipient: row.recipient,
    subject: row.subject ?? "(no subject)",
    preview: row.preview ?? "",
    category: row.category,
    receivedAt: row.received_at.toISOString(),
    unread: row.is_unread,
    hasAttachments: Boolean(row.safe_metadata?.hasAttachments),
    providerRemoved: Boolean(row.safe_metadata?.providerRemoved),
    classificationStatus: row.classification_status,
    parserNote: row.parser_note,
    otpAvailable: Boolean(row.otp_delivery_status && row.otp_delivery_status !== "expired"),
    otpDeliveryStatus: row.otp_delivery_status,
    otpCodeLast2: row.otp_code_last2,
    otpExpiresAt: row.otp_expires_at?.toISOString() ?? null,
  }));
}
