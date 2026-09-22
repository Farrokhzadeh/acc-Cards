import { getPool, withTransaction, type DatabaseQueryable } from "@/server/database/pool";
import { encryptSecret, decryptSecret } from "@/server/security/crypto";
import { ApiError } from "@/server/http/api";

export const EMAIL_PARSER_VERSION = "phase9-v1";

export type TrustedEmailRule = {
  id: string;
  label: string;
  senderMatch: string;
  subjectContains: string | null;
  category: "verification" | "security" | "otp_3ds";
  otpExpiryMinutes: number;
  enabled: boolean;
};

type MessageRow = {
  id: string;
  email_account_id: string;
  account_id: string;
  sender: string;
  subject: string | null;
  preview: string | null;
  received_at: Date;
  provider_message_id: string;
};

function normalizedSender(value: string) {
  return value.trim().toLowerCase();
}

function senderMatches(sender: string, match: string) {
  const senderValue = normalizedSender(sender);
  const rule = normalizedSender(match);
  if (rule.startsWith("@")) return senderValue.endsWith(rule);
  return senderValue === rule;
}

function subjectMatches(subject: string | null, contains: string | null) {
  if (!contains?.trim()) return true;
  return (subject ?? "").toLowerCase().includes(contains.trim().toLowerCase());
}

// Deliberately fixed patterns: admins cannot inject arbitrary regexes.
export function extractOtpCandidate(text: string) {
  const normalized = text.replace(/\s+/g, " ");
  const contextual = normalized.match(/(?:otp|one[- ]?time(?: password| code)?|verification code|security code|auth(?:entication)? code|code)\D{0,24}(\d{4,8})(?!\d)/i);
  if (contextual?.[1]) return contextual[1];
  const reverse = normalized.match(/(?<!\d)(\d{4,8})(?!\d)\D{0,24}(?:otp|one[- ]?time|verification|security|auth(?:entication)?|code)/i);
  return reverse?.[1] ?? null;
}

export function extractCardLast4(text: string) {
  const match = text.match(/(?:ending|ends in|last\s*4|card\s*(?:\*|x|•)?)[^\d]{0,10}(\d{4})(?!\d)/i);
  return match?.[1] ?? null;
}

async function enabledRules() {
  const result = await getPool().query<{
    id: string; label: string; sender_match: string; subject_contains: string | null;
    category: TrustedEmailRule["category"]; otp_expiry_minutes: number; enabled: boolean;
  }>(`SELECT id, label, sender_match, subject_contains, category, otp_expiry_minutes, enabled
       FROM email_trusted_rules WHERE enabled = true ORDER BY created_at ASC`);
  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    senderMatch: row.sender_match,
    subjectContains: row.subject_contains,
    category: row.category,
    otpExpiryMinutes: row.otp_expiry_minutes,
    enabled: row.enabled,
  }));
}

async function resolveCardAndUser(db: DatabaseQueryable, accountId: string, text: string) {
  const last4 = extractCardLast4(text);
  let cardId: string | null = null;
  if (last4) {
    const card = await db.query<{ id: string }>(
      `SELECT id FROM cards WHERE account_id = $1::uuid AND last4 = $2 AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 2`,
      [accountId, last4],
    );
    if (card.rows.length === 1) cardId = card.rows[0].id;
  }
  const assignment = await db.query<{ telegram_user_id: string }>(
    `SELECT telegram_user_id FROM telegram_account_assignments WHERE account_id = $1::uuid LIMIT 1`,
    [accountId],
  );
  return { cardId, userId: assignment.rows[0]?.telegram_user_id ?? null, last4 };
}

export async function classifyPendingEmailMessages(options?: {
  accountId?: string;
  limit?: number;
  resolveMessageText?: (message: { providerMessageId: string; sender: string; subject: string | null; preview: string | null }) => Promise<string | null>;
}) {
  const limit = Math.max(1, Math.min(500, options?.limit ?? 100));
  const params: unknown[] = [];
  let accountFilter = "";
  if (options?.accountId) {
    params.push(options.accountId);
    accountFilter = ` AND ea.account_id = $${params.length}::uuid`;
  }
  params.push(limit);
  const messages = await getPool().query<MessageRow>(
    `SELECT em.id, em.email_account_id, ea.account_id, em.sender, em.subject, em.preview, em.received_at, em.provider_message_id
       FROM email_messages em
       JOIN email_accounts ea ON ea.id = em.email_account_id
      WHERE em.classification_status = 'pending' ${accountFilter}
      ORDER BY em.received_at ASC
      LIMIT $${params.length}`,
    params,
  );
  const rules = await enabledRules();
  const summary = { processed: 0, classified: 0, quarantined: 0, otpCreated: 0 };

  for (const message of messages.rows) {
    const rule = rules.find((candidate) => senderMatches(message.sender, candidate.senderMatch) && subjectMatches(message.subject, candidate.subjectContains));
    let text = `${message.subject ?? ""}\n${message.preview ?? ""}`;
    if (rule?.category === "otp_3ds" && options?.resolveMessageText) {
      try {
        const resolvedText = await options.resolveMessageText({
          providerMessageId: message.provider_message_id,
          sender: message.sender,
          subject: message.subject,
          preview: message.preview,
        });
        if (resolvedText?.trim()) text = `${message.subject ?? ""}\n${resolvedText}`;
      } catch {
        // Full-body retrieval is best-effort; preview classification remains the safe fallback.
      }
    }
    const otpCandidate = extractOtpCandidate(text);

    await withTransaction(async (db) => {
      summary.processed += 1;
      if (!rule) {
        if (otpCandidate) {
          await db.query(
            `UPDATE email_messages SET category = 'quarantined', classification_status = 'quarantined', classified_at = now(), parser_version = $2, parser_note = 'OTP-like content from an untrusted sender/template' WHERE id = $1::uuid`,
            [message.id, EMAIL_PARSER_VERSION],
          );
          summary.quarantined += 1;
        } else {
          await db.query(
            `UPDATE email_messages SET classification_status = 'ignored', classified_at = now(), parser_version = $2, parser_note = 'No trusted rule matched' WHERE id = $1::uuid`,
            [message.id, EMAIL_PARSER_VERSION],
          );
        }
        return;
      }

      await db.query(
        `UPDATE email_messages SET category = $2, classification_status = 'classified', classified_at = now(), trusted_rule_id = $3::uuid, parser_version = $4, parser_note = $5 WHERE id = $1::uuid`,
        [message.id, rule.category, rule.id, EMAIL_PARSER_VERSION, `Matched trusted rule: ${rule.label}`],
      );
      summary.classified += 1;

      if (rule.category !== "otp_3ds") return;
      if (!otpCandidate) {
        await db.query(
          `UPDATE email_messages SET category = 'quarantined', classification_status = 'quarantined', parser_note = 'Trusted OTP template matched but no safe OTP candidate was found' WHERE id = $1::uuid`,
          [message.id],
        );
        summary.quarantined += 1;
        return;
      }

      const resolved = await resolveCardAndUser(db, message.account_id, text);
      const deliveryStatus = resolved.userId ? "pending" : "quarantined";
      const insertedOtp = await db.query(
        `INSERT INTO otp_deliveries(
           email_message_id, card_id, user_id, encrypted_code, code_last2, merchant_context,
           expires_at, delivery_status, parser_version, assignment_resolved_at, source_sender, source_subject
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, now() + ($7::int * interval '1 minute'), $8, $9, now(), $10, $11)
         ON CONFLICT (email_message_id) DO NOTHING
         RETURNING id`,
        [message.id, resolved.cardId, resolved.userId, encryptSecret(otpCandidate), otpCandidate.slice(-2), message.subject ?? null,
          rule.otpExpiryMinutes, deliveryStatus, EMAIL_PARSER_VERSION, message.sender, message.subject ?? null],
      );
      const otpDeliveryId = insertedOtp.rows[0]?.id;
      if (otpDeliveryId) {
        summary.otpCreated += 1;
        if (resolved.userId) {
          await db.query(
            `INSERT INTO outbox_events(topic, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
             VALUES ('telegram', 'otp_delivery', $1, 'otp.ready_for_delivery', $2::jsonb, $3)
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [otpDeliveryId, JSON.stringify({ otpDeliveryId, userId: resolved.userId, accountId: message.account_id, cardId: resolved.cardId, messageId: message.id }), `otp-ready:${message.id}`],
          );
        }
      }
    });
  }
  return summary;
}

export async function expireOtpDeliveries(limit = 500) {
  const result = await getPool().query<{ id: string }>(
    `UPDATE otp_deliveries
        SET encrypted_code = '', redacted_at = COALESCE(redacted_at, now()), delivery_status = CASE WHEN delivery_status = 'pending' THEN 'expired' ELSE delivery_status END
      WHERE id IN (
        SELECT id FROM otp_deliveries WHERE expires_at <= now() AND redacted_at IS NULL ORDER BY expires_at ASC LIMIT $1
      ) RETURNING id`,
    [Math.max(1, Math.min(5000, limit))],
  );
  return { expired: result.rowCount ?? 0 };
}

export async function revealOtpForMessage(messageId: string) {
  const result = await getPool().query<{
    id: string; encrypted_code: string; code_last2: string | null; expires_at: Date; redacted_at: Date | null;
    delivery_status: string; merchant_context: string | null; user_id: string | null; card_id: string | null;
  }>(`SELECT id, encrypted_code, code_last2, expires_at, redacted_at, delivery_status, merchant_context, user_id, card_id
       FROM otp_deliveries WHERE email_message_id = $1::uuid LIMIT 1`, [messageId]);
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "otp_not_found", "No parsed OTP exists for this message.");
  if (row.redacted_at || row.expires_at.getTime() <= Date.now() || !row.encrypted_code) {
    throw new ApiError(410, "otp_expired", "This OTP has expired or was already redacted.");
  }
  return {
    code: decryptSecret(row.encrypted_code),
    codeLast2: row.code_last2,
    expiresAt: row.expires_at.toISOString(),
    deliveryStatus: row.delivery_status,
    merchantContext: row.merchant_context,
    userId: row.user_id,
    cardId: row.card_id,
  };
}

export async function listTrustedRules() {
  const result = await getPool().query(`SELECT id, label, sender_match, subject_contains, category, otp_expiry_minutes, enabled, created_at, updated_at FROM email_trusted_rules ORDER BY label ASC`);
  return result.rows;
}

export async function createTrustedRule(input: {
  label: string; senderMatch: string; subjectContains?: string | null; category: "verification" | "security" | "otp_3ds"; otpExpiryMinutes?: number;
}, adminId: string) {
  const sender = input.senderMatch.trim().toLowerCase();
  if (!sender || (!sender.includes("@") && !sender.startsWith("@"))) throw new ApiError(400, "validation_error", "senderMatch must be an exact email address or an @domain suffix.");
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO email_trusted_rules(label, sender_match, subject_contains, category, otp_expiry_minutes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::uuid) RETURNING id`,
    [input.label.trim(), sender, input.subjectContains?.trim() || null, input.category, input.otpExpiryMinutes ?? 10, adminId],
  );
  // A newly approved rule may legitimize messages that were previously ignored. Requeue ignored messages once.
  await getPool().query(`UPDATE email_messages SET classification_status = 'pending', classified_at = NULL, parser_note = NULL WHERE classification_status = 'ignored'`);
  return { id: result.rows[0].id };
}
