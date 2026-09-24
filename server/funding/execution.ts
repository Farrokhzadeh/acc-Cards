import { createHash, randomUUID } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction, type DatabaseQueryable } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { decryptSecret } from "@/server/security/crypto";
import type { AuthSession } from "@/server/auth/types";
import { requestIp } from "@/server/auth/request-meta";
import { KripicardClient } from "@/server/providers/kripicard/client";
import { KripicardError } from "@/server/providers/kripicard/errors";
import type { KripicardFundCardResponse, KripicardTransaction } from "@/server/providers/kripicard/schemas";
import { assertProviderMoneyReadiness } from "@/server/providers/kripicard/readiness";
import { runtimeControlEnabled } from "@/server/operations/controls";

const FUNDING_SAFE_RETRY_STATUSES = new Set(["accepted", "funding_failed"]);

type FundingExecutionRow = {
  id: string;
  reference: string;
  user_id: string;
  card_id: string;
  card_amount_usd_cents: string | bigint;
  provider_fee_usd_cents: string | bigint;
  status: string;
  last_fund_operation_id: string | null;
};

type CardRow = {
  id: string;
  account_id: string;
  provider_card_id: string | null;
  last4: string | null;
  status: string;
  archived_at: Date | null;
};

type AccountRow = {
  id: string;
  encrypted_api_key: string;
  status: string;
};

type OperationRow = {
  id: string;
  funding_request_id: string;
  card_id: string;
  account_id: string;
  status: string;
  safe_result: Record<string, unknown>;
  created_at: Date;
};

function cents(value: number) {
  if (!Number.isFinite(value)) throw new ApiError(502, "provider_error", "Kripicard returned an invalid monetary value.");
  return BigInt(Math.round(value * 100));
}

function requestHash(row: FundingExecutionRow, card: CardRow) {
  return createHash("sha256").update(JSON.stringify({
    fundingRequestId: row.id,
    cardId: row.card_id,
    accountId: card.account_id,
    providerCardId: card.provider_card_id,
    amountUsdCents: String(row.card_amount_usd_cents),
  })).digest("hex");
}

function transactionFingerprint(tx: KripicardTransaction) {
  return createHash("sha256").update(JSON.stringify({
    date: tx.date,
    type: tx.type,
    merchant: tx.merchant ?? null,
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    reasonCode: tx.reason_code ?? null,
  })).digest("hex");
}

async function event(db: DatabaseQueryable, args: {
  requestId: string;
  fromStatus: string;
  toStatus: string;
  adminId: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.query(
    `INSERT INTO funding_request_events(request_id,from_status,to_status,actor_type,actor_id,note,admin_id,safe_metadata)
     VALUES($1::uuid,$2,$3,'admin',$4::uuid,$5,$4::uuid,$6::jsonb)`,
    [args.requestId, args.fromStatus, args.toStatus, args.adminId, args.note?.slice(0, 1000) ?? null, JSON.stringify(args.metadata ?? {})],
  );
}

async function notify(db: DatabaseQueryable, requestId: string, status: string) {
  await db.query(
    `INSERT INTO outbox_events(topic,aggregate_type,aggregate_id,event_type,payload,status,available_at)
     VALUES('telegram','funding_request',$1::uuid,'funding_request.status_changed',$2::jsonb,'pending',now())`,
    [requestId, JSON.stringify({ fundingRequestId: requestId, status })],
  );
}

async function audit(db: DatabaseQueryable, args: {
  adminId: string;
  action: string;
  requestId: string;
  traceId: string;
  ip: string | null;
  metadata: Record<string, unknown>;
}) {
  await db.query(
    `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted,ip,request_id)
     VALUES('admin',$1::uuid,$2,'funding_request',$3::uuid,$4::jsonb,$5::inet,$6)`,
    [args.adminId, args.action, args.requestId, JSON.stringify(args.metadata), args.ip, args.traceId],
  );
}

async function loadFundingContext(db: DatabaseQueryable, requestId: string) {
  const requestResult = await db.query<FundingExecutionRow>(
    `SELECT id,reference,user_id,card_id,card_amount_usd_cents,provider_fee_usd_cents,status,last_fund_operation_id
       FROM funding_requests WHERE id=$1::uuid FOR UPDATE`,
    [requestId],
  );
  const row = requestResult.rows[0];
  if (!row) throw new ApiError(404, "not_found", "Funding request not found.");

  const cardResult = await db.query<CardRow>(
    `SELECT c.id,c.account_id,c.provider_card_id,c.last4,c.status,c.archived_at
       FROM cards c
       JOIN telegram_account_assignments taa ON taa.account_id=c.account_id AND taa.telegram_user_id=$2::uuid
      WHERE c.id=$1::uuid
      LIMIT 1`,
    [row.card_id, row.user_id],
  );
  const card = cardResult.rows[0];
  if (!card || card.archived_at) throw new ApiError(409, "card_assignment_changed", "The requested card is no longer available to this Telegram user.");
  if (!card.provider_card_id) throw new ApiError(409, "provider_card_missing", "This card does not have a Kripicard provider ID.");
  if (["closed", "expired"].includes(card.status)) throw new ApiError(409, "card_not_fundable", "This card cannot be funded in its current state.");

  const accountResult = await db.query<AccountRow>(
    `SELECT id,encrypted_api_key,status FROM kripi_accounts WHERE id=$1::uuid AND archived_at IS NULL`,
    [card.account_id],
  );
  const account = accountResult.rows[0];
  if (!account) throw new ApiError(409, "account_unavailable", "The card's Kripicard account no longer exists.");
  if (["disabled", "archived"].includes(account.status)) throw new ApiError(409, "account_unavailable", "The card's Kripicard account is disabled or archived.");
  if (!account.encrypted_api_key.startsWith("v1.")) throw new ApiError(409, "secret_unavailable", "The card's account does not have a usable encrypted Kripicard API key.");

  const receipt = await db.query<{ scan_status: string }>(
    `SELECT scan_status FROM receipts WHERE request_id=$1::uuid ORDER BY created_at DESC LIMIT 1`,
    [row.id],
  );
  if (receipt.rows[0]?.scan_status !== "clean") throw new ApiError(409, "receipt_not_clean", "A validated receipt is required before provider funding.");

  return { row, card, account };
}

async function prepareFunding(requestId: string, session: AuthSession, request: Request, traceId: string) {
  return withTransaction(async (db) => {
    const { row, card, account } = await loadFundingContext(db, requestId);
    if (!FUNDING_SAFE_RETRY_STATUSES.has(row.status)) {
      throw new ApiError(409, "invalid_state", `This funding request cannot be executed from status ${row.status}.`);
    }
    if (row.status === "funding_failed" && row.last_fund_operation_id) {
      const previous = await db.query<{ status: string; safe_result: Record<string, unknown> }>(
        `SELECT status,safe_result FROM card_operations WHERE id=$1::uuid AND operation_type='fund'`,
        [row.last_fund_operation_id],
      );
      if (previous.rows[0]?.status !== "failed" || previous.rows[0]?.safe_result?.safeToRetry !== true) {
        throw new ApiError(409, "unsafe_retry_blocked", "The previous funding attempt is not proven safe to retry. Reconcile it instead.");
      }
    }

    await db.query(`SELECT pg_advisory_xact_lock(hashtext('card-fund:' || $1))`, [card.id]);

    const operationId = randomUUID();
    const key = `funding:${row.id}:${operationId}`;
    await db.query(
      `INSERT INTO card_operations(id,card_id,account_id,funding_request_id,operation_type,amount_usd_cents,idempotency_key,request_hash,provider_status,status,created_by,safe_result)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'fund',$5,$6,$7,'preflight','pending',$8::uuid,$9::jsonb)`,
      [operationId, card.id, account.id, row.id, String(row.card_amount_usd_cents), key, requestHash(row, card), session.principal.id, JSON.stringify({ safeToRetry: false })],
    );
    await db.query(
      `UPDATE funding_requests SET status='funding',funding_started_at=now(),last_fund_operation_id=$2::uuid,updated_at=now() WHERE id=$1::uuid`,
      [row.id, operationId],
    );
    await event(db, { requestId: row.id, fromStatus: row.status, toStatus: "funding", adminId: session.principal.id, metadata: { operationId, cardId: card.id, accountId: account.id } });
    await notify(db, row.id, "funding");
    await audit(db, { adminId: session.principal.id, action: "funding_request.funding_started", requestId: row.id, traceId, ip: requestIp(request), metadata: { operationId, cardId: card.id, accountId: account.id, amountUsdCents: String(row.card_amount_usd_cents) } });
    return { row: { ...row, status: "funding" }, card, account, operationId };
  });
}

async function markFailed(args: {
  operationId: string;
  row: FundingExecutionRow;
  session: AuthSession;
  request: Request;
  traceId: string;
  code: string;
  message: string;
  retryAfterSeconds?: number | null;
}) {
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE card_operations
          SET status='failed',provider_status=$2,provider_response_ref=$3,retry_after_seconds=$4,
              safe_result=safe_result||$5::jsonb,updated_at=now()
        WHERE id=$1::uuid`,
      [args.operationId, args.code, `error:${args.code}`, args.retryAfterSeconds ?? null, JSON.stringify({ safeToRetry: true })],
    );
    await db.query(`UPDATE funding_requests SET status='funding_failed',updated_at=now() WHERE id=$1::uuid`, [args.row.id]);
    await event(db, { requestId: args.row.id, fromStatus: "funding", toStatus: "funding_failed", adminId: args.session.principal.id, note: args.message, metadata: { operationId: args.operationId, providerCode: args.code, retryAfterSeconds: args.retryAfterSeconds ?? null } });
    await notify(db, args.row.id, "funding_failed");
    await audit(db, { adminId: args.session.principal.id, action: "funding_request.funding_failed", requestId: args.row.id, traceId: args.traceId, ip: requestIp(args.request), metadata: { operationId: args.operationId, providerCode: args.code, retryAfterSeconds: args.retryAfterSeconds ?? null, safeToRetry: true } });
  });
}

async function markNeedsReconciliation(args: {
  operationId: string;
  row: FundingExecutionRow;
  session: AuthSession;
  request: Request;
  traceId: string;
  code: string;
  message: string;
  httpStatus?: number | null;
}) {
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE card_operations
          SET status='needs_reconciliation',provider_status=$2,provider_http_status=$3,provider_response_ref=$4,
              safe_result=safe_result||$5::jsonb,updated_at=now()
        WHERE id=$1::uuid`,
      [args.operationId, args.code, args.httpStatus ?? null, `ambiguous:${args.code}`, JSON.stringify({ safeToRetry: false })],
    );
    await db.query(`UPDATE funding_requests SET status='needs_reconciliation',updated_at=now() WHERE id=$1::uuid`, [args.row.id]);
    await event(db, { requestId: args.row.id, fromStatus: "funding", toStatus: "needs_reconciliation", adminId: args.session.principal.id, note: args.message, metadata: { operationId: args.operationId, providerCode: args.code } });
    await notify(db, args.row.id, "needs_reconciliation");
    await audit(db, { adminId: args.session.principal.id, action: "funding_request.needs_reconciliation", requestId: args.row.id, traceId: args.traceId, ip: requestIp(args.request), metadata: { operationId: args.operationId, providerCode: args.code, safeToRetry: false } });
  });
}

async function captureProviderEvidence(client: KripicardClient, providerCardId: string) {
  const [details, transactions] = await Promise.all([
    client.cardDetails({ cardId: providerCardId }),
    client.transactions({ cardId: providerCardId }),
  ]);
  const nonZeroFingerprints = transactions.data.transactions
    .filter((tx) => Math.abs(tx.amount) > 0)
    .map(transactionFingerprint)
    .sort();
  return {
    balanceUsdCents: cents(details.balance),
    status: details.status,
    nonZeroTransactionFingerprints: nonZeroFingerprints,
    transactionCount: transactions.data.total_transactions ?? transactions.data.transactions.length,
  };
}

async function storePreflightEvidence(operationId: string, evidence: Awaited<ReturnType<typeof captureProviderEvidence>>) {
  await getPool().query(
    `UPDATE card_operations SET provider_status='ready_to_submit',safe_result=safe_result||$2::jsonb,updated_at=now() WHERE id=$1::uuid`,
    [operationId, JSON.stringify({
      preBalanceUsdCents: evidence.balanceUsdCents.toString(),
      preNonZeroTransactionFingerprints: evidence.nonZeroTransactionFingerprints,
      preTransactionCount: evidence.transactionCount,
      preCardStatus: evidence.status,
      preflightCapturedAt: new Date().toISOString(),
    })],
  );
}

async function persistCompleted(args: {
  operationId: string;
  row: FundingExecutionRow;
  card: CardRow;
  account: AccountRow;
  providerResponse: KripicardFundCardResponse | null;
  postBalanceUsdCents?: bigint | null;
  reconciled: boolean;
  session: AuthSession;
  request: Request;
  traceId: string;
  resolutionReference?: string | null;
}) {
  const actualFee = args.providerResponse ? cents(args.providerResponse.data.fee) : null;
  const expectedFee = BigInt(args.row.provider_fee_usd_cents);
  const amount = BigInt(args.row.card_amount_usd_cents);
  try {
    return await withTransaction(async (db) => {
      await db.query(
        `UPDATE funding_requests SET status='completed',funded_at=now(),updated_at=now() WHERE id=$1::uuid`,
        [args.row.id],
      );
      if (args.postBalanceUsdCents != null) {
        await db.query(`UPDATE cards SET balance_usd_cents=$2,balance_as_of=now(),synced_at=now(),updated_at=now() WHERE id=$1::uuid`, [args.card.id, args.postBalanceUsdCents.toString()]);
      }
      await db.query(
        `UPDATE card_operations
            SET status='succeeded',provider_status='funded',provider_ref=$2,provider_fee_usd_cents=$3,
                provider_response_ref=$4,safe_result=safe_result||$5::jsonb,updated_at=now()
          WHERE id=$1::uuid`,
        [args.operationId, args.card.provider_card_id, actualFee, args.reconciled ? "reconciled_by_provider_confirmation" : "fundcard_success", JSON.stringify({
          safeToRetry: false,
          reconciled: args.reconciled,
          providerCardId: args.card.provider_card_id,
          requestedAmountUsdCents: amount.toString(),
          expectedProviderFeeUsdCents: expectedFee.toString(),
          actualProviderFeeUsdCents: actualFee?.toString() ?? null,
          feeMismatch: actualFee != null ? actualFee !== expectedFee : null,
          resolutionReference: args.resolutionReference ?? null,
        })],
      );
      await db.query(
        `UPDATE kripi_accounts SET provider_capabilities=provider_capabilities||'{"fundCard":true}'::jsonb,updated_at=now() WHERE id=$1::uuid`,
        [args.account.id],
      );
      if (args.providerResponse) {
        await db.query(
          `UPDATE kripi_accounts SET account_balance_usd_cents=GREATEST(0,COALESCE(account_balance_usd_cents,0)-$2::bigint),account_balance_as_of=now(),updated_at=now()
            WHERE id=$1::uuid AND account_balance_source='derived'`,
          [args.account.id, cents(args.providerResponse.data.total_debited)],
        );
      }
      await event(db, { requestId: args.row.id, fromStatus: args.reconciled ? "needs_reconciliation" : "funding", toStatus: "completed", adminId: args.session.principal.id, metadata: { operationId: args.operationId, providerCardId: args.card.provider_card_id, reconciled: args.reconciled, resolutionReference: args.resolutionReference ?? null } });
      await notify(db, args.row.id, "completed");
      await audit(db, { adminId: args.session.principal.id, action: "funding_request.completed", requestId: args.row.id, traceId: args.traceId, ip: requestIp(args.request), metadata: { operationId: args.operationId, providerCardId: args.card.provider_card_id, amountUsdCents: amount.toString(), expectedProviderFeeUsdCents: expectedFee.toString(), actualProviderFeeUsdCents: actualFee?.toString() ?? null, reconciled: args.reconciled, resolutionReference: args.resolutionReference ?? null } });
      return { requestId: args.row.id, operationId: args.operationId, status: "completed" as const, needsReconciliation: false, reconciled: args.reconciled, providerCardId: args.card.provider_card_id };
    });
  } catch {
    try {
      await getPool().query(`UPDATE card_operations SET status='needs_reconciliation',provider_status='provider_accepted_local_persistence_failed',provider_response_ref='provider_accepted',safe_result=safe_result||'{"safeToRetry":false}'::jsonb,updated_at=now() WHERE id=$1::uuid`, [args.operationId]);
      await getPool().query(`UPDATE funding_requests SET status='needs_reconciliation',updated_at=now() WHERE id=$1::uuid`, [args.row.id]);
    } catch {
    }
    throw new ApiError(503, "persistence_error_after_provider_write", "Kripicard may have funded the card, but AccAbad could not persist the result. Do not retry fundcard; reconcile this request.");
  }
}

async function collectReconciliationEvidence(operation: OperationRow, client: KripicardClient, providerCardId: string) {
  const current = await captureProviderEvidence(client, providerCardId);
  const preBalanceRaw = operation.safe_result?.preBalanceUsdCents;
  const preBalance = typeof preBalanceRaw === "string" && /^-?\d+$/.test(preBalanceRaw) ? BigInt(preBalanceRaw) : null;
  const previousFingerprints = Array.isArray(operation.safe_result?.preNonZeroTransactionFingerprints)
    ? operation.safe_result.preNonZeroTransactionFingerprints.filter((value): value is string => typeof value === "string")
    : [];
  const newNonZeroTransactions = current.nonZeroTransactionFingerprints.filter((fingerprint) => !previousFingerprints.includes(fingerprint));
  return {
    preBalanceUsdCents: preBalance?.toString() ?? null,
    currentBalanceUsdCents: current.balanceUsdCents.toString(),
    balanceDeltaUsdCents: preBalance == null ? null : (current.balanceUsdCents - preBalance).toString(),
    newNonZeroTransactionCount: newNonZeroTransactions.length,
    currentTransactionCount: current.transactionCount,
    currentCardStatus: current.status,
    observedAt: new Date().toISOString(),
  };
}

export async function executeAcceptedFundingRequest(requestId: string, session: AuthSession, request: Request, traceId: string) {
  const env = parseServerEnv(process.env);
  if (!env.ENABLE_LIVE_PROVIDER_WRITES || !env.ENABLE_KRIPICARD_CARD_FUNDING) {
    throw new ApiError(503, "feature_disabled", "Kripicard card funding is disabled by deployment configuration.");
  }
  if (!await runtimeControlEnabled("provider_writes") || !await runtimeControlEnabled("card_funding")) {
    throw new ApiError(503, "runtime_kill_switch", "Kripicard card funding is disabled by an emergency runtime control.");
  }
  await assertProviderMoneyReadiness("card_fund");

  let prepared;
  try {
    prepared = await prepareFunding(requestId, session, request, traceId);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError(409, "funding_in_progress", "This request or card already has an unresolved funding operation. Reconcile it first.");
    }
    throw error;
  }
  const { row, card, account, operationId } = prepared;
  const client = new KripicardClient({ apiKey: decryptSecret(account.encrypted_api_key) });

  try {
    const preflight = await captureProviderEvidence(client, card.provider_card_id!);
    await storePreflightEvidence(operationId, preflight);
  } catch (error) {
    const code = error instanceof KripicardError ? `preflight_${error.kind}` : "preflight_error";
    await markFailed({ operationId, row, session, request, traceId, code, message: "Could not read the provider card before funding. No fundcard request was sent." });
    throw new ApiError(502, "provider_preflight_failed", "Could not verify the provider card before funding. No card funding was attempted.");
  }

  let result: KripicardFundCardResponse;
  try {
    result = await client.fundCard({ cardId: card.provider_card_id!, amount: Number(BigInt(row.card_amount_usd_cents)) / 100 });
    if (result.data.card_id !== card.provider_card_id || cents(result.data.amount) !== BigInt(row.card_amount_usd_cents)) {
      await markNeedsReconciliation({ operationId, row, session, request, traceId, code: "provider_success_mismatch", message: "Kripicard returned a success response that did not match the requested card or amount. Do not retry fundcard." });
      return { requestId: row.id, operationId, status: "needs_reconciliation" as const, needsReconciliation: true, reconciled: false, providerOutcome: "provider_success_mismatch" };
    }
  } catch (error) {
    const providerError = error instanceof KripicardError ? error : new KripicardError("network", "Kripicard request failed.", undefined, false, { safeToRetry: false });
    if (providerError.kind === "rate_limited") {
      await markFailed({ operationId, row, session, request, traceId, code: "rate_limited", message: providerError.message, retryAfterSeconds: providerError.metadata.retryAfterSeconds ?? null });
      throw new ApiError(429, "provider_rate_limited", providerError.message, { retryAfterSeconds: providerError.metadata.retryAfterSeconds ?? null, scope: providerError.metadata.rateLimitScope ?? null });
    }
    if (providerError.kind === "provider_rejected" && providerError.metadata.safeToRetry === true) {
      await markFailed({ operationId, row, session, request, traceId, code: providerError.metadata.providerCode ?? "provider_rejected", message: providerError.message });
      throw new ApiError(422, "provider_rejected", providerError.message);
    }

    await markNeedsReconciliation({ operationId, row, session, request, traceId, code: providerError.kind, message: "Kripicard did not return a safely retryable funding result. AccAbad will not send fundcard again until reconciliation.", httpStatus: providerError.status });
    try {
      await reconcileFundingRequest(requestId, session, request, traceId);
    } catch {
    }
    return { requestId: row.id, operationId, status: "needs_reconciliation" as const, needsReconciliation: true, reconciled: false, providerOutcome: providerError.kind };
  }

  let postBalance: bigint | null = null;
  try {
    const details = await client.cardDetails({ cardId: card.provider_card_id! });
    postBalance = cents(details.balance);
  } catch {
  }

  return persistCompleted({ operationId, row, card, account, providerResponse: result, postBalanceUsdCents: postBalance, reconciled: false, session, request, traceId });
}

export async function reconcileFundingRequest(requestId: string, session: AuthSession, request: Request, traceId: string) {
  const result = await getPool().query<{
    id: string;
    reference: string;
    user_id: string;
    card_id: string;
    card_amount_usd_cents: string | bigint;
    provider_fee_usd_cents: string | bigint;
    status: string;
    account_id: string;
    provider_card_id: string | null;
    encrypted_api_key: string;
    account_status: string;
    operation_id: string;
    operation_status: string;
    operation_safe_result: Record<string, unknown>;
    operation_created_at: Date;
  }>(
    `SELECT fr.id,fr.reference,fr.user_id,fr.card_id,fr.card_amount_usd_cents,fr.provider_fee_usd_cents,fr.status,
            c.account_id,c.provider_card_id,
            a.encrypted_api_key,a.status AS account_status,
            co.id AS operation_id,co.status AS operation_status,co.safe_result AS operation_safe_result,co.created_at AS operation_created_at
       FROM funding_requests fr
       JOIN cards c ON c.id=fr.card_id
       JOIN kripi_accounts a ON a.id=c.account_id
       JOIN card_operations co ON co.id=fr.last_fund_operation_id
      WHERE fr.id=$1::uuid
        AND fr.status IN ('funding','needs_reconciliation')
        AND co.operation_type='fund'
        AND co.status IN ('pending','needs_reconciliation')`,
    [requestId],
  );
  const raw = result.rows[0];
  if (!raw) throw new ApiError(409, "nothing_to_reconcile", "This request does not have an unresolved fund-card operation.");
  if (!raw.encrypted_api_key?.startsWith("v1.")) throw new ApiError(409, "secret_unavailable", "The card account no longer has a usable encrypted API key.");
  if (["disabled", "archived"].includes(raw.account_status)) throw new ApiError(409, "account_unavailable", "The card account is disabled or archived.");
  if (!raw.provider_card_id) throw new ApiError(409, "provider_card_missing", "This card no longer has a provider ID.");
  if (raw.status === "funding" || raw.operation_status === "pending") {
    const env = parseServerEnv(process.env);
    const staleAfterMs = Math.max(60_000, env.KRIPICARD_REQUEST_TIMEOUT_MS * 3);
    if (Date.now() - raw.operation_created_at.getTime() < staleAfterMs) {
      throw new ApiError(409, "funding_still_in_progress", "The current provider funding attempt is still inside its safety window. Wait before reconciling it.");
    }
    await withTransaction(async (db) => {
      const locked = await db.query<{ request_status: string; operation_status: string }>(
        `SELECT fr.status AS request_status,co.status AS operation_status
           FROM funding_requests fr
           JOIN card_operations co ON co.id=fr.last_fund_operation_id
          WHERE fr.id=$1::uuid AND co.id=$2::uuid AND co.operation_type='fund'
          FOR UPDATE OF fr,co`,
        [raw.id, raw.operation_id],
      );
      if (!locked.rows[0]) throw new ApiError(409, "nothing_to_reconcile", "The funding operation no longer exists.");
      if (locked.rows[0].request_status === "funding" && locked.rows[0].operation_status === "pending") {
        await db.query(
          `UPDATE card_operations
              SET status='needs_reconciliation',provider_status='stale_pending_recovery',provider_response_ref='process_recovery_unknown',
                  safe_result=safe_result||'{"safeToRetry":false}'::jsonb,updated_at=now()
            WHERE id=$1::uuid`,
          [raw.operation_id],
        );
        await db.query(`UPDATE funding_requests SET status='needs_reconciliation',updated_at=now() WHERE id=$1::uuid`, [raw.id]);
        await event(db, { requestId: raw.id, fromStatus: "funding", toStatus: "needs_reconciliation", adminId: session.principal.id, note: "Recovered a stale funding operation after the provider-result safety window. No provider write was retried.", metadata: { operationId: raw.operation_id, staleAfterMs } });
        await notify(db, raw.id, "needs_reconciliation");
        await audit(db, { adminId: session.principal.id, action: "funding_request.stale_operation_recovered", requestId: raw.id, traceId, ip: requestIp(request), metadata: { operationId: raw.operation_id, staleAfterMs, safeToRetry: false } });
      } else if (locked.rows[0].request_status !== "needs_reconciliation" || locked.rows[0].operation_status !== "needs_reconciliation") {
        throw new ApiError(409, "nothing_to_reconcile", "The funding operation changed while recovery was starting.");
      }
    });
  }

  const operation: OperationRow = { id: raw.operation_id, funding_request_id: raw.id, card_id: raw.card_id, account_id: raw.account_id, status: "needs_reconciliation", safe_result: raw.operation_safe_result ?? {}, created_at: raw.operation_created_at };
  const client = new KripicardClient({ apiKey: decryptSecret(raw.encrypted_api_key) });
  const evidence = await collectReconciliationEvidence(operation, client, raw.provider_card_id);
  await withTransaction(async (db) => {
    const locked = await db.query<{ request_status: string; operation_status: string }>(
      `SELECT fr.status AS request_status,co.status AS operation_status
         FROM funding_requests fr
         JOIN card_operations co ON co.id=fr.last_fund_operation_id
        WHERE fr.id=$1::uuid AND co.id=$2::uuid AND co.operation_type='fund'
        FOR UPDATE OF fr,co`,
      [raw.id, operation.id],
    );
    if (!locked.rows[0] || locked.rows[0].request_status !== "needs_reconciliation" || locked.rows[0].operation_status !== "needs_reconciliation") {
      throw new ApiError(409, "nothing_to_reconcile", "The funding operation was resolved while provider evidence was being collected.");
    }
    await db.query(`UPDATE card_operations SET safe_result=safe_result||$2::jsonb,provider_response_ref='reconciliation_evidence_collected',updated_at=now() WHERE id=$1::uuid`, [operation.id, JSON.stringify({ lastReconciliationEvidence: evidence, safeToRetry: false })]);
    await audit(db, { adminId: session.principal.id, action: "funding_request.reconciliation_checked", requestId: raw.id, traceId, ip: requestIp(request), metadata: { operationId: operation.id, evidence } });
  });
  return { requestId: raw.id, operationId: operation.id, status: "needs_reconciliation" as const, needsReconciliation: true, reconciled: false, evidence };
}

async function loadFundingReconciliationContext(db: DatabaseQueryable, requestId: string) {
  const result = await db.query<{
    id: string;
    reference: string;
    user_id: string;
    card_id: string;
    card_amount_usd_cents: string | bigint;
    provider_fee_usd_cents: string | bigint;
    status: string;
    last_fund_operation_id: string | null;
    account_id: string;
    provider_card_id: string | null;
    last4: string | null;
    card_status: string;
    archived_at: Date | null;
    encrypted_api_key: string;
    account_status: string;
  }>(
    `SELECT fr.id,fr.reference,fr.user_id,fr.card_id,fr.card_amount_usd_cents,fr.provider_fee_usd_cents,fr.status,fr.last_fund_operation_id,
            c.account_id,c.provider_card_id,c.last4,c.status AS card_status,c.archived_at,
            a.encrypted_api_key,a.status AS account_status
       FROM funding_requests fr
       JOIN cards c ON c.id=fr.card_id
       JOIN kripi_accounts a ON a.id=c.account_id
      WHERE fr.id=$1::uuid
      FOR UPDATE OF fr,c,a`,
    [requestId],
  );
  const raw = result.rows[0];
  if (!raw) throw new ApiError(404, "not_found", "Funding request not found.");
  if (raw.status !== "needs_reconciliation" || !raw.last_fund_operation_id) {
    throw new ApiError(409, "nothing_to_reconcile", "This funding request is not waiting for reconciliation.");
  }
  if (!raw.provider_card_id) throw new ApiError(409, "provider_card_missing", "This card no longer has a provider ID.");
  const row: FundingExecutionRow = {
    id: raw.id, reference: raw.reference, user_id: raw.user_id, card_id: raw.card_id,
    card_amount_usd_cents: raw.card_amount_usd_cents, provider_fee_usd_cents: raw.provider_fee_usd_cents,
    status: raw.status, last_fund_operation_id: raw.last_fund_operation_id,
  };
  const card: CardRow = {
    id: raw.card_id, account_id: raw.account_id, provider_card_id: raw.provider_card_id, last4: raw.last4,
    status: raw.card_status, archived_at: raw.archived_at,
  };
  const account: AccountRow = { id: raw.account_id, encrypted_api_key: raw.encrypted_api_key, status: raw.account_status };

  const operation = await db.query<OperationRow>(
    `SELECT id,funding_request_id,card_id,account_id,status,safe_result,created_at
       FROM card_operations
      WHERE id=$1::uuid AND operation_type='fund'
      FOR UPDATE`,
    [raw.last_fund_operation_id],
  );
  if (!operation.rows[0] || operation.rows[0].status !== "needs_reconciliation") {
    throw new ApiError(409, "nothing_to_reconcile", "The funding operation is no longer unresolved.");
  }
  return { row, card, account, operation: operation.rows[0] };
}

export async function resolveFundingReconciliation(input: {
  requestId: string;
  outcome: "completed" | "not_funded";
  providerReference: string;
  note?: string | null;
  session: AuthSession;
  request: Request;
  traceId: string;
}) {
  const providerReference = input.providerReference.trim();
  if (providerReference.length < 3 || providerReference.length > 500) throw new ApiError(400, "provider_reference_required", "Add the Kripicard support/ticket/reference used to resolve this funding operation.");

  const context = await withTransaction((db) => loadFundingReconciliationContext(db, input.requestId));

  let postBalance: bigint | null = null;
  if (input.outcome === "completed" && context.account.encrypted_api_key?.startsWith("v1.") && !["disabled", "archived"].includes(context.account.status)) {
    try {
      const client = new KripicardClient({ apiKey: decryptSecret(context.account.encrypted_api_key) });
      const details = await client.cardDetails({ cardId: context.card.provider_card_id! });
      postBalance = cents(details.balance);
    } catch {
    }
  }

  return withTransaction(async (db) => {
    const locked = await db.query<{ request_status: string; operation_status: string }>(
      `SELECT fr.status AS request_status,co.status AS operation_status
         FROM funding_requests fr
         JOIN card_operations co ON co.id=fr.last_fund_operation_id
        WHERE fr.id=$1::uuid AND co.id=$2::uuid AND co.operation_type='fund'
        FOR UPDATE OF fr,co`,
      [context.row.id, context.operation.id],
    );
    if (!locked.rows[0] || locked.rows[0].request_status !== "needs_reconciliation" || locked.rows[0].operation_status !== "needs_reconciliation") {
      throw new ApiError(409, "nothing_to_reconcile", "The funding operation has already been resolved.");
    }

    if (input.outcome === "completed") {
      await db.query(`UPDATE funding_requests SET status='completed',funded_at=now(),updated_at=now() WHERE id=$1::uuid`, [context.row.id]);
      if (postBalance != null) {
        await db.query(`UPDATE cards SET balance_usd_cents=$2,balance_as_of=now(),synced_at=now(),updated_at=now() WHERE id=$1::uuid`, [context.card.id, postBalance.toString()]);
      }
      await db.query(
        `UPDATE card_operations
            SET status='succeeded',provider_status='funded_confirmed',provider_ref=$2,provider_response_ref=$3,
                safe_result=safe_result||$4::jsonb,updated_at=now()
          WHERE id=$1::uuid`,
        [context.operation.id, context.card.provider_card_id, `manual:${providerReference.slice(0, 180)}`, JSON.stringify({ safeToRetry: false, reconciled: true, resolutionReference: providerReference, resolutionNote: input.note?.slice(0, 500) ?? null })],
      );
      await db.query(`UPDATE kripi_accounts SET provider_capabilities=provider_capabilities||'{"fundCard":true}'::jsonb,updated_at=now() WHERE id=$1::uuid`, [context.account.id]);
      await event(db, { requestId: context.row.id, fromStatus: "needs_reconciliation", toStatus: "completed", adminId: input.session.principal.id, note: input.note ?? "Provider confirmed the card was funded.", metadata: { operationId: context.operation.id, providerReference, providerCardId: context.card.provider_card_id } });
      await notify(db, context.row.id, "completed");
      await audit(db, { adminId: input.session.principal.id, action: "funding_request.reconciliation_resolved_completed", requestId: context.row.id, traceId: input.traceId, ip: requestIp(input.request), metadata: { operationId: context.operation.id, providerReference, providerCardId: context.card.provider_card_id, amountUsdCents: String(context.row.card_amount_usd_cents), safeToRetry: false } });
      return { requestId: context.row.id, operationId: context.operation.id, status: "completed" as const, needsReconciliation: false, reconciled: true, safeToRetry: false };
    }

    await db.query(`UPDATE card_operations SET status='failed',provider_status='confirmed_not_funded',provider_response_ref=$2,safe_result=safe_result||$3::jsonb,updated_at=now() WHERE id=$1::uuid`, [context.operation.id, `manual:${providerReference.slice(0, 180)}`, JSON.stringify({ safeToRetry: true, resolutionReference: providerReference, resolutionNote: input.note?.slice(0, 500) ?? null })]);
    await db.query(`UPDATE funding_requests SET status='funding_failed',updated_at=now() WHERE id=$1::uuid`, [context.row.id]);
    await event(db, { requestId: context.row.id, fromStatus: "needs_reconciliation", toStatus: "funding_failed", adminId: input.session.principal.id, note: input.note ?? "Provider confirmed the card was not funded.", metadata: { operationId: context.operation.id, providerReference } });
    await notify(db, context.row.id, "funding_failed");
    await audit(db, { adminId: input.session.principal.id, action: "funding_request.reconciliation_resolved_not_funded", requestId: context.row.id, traceId: input.traceId, ip: requestIp(input.request), metadata: { operationId: context.operation.id, providerReference, safeToRetry: true } });
    return { requestId: context.row.id, operationId: context.operation.id, status: "funding_failed" as const, needsReconciliation: false, reconciled: true, safeToRetry: true };
  });
}
