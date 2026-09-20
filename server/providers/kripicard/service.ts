import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { ApiError } from "@/server/http/api";
import { getPool, withTransaction } from "@/server/database/pool";
import { decryptSecret } from "@/server/security/crypto";
import { auditAdminEvent } from "@/server/auth/service";
import type { AuthSession } from "@/server/auth/types";
import { KripicardClient } from "@/server/providers/kripicard/client";
import { KripicardError } from "@/server/providers/kripicard/errors";
import type { KripicardListCard, KripicardTransaction } from "@/server/providers/kripicard/schemas";
import { runtimeControlEnabled } from "@/server/operations/controls";

function cents(value: number) {
  if (!Number.isFinite(value)) throw new ApiError(502, "provider_error", "Kripicard returned an invalid monetary value.");
  return BigInt(Math.round(value * 100));
}

function normalizeCardStatus(status: string): "unknown" | "active" | "frozen" | "closed" | "expired" | "attention" {
  switch (status.trim().toLowerCase()) {
    case "active": return "active";
    case "frozen":
    case "freeze":
    case "suspended": return "frozen";
    case "closed":
    case "deleted":
    case "cancelled": return "closed";
    case "expired": return "expired";
    default: return "unknown";
  }
}

function parseProviderDate(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function providerErrorToApi(error: unknown): ApiError {
  if (!(error instanceof KripicardError)) return new ApiError(502, "provider_error", "Kripicard request failed.");
  switch (error.kind) {
    case "provider_rejected": return new ApiError(422, "provider_rejected", error.message);
    case "timeout": return new ApiError(504, "provider_timeout", error.message);
    case "rate_limited": return new ApiError(503, "provider_rate_limited", error.message);
    case "invalid_response": return new ApiError(502, "provider_invalid_response", error.message);
    default: return new ApiError(502, "provider_error", error.message);
  }
}

type AccountCredentialRow = {
  id: string;
  encrypted_api_key: string;
  status: string;
};

async function loadAccountClient(accountId: string) {
  const result = await getPool().query<AccountCredentialRow>(
    `SELECT id, encrypted_api_key, status
       FROM kripi_accounts
      WHERE id = $1::uuid AND archived_at IS NULL`,
    [accountId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "not_found", "Account not found.");
  if (row.status === "disabled" || row.status === "archived") {
    throw new ApiError(409, "account_unavailable", "This account is disabled or archived.");
  }
  if (!row.encrypted_api_key.startsWith("v1.")) {
    throw new ApiError(409, "secret_unavailable", "Update this account with a real encrypted Kripicard API key first.");
  }
  return { client: new KripicardClient({ apiKey: decryptSecret(row.encrypted_api_key) }), accountId: row.id };
}

async function recordSyncFailure(accountId: string, error: ApiError) {
  await withTransaction(async (db) => {
    const current = await db.query<{ consecutive_failures: number }>(
      `SELECT consecutive_failures FROM account_sync_state WHERE account_id = $1::uuid FOR UPDATE`,
      [accountId],
    );
    const failures = (current.rows[0]?.consecutive_failures ?? 0) + 1;
    const delaySeconds = Math.min(3600, 60 * 2 ** Math.min(failures - 1, 6));
    await db.query(
      `INSERT INTO account_sync_state(account_id, consecutive_failures, next_attempt_at, last_failed_at, last_error_code, last_error_message, updated_at)
       VALUES ($1::uuid, $2, now() + ($3 || ' seconds')::interval, now(), $4, $5, now())
       ON CONFLICT (account_id) DO UPDATE SET
         consecutive_failures = EXCLUDED.consecutive_failures,
         next_attempt_at = EXCLUDED.next_attempt_at,
         last_failed_at = EXCLUDED.last_failed_at,
         last_error_code = EXCLUDED.last_error_code,
         last_error_message = EXCLUDED.last_error_message,
         updated_at = now()`,
      [accountId, failures, delaySeconds, error.code, error.message.slice(0, 500)],
    );
    await db.query(
      `UPDATE kripi_accounts
          SET status = 'attention', last_error_code = $2, last_error_message = $3, updated_at = now()
        WHERE id = $1::uuid`,
      [accountId, error.code, error.message.slice(0, 500)],
    );
  });
}

async function markSyncStarted(accountId: string) {
  await getPool().query(
    `INSERT INTO account_sync_state(account_id, last_started_at, updated_at)
     VALUES ($1::uuid, now(), now())
     ON CONFLICT (account_id) DO UPDATE SET last_started_at = now(), updated_at = now()`,
    [accountId],
  );
}

async function markSyncSuccess(db: PoolClient, accountId: string) {
  await db.query(
    `INSERT INTO account_sync_state(account_id, consecutive_failures, next_attempt_at, last_succeeded_at, last_error_code, last_error_message, updated_at)
     VALUES ($1::uuid, 0, NULL, now(), NULL, NULL, now())
     ON CONFLICT (account_id) DO UPDATE SET
       consecutive_failures = 0,
       next_attempt_at = NULL,
       last_succeeded_at = now(),
       last_error_code = NULL,
       last_error_message = NULL,
       updated_at = now()`,
    [accountId],
  );
  await db.query(
    `UPDATE kripi_accounts
        SET status = 'connected', last_synced_at = now(), last_error_code = NULL, last_error_message = NULL, updated_at = now()
      WHERE id = $1::uuid`,
    [accountId],
  );
}

async function upsertProviderCard(db: PoolClient, accountId: string, card: KripicardListCard) {
  const balance = card.balance == null ? null : cents(card.balance);
  const providerCreatedAt = parseProviderDate(card.created_at);
  const safeMetadata = {
    cardBrand: card.card_brand ?? null,
    cardType: card.card_type ?? null,
    missingFromProvider: false,
  };
  await db.query(
    `INSERT INTO cards(account_id, provider_card_id, last4, cardholder_name, status, balance_usd_cents, balance_as_of, safe_metadata, synced_at, provider_created_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, CASE WHEN $6::bigint IS NULL THEN NULL ELSE now() END, $7::jsonb, now(), $8)
     ON CONFLICT (account_id, provider_card_id) WHERE provider_card_id IS NOT NULL DO UPDATE SET
       last4 = COALESCE(EXCLUDED.last4, cards.last4),
       cardholder_name = COALESCE(EXCLUDED.cardholder_name, cards.cardholder_name),
       status = EXCLUDED.status,
       balance_usd_cents = COALESCE(EXCLUDED.balance_usd_cents, cards.balance_usd_cents),
       balance_as_of = CASE WHEN EXCLUDED.balance_usd_cents IS NULL THEN cards.balance_as_of ELSE now() END,
       safe_metadata = cards.safe_metadata || EXCLUDED.safe_metadata,
       synced_at = now(),
       provider_created_at = COALESCE(EXCLUDED.provider_created_at, cards.provider_created_at),
       archived_at = NULL,
       updated_at = now()`,
    [accountId, card.card_id, card.last4 ?? null, card.name_on_card ?? null, normalizeCardStatus(card.status), balance, JSON.stringify(safeMetadata), providerCreatedAt],
  );
}

export async function verifyKripicardAccount(accountId: string, session: AuthSession, request: Request, requestId: string) {
  const { client } = await loadAccountClient(accountId);
  try {
    const response = await client.listCards();
    await getPool().query(
      `UPDATE kripi_accounts
          SET status = 'connected', last_verified_at = now(), last_error_code = NULL, last_error_message = NULL,
              provider_capabilities = provider_capabilities || $2::jsonb, updated_at = now()
        WHERE id = $1::uuid`,
      [accountId, JSON.stringify({ cardsList: true })],
    );
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "account.provider.verify",
      entityType: "kripi_account",
      entityId: accountId,
      request,
      requestId,
      metadata: { cardCount: response.data.length },
    });
    return { connected: true, cardCount: response.data.length };
  } catch (error) {
    const apiError = providerErrorToApi(error);
    await recordSyncFailure(accountId, apiError);
    throw apiError;
  }
}

export async function syncKripicardAccountCards(accountId: string, session: AuthSession, request: Request, requestId: string) {
  const { client } = await loadAccountClient(accountId);
  await markSyncStarted(accountId);
  try {
    const response = await client.listCards();
    const providerIds = response.data.map((card) => card.card_id);
    await withTransaction(async (db) => {
      for (const card of response.data) await upsertProviderCard(db, accountId, card);
      if (providerIds.length > 0) {
        await db.query(
          `UPDATE cards
              SET status = 'attention', safe_metadata = safe_metadata || '{"missingFromProvider":true}'::jsonb, synced_at = now(), updated_at = now()
            WHERE account_id = $1::uuid
              AND archived_at IS NULL
              AND provider_card_id IS NOT NULL
              AND NOT (provider_card_id = ANY($2::text[]))`,
          [accountId, providerIds],
        );
      } else {
        await db.query(
          `UPDATE cards
              SET status = 'attention', safe_metadata = safe_metadata || '{"missingFromProvider":true}'::jsonb, synced_at = now(), updated_at = now()
            WHERE account_id = $1::uuid AND archived_at IS NULL AND provider_card_id IS NOT NULL`,
          [accountId],
        );
      }
      await markSyncSuccess(db, accountId);
    });
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "account.provider.cards_sync",
      entityType: "kripi_account",
      entityId: accountId,
      request,
      requestId,
      metadata: { cardCount: response.data.length },
    });
    return { syncedCards: response.data.length };
  } catch (error) {
    const apiError = providerErrorToApi(error);
    await recordSyncFailure(accountId, apiError);
    throw apiError;
  }
}


export async function syncKripicardAccountsSystem(requestId: string, limit = 25) {
  const accounts = await getPool().query<{ id: string }>(
    `SELECT a.id
       FROM kripi_accounts a
       LEFT JOIN account_sync_state ass ON ass.account_id=a.id
      WHERE a.archived_at IS NULL
        AND a.status <> 'disabled'
        AND COALESCE(ass.next_attempt_at, now()) <= now()
      ORDER BY COALESCE(ass.last_succeeded_at, 'epoch'::timestamptz) ASC, a.id ASC
      LIMIT $1`,
    [Math.max(1, Math.min(200, limit))],
  );
  let succeeded = 0;
  let failed = 0;
  const failedAccountIds: string[] = [];
  for (const account of accounts.rows) {
    try {
      const { client } = await loadAccountClient(account.id);
      await markSyncStarted(account.id);
      const response = await client.listCards();
      const providerIds = response.data.map((card) => card.card_id);
      await withTransaction(async (db) => {
        for (const card of response.data) await upsertProviderCard(db, account.id, card);
        if (providerIds.length > 0) {
          await db.query(
            `UPDATE cards
                SET status='attention',safe_metadata=safe_metadata || '{"missingFromProvider":true}'::jsonb,synced_at=now(),updated_at=now()
              WHERE account_id=$1::uuid AND archived_at IS NULL AND provider_card_id IS NOT NULL
                AND NOT (provider_card_id = ANY($2::text[]))`,
            [account.id, providerIds],
          );
        } else {
          await db.query(
            `UPDATE cards
                SET status='attention',safe_metadata=safe_metadata || '{"missingFromProvider":true}'::jsonb,synced_at=now(),updated_at=now()
              WHERE account_id=$1::uuid AND archived_at IS NULL AND provider_card_id IS NOT NULL`,
            [account.id],
          );
        }
        await markSyncSuccess(db, account.id);
      });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      failedAccountIds.push(account.id);
      const apiError = providerErrorToApi(error);
      await recordSyncFailure(account.id, apiError);
    }
  }
  return { requestId, attempted: accounts.rows.length, succeeded, failed, failedAccountIds };
}

type CardProviderRow = {
  id: string;
  account_id: string;
  provider_card_id: string | null;
  encrypted_api_key: string;
  account_status: string;
};

async function loadCardClient(cardId: string) {
  const result = await getPool().query<CardProviderRow>(
    `SELECT c.id, c.account_id, c.provider_card_id, a.encrypted_api_key, a.status AS account_status
       FROM cards c
       JOIN kripi_accounts a ON a.id = c.account_id
      WHERE c.id = $1::uuid AND c.archived_at IS NULL AND a.archived_at IS NULL`,
    [cardId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "not_found", "Card not found.");
  if (!row.provider_card_id) throw new ApiError(409, "provider_reference_missing", "This card does not have a Kripicard card ID yet.");
  if (row.account_status === "disabled" || row.account_status === "archived") {
    throw new ApiError(409, "account_unavailable", "The owning Kripicard account is disabled or archived.");
  }
  if (!row.encrypted_api_key.startsWith("v1.")) throw new ApiError(409, "secret_unavailable", "The owning account needs a real encrypted API key.");
  return {
    row,
    client: new KripicardClient({ apiKey: decryptSecret(row.encrypted_api_key) }),
  };
}

export async function getLiveKripicardCardDetails(cardId: string, session: AuthSession, request: Request, requestId: string) {
  const { row, client } = await loadCardClient(cardId);
  try {
    const response = await client.cardDetails({ cardId: row.provider_card_id! });
    const [month, yearRaw] = response.expiry.split("/");
    const expiryYear = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
    await withTransaction(async (db) => {
      await db.query(
        `UPDATE cards
            SET status = $2, balance_usd_cents = $3, balance_as_of = now(), synced_at = now(), updated_at = now()
          WHERE id = $1::uuid`,
        [cardId, normalizeCardStatus(response.status), cents(response.balance)],
      );
      await db.query(
        `UPDATE kripi_accounts SET provider_capabilities = provider_capabilities || '{"cardDetails":true}'::jsonb, updated_at = now() WHERE id = $1::uuid`,
        [row.account_id],
      );
    });
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "card.provider.sensitive_reveal",
      entityType: "card",
      entityId: cardId,
      request,
      requestId,
    });
    return {
      cardNumber: response.card_number,
      expiry: response.expiry,
      cvv: response.cvv,
      balanceUsdCents: cents(response.balance).toString(),
      status: normalizeCardStatus(response.status),
      expiryMonth: Number(month),
      expiryYear,
    };
  } catch (error) {
    throw providerErrorToApi(error);
  }
}

function transactionFingerprint(providerCardId: string, transaction: KripicardTransaction) {
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

export async function syncKripicardCardTransactions(cardId: string, session: AuthSession, request: Request, requestId: string) {
  const { row, client } = await loadCardClient(cardId);
  try {
    const response = await client.transactions({ cardId: row.provider_card_id! });
    let inserted = 0;
    await withTransaction(async (db) => {
      await db.query(
        `UPDATE cards SET balance_usd_cents = $2, balance_as_of = now(), synced_at = now(), updated_at = now() WHERE id = $1::uuid`,
        [cardId, cents(response.data.balance)],
      );
      await db.query(
        `UPDATE kripi_accounts SET provider_capabilities = provider_capabilities || '{"transactions":true}'::jsonb, updated_at = now() WHERE id = $1::uuid`,
        [row.account_id],
      );
      for (const tx of response.data.transactions) {
        const occurredAt = parseProviderDate(tx.date);
        if (!occurredAt) continue;
        const fingerprint = transactionFingerprint(row.provider_card_id!, tx);
        const result = await db.query(
          `INSERT INTO card_transactions(card_id, fingerprint, amount_minor, currency, transaction_type, status, merchant_redacted, safe_metadata, occurred_at, synced_at)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, now())
           ON CONFLICT (card_id, fingerprint) WHERE fingerprint IS NOT NULL DO UPDATE SET
             status = EXCLUDED.status,
             merchant_redacted = EXCLUDED.merchant_redacted,
             safe_metadata = EXCLUDED.safe_metadata,
             synced_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [
            cardId,
            fingerprint,
            cents(tx.amount),
            tx.currency.toUpperCase(),
            tx.type,
            tx.status,
            tx.merchant ?? null,
            JSON.stringify({ reason: tx.reason ?? null, reasonCode: tx.reason_code ?? null, reasonSource: tx.reason_source ?? null, providerDate: tx.date }),
            occurredAt,
          ],
        );
        if (result.rows[0]?.inserted === true) inserted += 1;
      }
      const env = parseServerEnv(process.env);
      // A manual sync is an explicit operator baseline. Do not emit historical notifications from it,
      // but let the scheduled Phase 17 worker notify only transactions discovered after this point.
      await db.query(
        `INSERT INTO transaction_sync_state(card_id, baseline_completed, consecutive_failures, next_attempt_at, lease_until, last_succeeded_at, last_error_code, last_error_message, updated_at)
         VALUES ($1::uuid, true, 0, now()+($2::int * interval '1 second'), NULL, now(), NULL, NULL, now())
         ON CONFLICT (card_id) DO UPDATE SET
           baseline_completed=true,
           consecutive_failures=0,
           next_attempt_at=now()+($2::int * interval '1 second'),
           lease_until=NULL,
           last_succeeded_at=now(),
           last_error_code=NULL,
           last_error_message=NULL,
           updated_at=now()`,
        [cardId, env.KRIPICARD_TRANSACTION_SYNC_INTERVAL_SECONDS],
      );
    });
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "card.provider.transactions_sync",
      entityType: "card",
      entityId: cardId,
      request,
      requestId,
      metadata: { received: response.data.transactions.length, inserted },
    });
    return { received: response.data.transactions.length, inserted, balanceUsdCents: cents(response.data.balance).toString() };
  } catch (error) {
    throw providerErrorToApi(error);
  }
}


type ProviderCardState = {
  status: "unknown" | "active" | "frozen" | "closed" | "expired" | "attention";
  balanceUsdCents: bigint | null;
};

async function readProviderCardState(cardId: string, row: CardProviderRow, client: KripicardClient): Promise<ProviderCardState> {
  const response = await client.listCards();
  const card = response.data.find((item) => item.card_id === row.provider_card_id);
  if (!card) {
    await getPool().query(
      `UPDATE cards
          SET status = 'attention', safe_metadata = safe_metadata || '{"missingFromProvider":true}'::jsonb, synced_at = now(), updated_at = now()
        WHERE id = $1::uuid`,
      [cardId],
    );
    throw new ApiError(409, "provider_card_missing", "Kripicard no longer returned this card in the account card list.");
  }
  const status = normalizeCardStatus(card.status);
  const balanceUsdCents = card.balance == null ? null : cents(card.balance);
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE cards
          SET status = $2,
              balance_usd_cents = COALESCE($3::bigint, balance_usd_cents),
              balance_as_of = CASE WHEN $3::bigint IS NULL THEN balance_as_of ELSE now() END,
              safe_metadata = safe_metadata || '{"missingFromProvider":false}'::jsonb,
              synced_at = now(), updated_at = now()
        WHERE id = $1::uuid`,
      [cardId, status, balanceUsdCents],
    );
    await db.query(
      `UPDATE kripi_accounts
          SET provider_capabilities = provider_capabilities || '{"cardsList":true}'::jsonb, last_synced_at = now(), updated_at = now()
        WHERE id = $1::uuid`,
      [row.account_id],
    );
  });
  return { status, balanceUsdCents };
}

export async function refreshKripicardCardStatus(cardId: string, session: AuthSession, request: Request, requestId: string) {
  const { row, client } = await loadCardClient(cardId);
  try {
    const state = await readProviderCardState(cardId, row, client);
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "card.provider.status_refresh",
      entityType: "card",
      entityId: cardId,
      request,
      requestId,
      metadata: { status: state.status },
    });
    return {
      status: state.status,
      balanceUsdCents: state.balanceUsdCents?.toString() ?? null,
      refreshedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw providerErrorToApi(error);
  }
}

function isAmbiguousWriteError(error: unknown) {
  return error instanceof KripicardError && ["timeout", "network", "provider_error", "invalid_response"].includes(error.kind);
}

function looksUnsupported(error: KripicardError) {
  const text = error.message.toLowerCase();
  return ["premium", "unsupported", "not supported", "not available", "not enabled", "permission", "forbidden"].some((term) => text.includes(term));
}

async function setFreezeCapability(accountId: string, value: boolean, note?: string) {
  const patch: Record<string, unknown> = { freezeUnfreeze: value };
  if (note) patch.freezeUnfreezeNote = note.slice(0, 160);
  await getPool().query(
    `UPDATE kripi_accounts SET provider_capabilities = provider_capabilities || $2::jsonb, updated_at = now() WHERE id = $1::uuid`,
    [accountId, JSON.stringify(patch)],
  );
}

async function finalizeStateOperation(operationId: string, status: "succeeded" | "failed" | "needs_reconciliation", providerStatus: string, providerResponseRef: string | null) {
  await getPool().query(
    `UPDATE card_operations
        SET status = $2, provider_status = $3, provider_response_ref = $4, updated_at = now()
      WHERE id = $1::uuid`,
    [operationId, status, providerStatus, providerResponseRef],
  );
}

export async function setKripicardCardFrozenState(
  cardId: string,
  action: "freeze" | "unfreeze",
  session: AuthSession,
  request: Request,
  requestId: string,
) {
  const env = parseServerEnv(process.env);
  if (!env.ENABLE_LIVE_PROVIDER_WRITES || !env.ENABLE_KRIPICARD_CARD_STATE_WRITES) {
    throw new ApiError(503, "feature_disabled", "Kripicard freeze/unfreeze writes are disabled by deployment configuration.");
  }
  if (!await runtimeControlEnabled("provider_writes")) {
    throw new ApiError(503, "runtime_kill_switch", "Kripicard writes are disabled by an emergency runtime control.");
  }

  const { row, client } = await loadCardClient(cardId);
  const desiredStatus = action === "freeze" ? "frozen" : "active";

  // Refresh first so repeated clicks on an already-achieved state do not create another write.
  let before: ProviderCardState;
  try {
    before = await readProviderCardState(cardId, row, client);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw providerErrorToApi(error);
  }
  if (before.status === desiredStatus) {
    await auditAdminEvent({
      adminId: session.principal.id,
      action: "card.provider.state_noop",
      entityType: "card",
      entityId: cardId,
      request,
      requestId,
      metadata: { action, status: before.status },
    });
    return {
      operationId: null,
      status: before.status,
      balanceUsdCents: before.balanceUsdCents?.toString() ?? null,
      noOp: true,
      reconciled: true,
      needsReconciliation: false,
    };
  }

  const idempotencyKey = `card-state:${cardId}:${action}:${randomUUID()}`;
  const requestHash = createHash("sha256").update(JSON.stringify({ cardId, providerCardId: row.provider_card_id, action })).digest("hex");
  let operationId: string;
  try {
    const created = await getPool().query<{ id: string }>(
      `INSERT INTO card_operations(card_id, account_id, operation_type, idempotency_key, request_hash, provider_status, status, created_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'submitting', 'pending', $6::uuid)
       RETURNING id`,
      [cardId, row.account_id, action, idempotencyKey, requestHash, session.principal.id],
    );
    operationId = created.rows[0]!.id;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError(409, "operation_in_progress", "This card already has an unresolved freeze/unfreeze operation. Reconcile it before trying again.");
    }
    throw error;
  }

  let providerResponse;
  try {
    providerResponse = await client.freezeUnfreeze({ cardId: row.provider_card_id!, action });
  } catch (error) {
    if (isAmbiguousWriteError(error)) {
      try {
        const reconciledState = await readProviderCardState(cardId, row, client);
        if (reconciledState.status === desiredStatus) {
          await finalizeStateOperation(operationId, "succeeded", desiredStatus, "reconciled_by_cards_list");
          await setFreezeCapability(row.account_id, true);
          await auditAdminEvent({
            adminId: session.principal.id,
            action: `card.provider.${action}`,
            entityType: "card",
            entityId: cardId,
            request,
            requestId,
            metadata: { operationId, result: "succeeded_after_reconciliation" },
          });
          return {
            operationId,
            status: desiredStatus,
            balanceUsdCents: reconciledState.balanceUsdCents?.toString() ?? null,
            noOp: false,
            reconciled: true,
            needsReconciliation: false,
          };
        }
      } catch {
        // Keep the original ambiguous result. Never retry the write automatically.
      }
      await finalizeStateOperation(operationId, "needs_reconciliation", "unknown", "ambiguous_write_outcome");
      await auditAdminEvent({
        adminId: session.principal.id,
        action: `card.provider.${action}`,
        entityType: "card",
        entityId: cardId,
        request,
        requestId,
        metadata: { operationId, result: "needs_reconciliation" },
      });
      return {
        operationId,
        status: before.status,
        balanceUsdCents: before.balanceUsdCents?.toString() ?? null,
        noOp: false,
        reconciled: false,
        needsReconciliation: true,
      };
    }

    const apiError = providerErrorToApi(error);
    await finalizeStateOperation(operationId, "failed", "rejected", `error:${apiError.code}`);
    if (error instanceof KripicardError && looksUnsupported(error)) {
      await setFreezeCapability(row.account_id, false, error.message);
    }
    await auditAdminEvent({
      adminId: session.principal.id,
      action: `card.provider.${action}`,
      entityType: "card",
      entityId: cardId,
      request,
      requestId,
      metadata: { operationId, result: "failed", errorCode: apiError.code },
    });
    throw apiError;
  }

  // The provider explicitly accepted the write. From this point onward, any local
  // persistence failure must never be turned into a retryable provider failure.
  try {
    await withTransaction(async (db) => {
      await db.query(
        `UPDATE cards SET status = $2, synced_at = now(), updated_at = now() WHERE id = $1::uuid`,
        [cardId, desiredStatus],
      );
      await db.query(
        `UPDATE card_operations
            SET status = 'succeeded', provider_status = $2, provider_response_ref = $3, updated_at = now()
          WHERE id = $1::uuid`,
        [operationId, desiredStatus, `freeze_unfreeze:${createHash("sha256").update(providerResponse.message).digest("hex").slice(0, 16)}`],
      );
      await db.query(
        `UPDATE kripi_accounts SET provider_capabilities = provider_capabilities || '{"freezeUnfreeze":true}'::jsonb, updated_at = now() WHERE id = $1::uuid`,
        [row.account_id],
      );
    });
  } catch {
    try {
      await finalizeStateOperation(operationId, "needs_reconciliation", "provider_accepted_local_persistence_failed", "provider_accepted");
    } catch {
      // The original pending operation remains and the unique index blocks another state write.
    }
    throw new ApiError(503, "persistence_error_after_provider_write", "Kripicard accepted the card-state change, but AccAbad could not persist the result. Do not retry the write; reconcile the card state first.");
  }

  await auditAdminEvent({
    adminId: session.principal.id,
    action: `card.provider.${action}`,
    entityType: "card",
    entityId: cardId,
    request,
    requestId,
    metadata: { operationId, result: "succeeded" },
  });
  return {
    operationId,
    status: desiredStatus,
    balanceUsdCents: before.balanceUsdCents?.toString() ?? null,
    noOp: false,
    reconciled: false,
    needsReconciliation: false,
  };
}

export async function listStoredCardTransactions(cardId: string, limit = 100) {
  const capped = Math.min(Math.max(limit, 1), 200);
  const result = await getPool().query<{
    id: string;
    amount_minor: string | bigint;
    currency: string;
    transaction_type: string | null;
    status: string;
    merchant_redacted: string | null;
    safe_metadata: Record<string, unknown>;
    occurred_at: Date | string;
  }>(
    `SELECT id, amount_minor, currency, transaction_type, status, merchant_redacted, safe_metadata, occurred_at
       FROM card_transactions
      WHERE card_id = $1::uuid
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2`,
    [cardId, capped],
  );
  return result.rows.map((row) => ({
    id: row.id,
    amountMinor: (typeof row.amount_minor === "bigint" ? row.amount_minor : BigInt(row.amount_minor)).toString(),
    currency: row.currency,
    type: row.transaction_type,
    status: row.status,
    merchant: row.merchant_redacted,
    reason: typeof row.safe_metadata?.reason === "string" ? row.safe_metadata.reason : null,
    reasonCode: typeof row.safe_metadata?.reasonCode === "string" ? row.safe_metadata.reasonCode : null,
    occurredAt: (row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at)).toISOString(),
  }));
}

async function auditTelegramCardEvent(args: {
  telegramUserId: string;
  action: string;
  cardId: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}) {
  await getPool().query(
    `INSERT INTO audit_logs(actor_type, actor_id, action, entity_type, entity_id, metadata_redacted, request_id)
     VALUES ('telegram_user', $1::uuid, $2, 'card', $3, $4::jsonb, $5)`,
    [args.telegramUserId, args.action, args.cardId, JSON.stringify(args.metadata ?? {}), args.requestId],
  );
}

export async function setKripicardCardFrozenStateForTelegram(
  cardId: string,
  action: "freeze" | "unfreeze",
  telegramUserId: string,
  requestId: string,
) {
  const env = parseServerEnv(process.env);
  if (!env.ENABLE_LIVE_PROVIDER_WRITES || !env.ENABLE_KRIPICARD_CARD_STATE_WRITES) {
    throw new ApiError(503, "feature_disabled", "Card freeze/unfreeze is currently disabled.");
  }
  if (!await runtimeControlEnabled("provider_writes")) {
    throw new ApiError(503, "runtime_kill_switch", "Kripicard writes are disabled by an emergency runtime control.");
  }

  const ownership = await getPool().query<{ ok: boolean }>(
    `SELECT true AS ok
       FROM cards c
       JOIN telegram_account_assignments taa ON taa.account_id = c.account_id
      WHERE c.id = $1::uuid AND taa.telegram_user_id = $2::uuid AND c.archived_at IS NULL
      LIMIT 1`,
    [cardId, telegramUserId],
  );
  if (!ownership.rows[0]?.ok) throw new ApiError(403, "card_not_owned", "This card is no longer available to this Telegram user.");

  const { row, client } = await loadCardClient(cardId);
  const desiredStatus = action === "freeze" ? "frozen" : "active";
  let before: ProviderCardState;
  try {
    before = await readProviderCardState(cardId, row, client);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw providerErrorToApi(error);
  }

  if (before.status === desiredStatus) {
    await auditTelegramCardEvent({ telegramUserId, action: "card.provider.state_noop", cardId, requestId, metadata: { action, status: before.status } });
    return { operationId: null, status: before.status, balanceUsdCents: before.balanceUsdCents?.toString() ?? null, noOp: true, reconciled: true, needsReconciliation: false };
  }

  const idempotencyKey = `telegram-card-state:${cardId}:${action}:${randomUUID()}`;
  const requestHash = createHash("sha256").update(JSON.stringify({ cardId, providerCardId: row.provider_card_id, action, telegramUserId })).digest("hex");
  let operationId: string;
  try {
    const created = await getPool().query<{ id: string }>(
      `INSERT INTO card_operations(card_id, account_id, operation_type, idempotency_key, request_hash, provider_status, status, initiated_by_type, initiated_by_telegram_user_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'submitting', 'pending', 'telegram_user', $6::uuid)
       RETURNING id`,
      [cardId, row.account_id, action, idempotencyKey, requestHash, telegramUserId],
    );
    operationId = created.rows[0]!.id;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError(409, "operation_in_progress", "This card already has an unresolved state change. An administrator must reconcile it first.");
    }
    throw error;
  }

  let providerResponse;
  try {
    providerResponse = await client.freezeUnfreeze({ cardId: row.provider_card_id!, action });
  } catch (error) {
    if (isAmbiguousWriteError(error)) {
      try {
        const state = await readProviderCardState(cardId, row, client);
        if (state.status === desiredStatus) {
          await finalizeStateOperation(operationId, "succeeded", desiredStatus, "reconciled_by_cards_list");
          await setFreezeCapability(row.account_id, true);
          await auditTelegramCardEvent({ telegramUserId, action: `card.provider.${action}`, cardId, requestId, metadata: { operationId, result: "succeeded_after_reconciliation" } });
          return { operationId, status: desiredStatus, balanceUsdCents: state.balanceUsdCents?.toString() ?? null, noOp: false, reconciled: true, needsReconciliation: false };
        }
      } catch {
        // Preserve the ambiguous write outcome and never retry automatically.
      }
      await finalizeStateOperation(operationId, "needs_reconciliation", "unknown", "ambiguous_write_outcome");
      await auditTelegramCardEvent({ telegramUserId, action: `card.provider.${action}`, cardId, requestId, metadata: { operationId, result: "needs_reconciliation" } });
      return { operationId, status: before.status, balanceUsdCents: before.balanceUsdCents?.toString() ?? null, noOp: false, reconciled: false, needsReconciliation: true };
    }
    const apiError = providerErrorToApi(error);
    await finalizeStateOperation(operationId, "failed", "rejected", `error:${apiError.code}`);
    if (error instanceof KripicardError && looksUnsupported(error)) await setFreezeCapability(row.account_id, false, error.message);
    await auditTelegramCardEvent({ telegramUserId, action: `card.provider.${action}`, cardId, requestId, metadata: { operationId, result: "failed", errorCode: apiError.code } });
    throw apiError;
  }

  try {
    await withTransaction(async (db) => {
      await db.query(`UPDATE cards SET status=$2, synced_at=now(), updated_at=now() WHERE id=$1::uuid`, [cardId, desiredStatus]);
      await db.query(
        `UPDATE card_operations SET status='succeeded', provider_status=$2, provider_response_ref=$3, updated_at=now() WHERE id=$1::uuid`,
        [operationId, desiredStatus, `freeze_unfreeze:${createHash("sha256").update(providerResponse.message).digest("hex").slice(0, 16)}`],
      );
      await db.query(`UPDATE kripi_accounts SET provider_capabilities=provider_capabilities || '{"freezeUnfreeze":true}'::jsonb, updated_at=now() WHERE id=$1::uuid`, [row.account_id]);
    });
  } catch {
    await finalizeStateOperation(operationId, "needs_reconciliation", "provider_accepted_local_persistence_failed", "provider_accepted").catch(() => {});
    throw new ApiError(503, "persistence_error_after_provider_write", "Kripicard accepted the change but AccAbad could not persist it. Do not retry until an administrator reconciles the card.");
  }

  await auditTelegramCardEvent({ telegramUserId, action: `card.provider.${action}`, cardId, requestId, metadata: { operationId, result: "succeeded" } });
  return { operationId, status: desiredStatus, balanceUsdCents: before.balanceUsdCents?.toString() ?? null, noOp: false, reconciled: false, needsReconciliation: false };
}
