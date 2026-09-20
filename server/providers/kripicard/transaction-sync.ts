import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction } from "@/server/database/pool";
import { decryptSecret } from "@/server/security/crypto";
import { KripicardClient } from "@/server/providers/kripicard/client";
import { KripicardError } from "@/server/providers/kripicard/errors";
import type { KripicardTransaction } from "@/server/providers/kripicard/schemas";

const LEASE_SECONDS = 120;
const MAX_FAILURE_BACKOFF_SECONDS = 3600;

type ClaimedCard = {
  cardId: string;
  accountId: string;
  providerCardId: string;
  encryptedApiKey: string;
  baselineCompleted: boolean;
};

type AssignedUser = {
  id: string;
};

function cents(value: number) {
  if (!Number.isFinite(value)) throw new Error("invalid_provider_money");
  return BigInt(Math.round(value * 100));
}

function parseProviderDate(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function transactionFingerprint(providerCardId: string, transaction: KripicardTransaction) {
  return createHash("sha256")
    .update(JSON.stringify({
      card: providerCardId,
      date: transaction.date,
      type: transaction.type,
      merchant: transaction.merchant ?? null,
      amount: transaction.amount,
      currency: transaction.currency.toUpperCase(),
      status: transaction.status,
      reasonCode: transaction.reason_code ?? null,
      reasonSource: transaction.reason_source ?? null,
    }))
    .digest("hex");
}

async function notificationsEnabled(db: PoolClient) {
  const result = await db.query<{ typed_value: unknown }>(
    `SELECT typed_value FROM settings WHERE key='telegram_transaction_notifications_enabled'`,
  );
  return result.rows[0]?.typed_value !== false;
}

async function currentAssignedUser(db: PoolClient, accountId: string): Promise<AssignedUser | null> {
  const result = await db.query<AssignedUser>(
    `SELECT tu.id
       FROM telegram_account_assignments taa
       JOIN telegram_users tu ON tu.id=taa.telegram_user_id
      WHERE taa.account_id=$1::uuid
        AND tu.banned_at IS NULL
      LIMIT 1`,
    [accountId],
  );
  return result.rows[0] ?? null;
}

async function claimDueCard(): Promise<ClaimedCard | null> {
  const env = parseServerEnv(process.env);
  return withTransaction(async (db) => {
    const result = await db.query<{
      card_id: string;
      account_id: string;
      provider_card_id: string;
      encrypted_api_key: string;
      baseline_completed: boolean | null;
    }>(
      `SELECT c.id AS card_id,
              c.account_id,
              c.provider_card_id,
              ka.encrypted_api_key,
              tss.baseline_completed
         FROM cards c
         JOIN kripi_accounts ka ON ka.id=c.account_id
         LEFT JOIN transaction_sync_state tss ON tss.card_id=c.id
        WHERE c.archived_at IS NULL
          AND c.provider_card_id IS NOT NULL
          AND c.status <> 'closed'
          AND ka.archived_at IS NULL
          AND ka.status NOT IN ('disabled','archived')
          AND ka.encrypted_api_key LIKE 'v1.%'
          AND COALESCE(tss.next_attempt_at, now()) <= now()
          AND COALESCE(tss.lease_until, '-infinity'::timestamptz) <= now()
        ORDER BY COALESCE(tss.last_succeeded_at, '-infinity'::timestamptz) ASC, c.created_at ASC
        FOR UPDATE OF c SKIP LOCKED
        LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return null;

    await db.query(
      `INSERT INTO transaction_sync_state(card_id, baseline_completed, last_started_at, lease_until, updated_at)
       VALUES ($1::uuid, false, now(), now()+($2::int * interval '1 second'), now())
       ON CONFLICT (card_id) DO UPDATE SET
         last_started_at=now(),
         lease_until=now()+($2::int * interval '1 second'),
         updated_at=now()`,
      [row.card_id, Math.max(LEASE_SECONDS, Math.ceil(env.KRIPICARD_REQUEST_TIMEOUT_MS / 1000) * 3)],
    );

    return {
      cardId: row.card_id,
      accountId: row.account_id,
      providerCardId: row.provider_card_id,
      encryptedApiKey: row.encrypted_api_key,
      baselineCompleted: row.baseline_completed === true,
    };
  });
}

async function recordFailure(card: ClaimedCard, error: unknown) {
  const providerError = error instanceof KripicardError ? error : null;
  await withTransaction(async (db) => {
    const state = await db.query<{ consecutive_failures: number }>(
      `SELECT consecutive_failures FROM transaction_sync_state WHERE card_id=$1::uuid FOR UPDATE`,
      [card.cardId],
    );
    const failures = (state.rows[0]?.consecutive_failures ?? 0) + 1;
    const exponential = Math.min(MAX_FAILURE_BACKOFF_SECONDS, 60 * 2 ** Math.min(failures - 1, 6));
    const providerDelay = providerError?.metadata.retryAfterSeconds ?? 0;
    const delaySeconds = Math.max(exponential, providerDelay);
    const code = providerError?.kind ?? (error instanceof Error ? error.name : "transaction_sync_error");
    const message = error instanceof Error ? error.message : "Kripicard transaction synchronization failed.";

    await db.query(
      `UPDATE transaction_sync_state
          SET consecutive_failures=$2,
              next_attempt_at=now()+($3::int * interval '1 second'),
              lease_until=NULL,
              last_failed_at=now(),
              last_error_code=$4,
              last_error_message=$5,
              updated_at=now()
        WHERE card_id=$1::uuid`,
      [card.cardId, failures, delaySeconds, String(code).slice(0, 120), message.slice(0, 500)],
    );
    await db.query(
      `INSERT INTO audit_logs(actor_type, action, entity_type, entity_id, metadata_redacted)
       VALUES ('worker','card.transactions.sync_failed','card',$1,$2::jsonb)`,
      [card.cardId, JSON.stringify({ errorCode: String(code).slice(0, 120), failures, nextAttemptSeconds: delaySeconds })],
    );
  });
}

async function persistSync(card: ClaimedCard, response: Awaited<ReturnType<KripicardClient["transactions"]>>) {
  const env = parseServerEnv(process.env);
  return withTransaction(async (db) => {
    const locked = await db.query<{ baseline_completed: boolean }>(
      `SELECT baseline_completed FROM transaction_sync_state WHERE card_id=$1::uuid FOR UPDATE`,
      [card.cardId],
    );
    const baselineCompleted = locked.rows[0]?.baseline_completed === true;
    const notify = baselineCompleted && await notificationsEnabled(db);
    const assignedUser = notify ? await currentAssignedUser(db, card.accountId) : null;
    let inserted = 0;
    let notificationsQueued = 0;

    await db.query(
      `UPDATE cards
          SET balance_usd_cents=$2, balance_as_of=now(), synced_at=now(), updated_at=now()
        WHERE id=$1::uuid`,
      [card.cardId, cents(response.data.balance)],
    );
    await db.query(
      `UPDATE kripi_accounts
          SET provider_capabilities=provider_capabilities || '{"transactions":true}'::jsonb,
              updated_at=now()
        WHERE id=$1::uuid`,
      [card.accountId],
    );

    for (const tx of response.data.transactions) {
      const occurredAt = parseProviderDate(tx.date);
      if (!occurredAt) continue;
      const fingerprint = transactionFingerprint(card.providerCardId, tx);
      const result = await db.query<{ id: string; inserted: boolean }>(
        `INSERT INTO card_transactions(
           card_id, fingerprint, amount_minor, currency, transaction_type, status,
           merchant_redacted, safe_metadata, occurred_at, synced_at
         )
         VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,now())
         ON CONFLICT (card_id, fingerprint) WHERE fingerprint IS NOT NULL DO UPDATE SET
           status=EXCLUDED.status,
           merchant_redacted=EXCLUDED.merchant_redacted,
           safe_metadata=EXCLUDED.safe_metadata,
           synced_at=now()
         RETURNING id, (xmax = 0) AS inserted`,
        [
          card.cardId,
          fingerprint,
          cents(tx.amount),
          tx.currency.toUpperCase(),
          tx.type,
          tx.status,
          tx.merchant ?? null,
          JSON.stringify({
            reason: tx.reason ?? null,
            reasonCode: tx.reason_code ?? null,
            reasonSource: tx.reason_source ?? null,
            providerDate: tx.date,
          }),
          occurredAt,
        ],
      );
      const stored = result.rows[0];
      if (!stored?.inserted) continue;
      inserted += 1;

      if (notify && assignedUser) {
        const outbox = await db.query(
          `INSERT INTO outbox_events(topic, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
           VALUES ('telegram','card_transaction',$1,'card_transaction.detected',$2::jsonb,$3)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [
            stored.id,
            JSON.stringify({ transactionId: stored.id, intendedUserId: assignedUser.id }),
            `telegram:card-transaction:${stored.id}:user:${assignedUser.id}`,
          ],
        );
        if (outbox.rowCount === 1) {
          notificationsQueued += 1;
          await db.query(
            `UPDATE card_transactions
                SET notification_status='queued', notification_queued_at=now(), notification_error=NULL
              WHERE id=$1::uuid`,
            [stored.id],
          );
        }
      }
    }

    await db.query(
      `UPDATE transaction_sync_state
          SET baseline_completed=true,
              consecutive_failures=0,
              next_attempt_at=now()+($2::int * interval '1 second'),
              lease_until=NULL,
              last_succeeded_at=now(),
              last_error_code=NULL,
              last_error_message=NULL,
              updated_at=now()
        WHERE card_id=$1::uuid`,
      [card.cardId, env.KRIPICARD_TRANSACTION_SYNC_INTERVAL_SECONDS],
    );

    await db.query(
      `INSERT INTO audit_logs(actor_type, action, entity_type, entity_id, metadata_redacted)
       VALUES ('worker','card.transactions.synced','card',$1,$2::jsonb)`,
      [card.cardId, JSON.stringify({
        received: response.data.transactions.length,
        inserted,
        notificationsQueued,
        baselineEstablished: !baselineCompleted,
      })],
    );

    return {
      received: response.data.transactions.length,
      inserted,
      notificationsQueued,
      baselineEstablished: !baselineCompleted,
    };
  });
}

async function syncClaimedCard(card: ClaimedCard) {
  const client = new KripicardClient({ apiKey: decryptSecret(card.encryptedApiKey) });
  const response = await client.transactions({ cardId: card.providerCardId });
  return persistSync(card, response);
}

export async function syncKripicardTransactionsSystem(requestId: string, requestedLimit?: number) {
  const env = parseServerEnv(process.env);
  const limit = Math.max(1, Math.min(env.KRIPICARD_TRANSACTION_SYNC_BATCH_SIZE, requestedLimit ?? env.KRIPICARD_TRANSACTION_SYNC_BATCH_SIZE));
  const run = await getPool().query<{ id: string }>(
    `INSERT INTO job_runs(job_type, job_key, status, safe_metadata)
     VALUES ('kripicard_transaction_sync','kripicard-transactions','running',$1::jsonb)
     RETURNING id`,
    [JSON.stringify({ requestId, limit })],
  );
  const runId = run.rows[0]!.id;
  const summary = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    received: 0,
    inserted: 0,
    notificationsQueued: 0,
    baselinesEstablished: 0,
  };

  try {
    for (let index = 0; index < limit; index += 1) {
      const card = await claimDueCard();
      if (!card) break;
      summary.claimed += 1;
      try {
        const result = await syncClaimedCard(card);
        summary.succeeded += 1;
        summary.received += result.received;
        summary.inserted += result.inserted;
        summary.notificationsQueued += result.notificationsQueued;
        if (result.baselineEstablished) summary.baselinesEstablished += 1;
      } catch (error) {
        summary.failed += 1;
        await recordFailure(card, error);
      }
    }

    await getPool().query(
      `UPDATE job_runs SET status='succeeded', finished_at=now(), safe_metadata=$2::jsonb WHERE id=$1::uuid`,
      [runId, JSON.stringify({ requestId, ...summary })],
    );
    return summary;
  } catch (error) {
    const errorCode = error instanceof Error ? error.name : "transaction_sync_job_error";
    await getPool().query(
      `UPDATE job_runs SET status='failed', finished_at=now(), error_redacted=$2, safe_metadata=$3::jsonb WHERE id=$1::uuid`,
      [runId, String(errorCode).slice(0, 160), JSON.stringify({ requestId, ...summary })],
    );
    throw error;
  }
}
