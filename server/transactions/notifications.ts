import { getPool, withTransaction } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { encodeCursor } from "@/server/http/cursor";

export type TransactionNotificationIssue = {
  id: string;
  cardId: string;
  accountId: string;
  last4: string | null;
  amountMinor: string;
  currency: string;
  transactionType: string | null;
  transactionStatus: string;
  merchant: string | null;
  occurredAt: string;
  notificationStatus: "skipped" | "failed";
  notificationError: string | null;
  queuedAt: string | null;
  failedAt: string | null;
  skippedAt: string | null;
  reconciledAt: string | null;
};

export async function listTransactionNotificationIssues(input: { limit: number; search?: string; cursor?: { createdAt: string; id: string } }) {
  const values: unknown[] = [];
  const where = [`ct.notification_status IN ('skipped','failed')`, `ct.notification_reconciled_at IS NULL`];
  if (input.search) {
    values.push(`%${input.search}%`);
    const at = values.length;
    where.push(`(COALESCE(c.last4,'') ILIKE $${at} OR COALESCE(ct.merchant_redacted,'') ILIKE $${at} OR COALESCE(ct.transaction_type,'') ILIKE $${at} OR ct.status ILIKE $${at})`);
  }
  if (input.cursor) {
    values.push(input.cursor.createdAt, input.cursor.id);
    const ts = values.length - 1;
    const id = values.length;
    where.push(`(ct.occurred_at,ct.id) < ($${ts}::timestamptz,$${id}::uuid)`);
  }
  values.push(input.limit + 1);
  const result = await getPool().query<{
    id: string; card_id: string; account_id: string; last4: string | null; amount_minor: string; currency: string;
    transaction_type: string | null; transaction_status: string; merchant_redacted: string | null; occurred_at: Date;
    notification_status: "skipped" | "failed"; notification_error: string | null; notification_queued_at: Date | null;
    notification_failed_at: Date | null; notification_skipped_at: Date | null; notification_reconciled_at: Date | null;
  }>(
    `SELECT ct.id,ct.card_id,c.account_id,c.last4,ct.amount_minor::text,ct.currency,ct.transaction_type,ct.status AS transaction_status,
            ct.merchant_redacted,ct.occurred_at,ct.notification_status,ct.notification_error,ct.notification_queued_at,
            ct.notification_failed_at,ct.notification_skipped_at,ct.notification_reconciled_at
       FROM card_transactions ct
       JOIN cards c ON c.id=ct.card_id
      WHERE ${where.join(" AND ")}
      ORDER BY ct.occurred_at DESC,ct.id DESC
      LIMIT $${values.length}`,
    values,
  );
  const hasMore = result.rows.length > input.limit;
  const visible = hasMore ? result.rows.slice(0, input.limit) : result.rows;
  const items: TransactionNotificationIssue[] = visible.map((row) => ({
    id: row.id,
    cardId: row.card_id,
    accountId: row.account_id,
    last4: row.last4,
    amountMinor: row.amount_minor,
    currency: row.currency,
    transactionType: row.transaction_type,
    transactionStatus: row.transaction_status,
    merchant: row.merchant_redacted,
    occurredAt: row.occurred_at.toISOString(),
    notificationStatus: row.notification_status,
    notificationError: row.notification_error,
    queuedAt: row.notification_queued_at?.toISOString() ?? null,
    failedAt: row.notification_failed_at?.toISOString() ?? null,
    skippedAt: row.notification_skipped_at?.toISOString() ?? null,
    reconciledAt: row.notification_reconciled_at?.toISOString() ?? null,
  }));
  const last = visible.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.occurred_at.toISOString(), id: last.id }) : null,
  };
}

export async function reconcileTransactionNotification(input: {
  transactionId: string;
  action: "acknowledge" | "retry";
  note?: string | null;
  adminId: string;
  requestId: string;
}) {
  return withTransaction(async (db) => {
    const result = await db.query<{
      id: string; notification_status: string; notification_reconciled_at: Date | null; account_id: string; current_user_id: string | null;
      outbox_id: string | null; intended_user_id: string | null;
    }>(
      `SELECT ct.id,ct.notification_status,ct.notification_reconciled_at,c.account_id,
              taa.telegram_user_id AS current_user_id,
              oe.id AS outbox_id,
              NULLIF(oe.payload->>'intendedUserId','') AS intended_user_id
         FROM card_transactions ct
         JOIN cards c ON c.id=ct.card_id
         LEFT JOIN telegram_account_assignments taa ON taa.account_id=c.account_id
         LEFT JOIN LATERAL (
           SELECT id,payload
             FROM outbox_events
            WHERE event_type='card_transaction.detected'
              AND aggregate_id=ct.id::text
            ORDER BY created_at DESC
            LIMIT 1
         ) oe ON true
        WHERE ct.id=$1::uuid
        FOR UPDATE OF ct`,
      [input.transactionId],
    );
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "not_found", "Transaction not found.");
    if (row.notification_reconciled_at) throw new ApiError(409, "already_reconciled", "This notification issue has already been reconciled.");
    if (!['skipped', 'failed'].includes(row.notification_status)) {
      throw new ApiError(409, "notification_not_reconcilable", "This transaction does not have a notification issue to reconcile.");
    }

    if (input.action === "retry") {
      if (row.notification_status !== "failed") {
        throw new ApiError(409, "retry_not_allowed", "Skipped ownership notifications cannot be resent to a different assignee.");
      }
      if (!row.outbox_id || !row.intended_user_id || row.current_user_id !== row.intended_user_id) {
        throw new ApiError(409, "assignment_changed", "The original intended user no longer owns this account; the old transaction will not be resent.");
      }
      await db.query(
        `UPDATE outbox_events
            SET status='pending', attempts=0, available_at=now(), last_error=NULL, sent_at=NULL
          WHERE id=$1::uuid`,
        [row.outbox_id],
      );
      await db.query(
        `UPDATE card_transactions
            SET notification_status='queued', notification_failed_at=NULL, notification_error=NULL,
                notification_reconciled_at=NULL, notification_reconciled_by=NULL, notification_reconciliation_note=$2
          WHERE id=$1::uuid`,
        [input.transactionId, (input.note ?? "Explicit retry after delivery failure").slice(0, 500)],
      );
    } else {
      await db.query(
        `UPDATE card_transactions
            SET notification_reconciled_at=now(), notification_reconciled_by=$2::uuid, notification_reconciliation_note=$3
          WHERE id=$1::uuid`,
        [input.transactionId, input.adminId, (input.note ?? "Acknowledged without resend").slice(0, 500)],
      );
    }

    await db.query(
      `INSERT INTO audit_logs(actor_type,actor_admin_id,action,entity_type,entity_id,request_id,metadata_redacted)
       VALUES ('admin',$1::uuid,$2,'card_transaction',$3,$4,$5::jsonb)`,
      [input.adminId, `card_transaction.notification_${input.action}`, input.transactionId, input.requestId, JSON.stringify({ previousStatus: row.notification_status })],
    );
    return { reconciled: true, action: input.action };
  });
}

export type StoredTransactionRow = {
  id: string;
  clientId: string | null;
  accountId: string;
  cardId: string;
  last4: string | null;
  merchant: string | null;
  amountMinor: string;
  currency: string;
  transactionType: string | null;
  transactionStatus: string;
  occurredAt: string;
  notificationStatus: string;
  notificationError: string | null;
  notificationReconciledAt: string | null;
};

export async function listStoredTransactions(input: { limit: number; search?: string; cursor?: { createdAt: string; id: string } }) {
  const values: unknown[] = [];
  const where: string[] = [];
  if (input.search) {
    values.push(`%${input.search}%`);
    const at = values.length;
    where.push(`(COALESCE(c.last4,'') ILIKE $${at} OR COALESCE(ct.merchant_redacted,'') ILIKE $${at} OR COALESCE(ct.transaction_type,'') ILIKE $${at} OR ct.status ILIKE $${at} OR COALESCE(tu.username,'') ILIKE $${at} OR COALESCE(tu.display_name,'') ILIKE $${at})`);
  }
  if (input.cursor) {
    values.push(input.cursor.createdAt, input.cursor.id);
    const ts = values.length - 1;
    const id = values.length;
    where.push(`(ct.occurred_at,ct.id) < ($${ts}::timestamptz,$${id}::uuid)`);
  }
  values.push(input.limit + 1);
  const result = await getPool().query<{
    id: string; client_id: string | null; account_id: string; card_id: string; last4: string | null;
    merchant_redacted: string | null; amount_minor: string; currency: string; transaction_type: string | null;
    transaction_status: string; occurred_at: Date; notification_status: string; notification_error: string | null;
    notification_reconciled_at: Date | null;
  }>(
    `SELECT ct.id,taa.telegram_user_id AS client_id,c.account_id,ct.card_id,c.last4,ct.merchant_redacted,ct.amount_minor::text,ct.currency,
            ct.transaction_type,ct.status AS transaction_status,ct.occurred_at,ct.notification_status,ct.notification_error,ct.notification_reconciled_at
       FROM card_transactions ct
       JOIN cards c ON c.id=ct.card_id
       LEFT JOIN telegram_account_assignments taa ON taa.account_id=c.account_id
       LEFT JOIN telegram_users tu ON tu.id=taa.telegram_user_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ct.occurred_at DESC,ct.id DESC
      LIMIT $${values.length}`,
    values,
  );
  const hasMore = result.rows.length > input.limit;
  const visible = hasMore ? result.rows.slice(0, input.limit) : result.rows;
  const items: StoredTransactionRow[] = visible.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    accountId: row.account_id,
    cardId: row.card_id,
    last4: row.last4,
    merchant: row.merchant_redacted,
    amountMinor: row.amount_minor,
    currency: row.currency,
    transactionType: row.transaction_type,
    transactionStatus: row.transaction_status,
    occurredAt: row.occurred_at.toISOString(),
    notificationStatus: row.notification_status,
    notificationError: row.notification_error,
    notificationReconciledAt: row.notification_reconciled_at?.toISOString() ?? null,
  }));
  const last = visible.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.occurred_at.toISOString(), id: last.id }) : null,
  };
}
