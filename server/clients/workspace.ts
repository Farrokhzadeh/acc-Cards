import { getPool } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";

export async function getClientWorkspace(userId: string) {
  const db = getPool();
  const user = await db.query<{
    id: string;
    telegram_user_id: string | bigint;
    username: string | null;
    display_name: string | null;
    banned_at: Date | null;
    joined_at: Date;
    last_seen_at: Date | null;
    payment_status: string | null;
  }>(
    `SELECT id,telegram_user_id,username,display_name,banned_at,joined_at,last_seen_at,payment_status
       FROM telegram_users
      WHERE id=$1::uuid`,
    [userId],
  );
  const row = user.rows[0];
  if (!row) throw new ApiError(404, "client_not_found", "Telegram client not found.");

  const [accounts, cards, transactions, cardRequests, fundingRequests, audit] = await Promise.all([
    db.query<{
      id: string; label: string; status: string; login_email: string; assigned_at: Date;
    }>(
      `SELECT a.id,a.label,a.status,a.login_email,taa.assigned_at
         FROM telegram_account_assignments taa
         JOIN kripi_accounts a ON a.id=taa.account_id
        WHERE taa.telegram_user_id=$1::uuid
        ORDER BY taa.assigned_at ASC`,
      [userId],
    ),
    db.query<{
      id: string; account_id: string; account_label: string; provider_card_id: string | null;
      last4: string | null; bin: string | null; label: string | null; cardholder_name: string | null;
      card_email: string | null; status: string; balance_usd_cents: string | bigint | null;
      balance_as_of: Date | null; expiry_month: number | null; expiry_year: number | null; created_at: Date;
    }>(
      `SELECT c.id,c.account_id,a.label AS account_label,c.provider_card_id,c.last4,c.bin,c.label,
              c.cardholder_name,c.card_email,c.status,c.balance_usd_cents,c.balance_as_of,
              c.expiry_month,c.expiry_year,c.created_at
         FROM cards c
         JOIN telegram_account_assignments taa ON taa.account_id=c.account_id
         JOIN kripi_accounts a ON a.id=c.account_id
        WHERE taa.telegram_user_id=$1::uuid
          AND c.archived_at IS NULL
        ORDER BY c.created_at DESC,c.id DESC`,
      [userId],
    ),
    db.query<{
      id: string; card_id: string; last4: string | null; amount_minor: string | bigint;
      currency: string; transaction_type: string | null; status: string; merchant_redacted: string | null;
      occurred_at: Date;
    }>(
      `SELECT t.id,t.card_id,c.last4,t.amount_minor,t.currency,t.transaction_type,t.status,t.merchant_redacted,t.occurred_at
         FROM card_transactions t
         JOIN cards c ON c.id=t.card_id
         JOIN telegram_account_assignments taa ON taa.account_id=c.account_id
        WHERE taa.telegram_user_id=$1::uuid
        ORDER BY t.occurred_at DESC,t.id DESC
        LIMIT 200`,
      [userId],
    ),
    db.query<{
      id: string; reference: string; initial_amount_usd_cents: string | bigint; status: string; origin: string;
      admin_note: string | null; provider_card_id: string | null; created_at: Date; updated_at: Date;
    }>(
      `SELECT id,reference,initial_amount_usd_cents,status,origin,admin_note,provider_card_id,created_at,updated_at
         FROM card_requests
        WHERE user_id=$1::uuid
        ORDER BY created_at DESC,id DESC
        LIMIT 100`,
      [userId],
    ),
    db.query<{
      id: string; reference: string; card_amount_usd_cents: string | bigint; status: string;
      submitted_at: Date; updated_at: Date; card_id: string; last4: string | null;
    }>(
      `SELECT fr.id,fr.reference,fr.card_amount_usd_cents,fr.status,fr.submitted_at,fr.updated_at,fr.card_id,c.last4
         FROM funding_requests fr
         JOIN cards c ON c.id=fr.card_id
        WHERE fr.user_id=$1::uuid
        ORDER BY fr.submitted_at DESC,fr.id DESC
        LIMIT 100`,
      [userId],
    ),
    db.query<{
      id: string | bigint; action: string; entity_type: string; entity_id: string | null;
      actor_type: string; actor_id: string | null; metadata_redacted: Record<string, unknown>;
      request_id: string | null; created_at: Date;
    }>(
      `SELECT id,action,entity_type,entity_id,actor_type,actor_id,metadata_redacted,request_id,created_at
         FROM audit_logs
        WHERE entity_id=$1
           OR metadata_redacted->>'userId'=$1
           OR metadata_redacted->>'telegramUserId'=$1
        ORDER BY created_at DESC
        LIMIT 100`,
      [userId],
    ),
  ]);

  const cardBalance = cards.rows.reduce((sum, card) => sum + BigInt(card.balance_usd_cents ?? 0), 0n);
  const funded = await db.query<{ total: string | bigint }>(
    `SELECT COALESCE(SUM(card_amount_usd_cents),0)::bigint AS total
       FROM funding_requests
      WHERE user_id=$1::uuid AND status='completed'`,
    [userId],
  );

  return {
    client: {
      id: row.id,
      telegramUserId: String(row.telegram_user_id),
      username: row.username,
      displayName: row.display_name,
      banned: Boolean(row.banned_at),
      bannedAt: row.banned_at?.toISOString() ?? null,
      joinedAt: row.joined_at.toISOString(),
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
      onboardingStatus: row.payment_status,
      totalFundedUsdCents: String(funded.rows[0]?.total ?? 0),
      totalCardBalanceUsdCents: cardBalance.toString(),
    },
    accounts: accounts.rows.map((account) => ({
      id: account.id,
      label: account.label,
      status: account.status,
      loginEmail: account.login_email,
      assignedAt: account.assigned_at.toISOString(),
    })),
    cards: cards.rows.map((card) => ({
      id: card.id,
      accountId: card.account_id,
      accountLabel: card.account_label,
      providerCardId: card.provider_card_id,
      last4: card.last4,
      bin: card.bin,
      label: card.label,
      cardholderName: card.cardholder_name,
      cardEmail: card.card_email,
      status: card.status,
      balanceUsdCents: card.balance_usd_cents == null ? null : String(card.balance_usd_cents),
      balanceAsOf: card.balance_as_of?.toISOString() ?? null,
      expiryMonth: card.expiry_month,
      expiryYear: card.expiry_year,
      createdAt: card.created_at.toISOString(),
    })),
    transactions: transactions.rows.map((tx) => ({
      id: tx.id,
      cardId: tx.card_id,
      cardLast4: tx.last4,
      amountMinor: String(tx.amount_minor),
      currency: tx.currency,
      type: tx.transaction_type,
      status: tx.status,
      merchant: tx.merchant_redacted,
      occurredAt: tx.occurred_at.toISOString(),
    })),
    cardRequests: cardRequests.rows.map((request) => ({
      id: request.id,
      reference: request.reference,
      amountUsdCents: String(request.initial_amount_usd_cents),
      status: request.status,
      origin: request.origin,
      adminNote: request.admin_note,
      providerCardId: request.provider_card_id,
      createdAt: request.created_at.toISOString(),
      updatedAt: request.updated_at.toISOString(),
    })),
    fundingRequests: fundingRequests.rows.map((request) => ({
      id: request.id,
      reference: request.reference,
      amountUsdCents: String(request.card_amount_usd_cents),
      status: request.status,
      cardId: request.card_id,
      cardLast4: request.last4,
      createdAt: request.submitted_at.toISOString(),
      updatedAt: request.updated_at.toISOString(),
    })),
    adminActivity: audit.rows.map((item) => ({
      id: String(item.id),
      action: item.action,
      entityType: item.entity_type,
      entityId: item.entity_id,
      actorType: item.actor_type,
      actorId: item.actor_id,
      metadata: item.metadata_redacted,
      requestId: item.request_id,
      createdAt: item.created_at.toISOString(),
    })),
  };
}
