import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction } from "@/server/database/pool";
import { decryptSecret } from "@/server/security/crypto";
import { TelegramClient } from "@/server/providers/telegram/client";
import { readPrivateSupportAttachment } from "@/server/support/storage";

const MAX_ATTEMPTS = 5;

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

type OutboxRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

function retryDelaySeconds(attempt: number) {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

async function claimOne(): Promise<OutboxRow | null> {
  return withTransaction(async (db) => {
    const result = await db.query<OutboxRow>(
      `SELECT id, aggregate_type, aggregate_id, event_type, payload, attempts
         FROM outbox_events
        WHERE topic='telegram'
          AND (
            (status IN ('pending','failed') AND available_at <= now())
            OR (status='processing' AND available_at <= now() - interval '10 minutes')
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return null;
    await db.query(`UPDATE outbox_events SET status='processing', attempts=attempts+1, available_at=now(), last_error=NULL WHERE id=$1::uuid`, [row.id]);
    return { ...row, attempts: row.attempts + 1 };
  });
}

async function finish(id: string) {
  await getPool().query(`UPDATE outbox_events SET status='sent', sent_at=now(), last_error=NULL WHERE id=$1::uuid`, [id]);
}

async function fail(row: OutboxRow, errorCode: string) {
  const terminal = row.attempts >= MAX_ATTEMPTS;
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE outbox_events
          SET status=$2, available_at=CASE WHEN $2='dead_letter' THEN available_at ELSE now()+($3::int * interval '1 second') END,
              last_error=$4
        WHERE id=$1::uuid`,
      [row.id, terminal ? "dead_letter" : "failed", retryDelaySeconds(row.attempts), errorCode.slice(0, 200)],
    );
    if (row.event_type === "support.admin_message") {
      const supportMessageId = String(row.payload.messageId ?? row.aggregate_id);
      await db.query(
        `UPDATE messages SET status=CASE WHEN $2 THEN 'failed' ELSE status END,
                failed_at=CASE WHEN $2 THEN now() ELSE failed_at END,
                last_delivery_error=$3, delivery_attempted_at=now()
          WHERE id=$1::uuid AND status='pending'`,
        [supportMessageId, terminal, errorCode.slice(0,200)],
      );
      if (terminal) {
        await db.query(
          `INSERT INTO conversation_events(conversation_id,actor_type,event_type,metadata_redacted)
           SELECT conversation_id,'worker','message.telegram.failed',$2::jsonb FROM messages WHERE id=$1::uuid`,
          [supportMessageId, JSON.stringify({ messageId: supportMessageId, errorCode: errorCode.slice(0,120) })],
        );
      }
    }
    if (terminal && row.event_type === "otp.ready_for_delivery") {
      await db.query(`UPDATE otp_deliveries SET delivery_status='failed' WHERE id=$1::uuid AND delivery_status='pending'`, [String(row.payload.otpDeliveryId ?? row.aggregate_id)]);
    }
    if (terminal && row.event_type === "card_transaction.detected") {
      await db.query(
        `UPDATE card_transactions
            SET notification_status='failed', notification_failed_at=now(), notification_error=$2
          WHERE id=$1::uuid AND notification_status='queued'`,
        [String(row.payload.transactionId ?? row.aggregate_id), errorCode.slice(0, 200)],
      );
    }
  });
}

async function deliverOtp(client: TelegramClient, row: OutboxRow) {
  const otpId = String(row.payload.otpDeliveryId ?? row.aggregate_id);
  const result = await getPool().query<{
    id: string; encrypted_code: string; expires_at: Date; redacted_at: Date | null; delivery_status: string;
    merchant_context: string | null; card_id: string | null; user_id: string | null; telegram_user_id: string | bigint | null;
    account_id: string;
  }>(
    `SELECT od.id, od.encrypted_code, od.expires_at, od.redacted_at, od.delivery_status, od.merchant_context, od.card_id, od.user_id,
            tu.telegram_user_id, ea.account_id
       FROM otp_deliveries od
       JOIN email_messages em ON em.id=od.email_message_id
       JOIN email_accounts ea ON ea.id=em.email_account_id
       LEFT JOIN telegram_users tu ON tu.id=od.user_id
      WHERE od.id=$1::uuid`,
    [otpId],
  );
  const otp = result.rows[0];
  if (!otp || !otp.user_id || !otp.telegram_user_id) { await finish(row.id); return; }
  if (otp.redacted_at || !otp.encrypted_code || otp.expires_at.getTime() <= Date.now()) {
    await getPool().query(`UPDATE otp_deliveries SET encrypted_code='', redacted_at=COALESCE(redacted_at,now()), delivery_status='expired' WHERE id=$1::uuid`, [otpId]);
    await finish(row.id);
    return;
  }
  const current = await getPool().query<{ ok: boolean }>(
    `SELECT true AS ok FROM telegram_account_assignments
      WHERE telegram_user_id=$1::uuid AND account_id=$2::uuid
        AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM cards c WHERE c.id=$3::uuid AND c.account_id=$2::uuid))
      LIMIT 1`,
    [otp.user_id, otp.account_id, otp.card_id],
  );
  if (!current.rows[0]?.ok) {
    await getPool().query(`UPDATE otp_deliveries SET encrypted_code='', redacted_at=now(), delivery_status='quarantined' WHERE id=$1::uuid`, [otpId]);
    await getPool().query(
      `INSERT INTO audit_logs(actor_type, action, entity_type, entity_id, metadata_redacted)
       VALUES ('worker','otp.telegram.assignment_changed','otp_delivery',$1,$2::jsonb)`,
      [otpId, JSON.stringify({ accountId: otp.account_id, cardId: otp.card_id })],
    );
    await finish(row.id);
    return;
  }

  const code = decryptSecret(otp.encrypted_code);
  const sent = await client.sendMessage({
    chatId: String(otp.telegram_user_id),
    text: `<b>3DS / verification code</b>\nCode: <code>${escapeHtml(code)}</code>${otp.merchant_context ? `\nContext: ${escapeHtml(otp.merchant_context)}` : ""}\nThis code is short-lived.`,
    protectContent: true,
  });
  await getPool().query(
    `UPDATE otp_deliveries SET delivered_at=now(), telegram_message_id=$2, delivery_status='delivered', encrypted_code='', redacted_at=now() WHERE id=$1::uuid`,
    [otpId, sent.message_id],
  );
  await getPool().query(
    `INSERT INTO audit_logs(actor_type, action, entity_type, entity_id, metadata_redacted)
     VALUES ('worker','otp.telegram.delivered','otp_delivery',$1,$2::jsonb)`,
    [otpId, JSON.stringify({ telegramMessageId: sent.message_id })],
  );
  await finish(row.id);
}



function formatTransactionAmount(amountMinor: string, currency: string) {
  const amount = Number(amountMinor) / 100;
  if (!Number.isFinite(amount)) return `${amountMinor} ${currency}`;
  return `${amount.toFixed(2)} ${currency}`;
}

async function deliverCardTransaction(client: TelegramClient, row: OutboxRow) {
  const transactionId = String(row.payload.transactionId ?? row.aggregate_id);
  const intendedUserId = String(row.payload.intendedUserId ?? "");
  if (!intendedUserId) { await finish(row.id); return; }

  const result = await getPool().query<{
    id: string; amount_minor: string; currency: string; transaction_type: string | null; status: string;
    merchant_redacted: string | null; occurred_at: Date; notification_status: string; last4: string | null;
    account_id: string; telegram_user_id: string | bigint; banned_at: Date | null; assignment_ok: boolean;
  }>(
    `SELECT ct.id,ct.amount_minor::text,ct.currency,ct.transaction_type,ct.status,ct.merchant_redacted,ct.occurred_at,ct.notification_status,
            c.last4,c.account_id,tu.telegram_user_id,tu.banned_at,
            EXISTS (
              SELECT 1 FROM telegram_account_assignments taa
               WHERE taa.account_id=c.account_id AND taa.telegram_user_id=tu.id
            ) AS assignment_ok
       FROM card_transactions ct
       JOIN cards c ON c.id=ct.card_id
       JOIN telegram_users tu ON tu.id=$2::uuid
      WHERE ct.id=$1::uuid`,
    [transactionId, intendedUserId],
  );
  const tx = result.rows[0];
  if (!tx || tx.notification_status === "sent") { await finish(row.id); return; }
  if (tx.banned_at || !tx.assignment_ok) {
    await getPool().query(
      `UPDATE card_transactions
          SET notification_status='skipped', notification_skipped_at=now(), notification_error=$2
        WHERE id=$1::uuid AND notification_status <> 'sent'`,
      [transactionId, tx.banned_at ? "telegram_user_banned" : "assignment_changed"],
    );
    await finish(row.id);
    return;
  }

  const lines = [
    `<b>Card transaction</b>`,
    `Card: •${escapeHtml(tx.last4 ?? "????")}`,
    `Amount: <b>${escapeHtml(formatTransactionAmount(tx.amount_minor, tx.currency))}</b>`,
    `Status: ${escapeHtml(tx.status)}`,
    tx.transaction_type ? `Type: ${escapeHtml(tx.transaction_type)}` : null,
    tx.merchant_redacted ? `Merchant: ${escapeHtml(tx.merchant_redacted)}` : null,
    `Time: ${escapeHtml(tx.occurred_at.toISOString())}`,
  ].filter(Boolean).join("\n");

  await client.sendMessage({
    chatId: String(tx.telegram_user_id),
    text: lines,
    protectContent: true,
  });
  await getPool().query(
    `UPDATE card_transactions
        SET notification_status='sent', notification_sent_at=now(), notification_error=NULL
      WHERE id=$1::uuid`,
    [transactionId],
  );
  await finish(row.id);
}

async function deliverFundingRequestStatus(client: TelegramClient, row: OutboxRow) {
  const requestId = String(row.payload.fundingRequestId ?? row.aggregate_id);
  const result = await getPool().query<{
    id: string; reference: string; status: string; admin_note: string | null; telegram_user_id: string | bigint; banned_at: Date | null;
  }>(
    `SELECT fr.id,fr.reference,fr.status,fr.admin_note,tu.telegram_user_id,tu.banned_at
       FROM funding_requests fr JOIN telegram_users tu ON tu.id=fr.user_id
      WHERE fr.id=$1::uuid`,
    [requestId],
  );
  const request = result.rows[0];
  if (!request || request.banned_at) { await finish(row.id); return; }
  await client.sendMessage({
    chatId: String(request.telegram_user_id),
    text: `<b>Funding request update</b>\n${escapeHtml(request.reference)} is now <b>${escapeHtml(request.status)}</b>.${request.admin_note ? `\nAdmin note: ${escapeHtml(request.admin_note)}` : ""}\nOpen My requests in the bot for details.`,
  });
  await finish(row.id);
}

async function deliverCardRequestStatus(client: TelegramClient, row: OutboxRow) {
  const requestId = String(row.payload.cardRequestId ?? row.aggregate_id);
  const result = await getPool().query<{
    id: string; reference: string; status: string; telegram_user_id: string | bigint; banned_at: Date | null;
  }>(
    `SELECT cr.id,cr.reference,cr.status,tu.telegram_user_id,tu.banned_at
       FROM card_requests cr JOIN telegram_users tu ON tu.id=cr.user_id
      WHERE cr.id=$1::uuid`,
    [requestId],
  );
  const request = result.rows[0];
  if (!request || request.banned_at) { await finish(row.id); return; }
  await client.sendMessage({
    chatId: String(request.telegram_user_id),
    text: `<b>Card request update</b>\n${escapeHtml(request.reference)} is now <b>${escapeHtml(request.status)}</b>.\nOpen My requests in the bot to see the current details.`,
  });
  await finish(row.id);
}

async function deliverSupportMessage(client: TelegramClient, row: OutboxRow) {
  const messageId = String(row.payload.messageId ?? row.aggregate_id);
  const result = await getPool().query<{
    id: string; text_body: string | null; status: string; telegram_user_id: string | bigint; banned_at: Date | null;
    object_key: string | null; original_filename: string | null; detected_mime_type: string | null;
  }>(
    `SELECT m.id, m.text_body, m.status, tu.telegram_user_id, tu.banned_at,
            sa.object_key, sa.original_filename, sa.detected_mime_type
       FROM messages m
       JOIN conversations c ON c.id=m.conversation_id
       JOIN telegram_users tu ON tu.id=c.user_id
       LEFT JOIN support_attachments sa ON sa.message_id=m.id
      WHERE m.id=$1::uuid AND m.direction='admin_to_client'`,
    [messageId],
  );
  const message = result.rows[0];
  if (!message || message.status === "sent" || message.status === "delivered") { await finish(row.id); return; }
  if (message.banned_at) {
    await getPool().query(`UPDATE messages SET status='failed', failed_at=now(), last_delivery_error='telegram_user_banned' WHERE id=$1::uuid`, [messageId]);
    await finish(row.id);
    return;
  }
  await getPool().query(`UPDATE messages SET delivery_attempted_at=now(), last_delivery_error=NULL WHERE id=$1::uuid`, [messageId]);
  let sent;
  if (message.object_key) {
    const bytes = await readPrivateSupportAttachment(message.object_key);
    sent = await client.sendDocument({
      chatId: String(message.telegram_user_id),
      bytes,
      filename: message.original_filename || "attachment",
      mimeType: message.detected_mime_type || "application/octet-stream",
      caption: message.text_body ? escapeHtml(message.text_body) : undefined,
      protectContent: true,
    });
  } else {
    sent = await client.sendMessage({ chatId: String(message.telegram_user_id), text: escapeHtml(message.text_body ?? "(empty message)"), protectContent: true });
  }
  await withTransaction(async (db) => {
    await db.query(`UPDATE messages SET status='sent', telegram_message_id=$2, last_delivery_error=NULL WHERE id=$1::uuid`, [messageId, sent.message_id]);
    await db.query(`UPDATE conversations c SET unread_client_count=unread_client_count+1, updated_at=now() FROM messages m WHERE m.id=$1::uuid AND c.id=m.conversation_id`, [messageId]);
    await db.query(`INSERT INTO conversation_events(conversation_id,actor_type,event_type,metadata_redacted)
                    SELECT conversation_id,'worker','message.telegram.sent',$2::jsonb FROM messages WHERE id=$1::uuid`,
                   [messageId, JSON.stringify({ telegramMessageId: sent.message_id, attachment: Boolean(message.object_key) })]);
  });
  await finish(row.id);
}

export async function processTelegramOutbox(limit = 100) {
  const env = parseServerEnv(process.env);
  if (!env.TELEGRAM_BOT_TOKEN) return { processed: 0, sent: 0, failed: 0, deadLetter: 0, configured: false };
  const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const bounded = Math.max(1, Math.min(500, limit));
  const summary = { processed: 0, sent: 0, failed: 0, deadLetter: 0, configured: true };
  for (let index = 0; index < bounded; index += 1) {
    const row = await claimOne();
    if (!row) break;
    summary.processed += 1;
    try {
      if (row.event_type === "otp.ready_for_delivery") await deliverOtp(client, row);
      else if (row.event_type === "card_transaction.detected") await deliverCardTransaction(client, row);
      else if (row.event_type === "support.admin_message") await deliverSupportMessage(client, row);
      else if (row.event_type === "card_request.status_changed") await deliverCardRequestStatus(client, row);
      else if (row.event_type === "funding_request.status_changed") await deliverFundingRequestStatus(client, row);
      else await finish(row.id);
      summary.sent += 1;
    } catch (error) {
      const code = error instanceof Error ? error.name : "telegram_delivery_error";
      await fail(row, code);
      if (row.attempts >= MAX_ATTEMPTS) summary.deadLetter += 1;
      else summary.failed += 1;
    }
  }
  return summary;
}
