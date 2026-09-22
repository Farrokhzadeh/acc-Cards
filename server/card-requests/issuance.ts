import { createHash, randomUUID } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool, withTransaction, type DatabaseQueryable } from "@/server/database/pool";
import { ApiError } from "@/server/http/api";
import { decryptSecret } from "@/server/security/crypto";
import type { AuthSession } from "@/server/auth/types";
import { KripicardClient } from "@/server/providers/kripicard/client";
import { KripicardError } from "@/server/providers/kripicard/errors";
import type { KripicardListCard, KripicardCreateCardResponse } from "@/server/providers/kripicard/schemas";
import { assertProviderMoneyReadiness } from "@/server/providers/kripicard/readiness";
import { getCardRequestBins, getCardRequestPolicy } from "@/server/card-requests/service";
import { requestIp } from "@/server/auth/request-meta";
import { runtimeControlEnabled } from "@/server/operations/controls";

const OPEN_STATUSES = ["pending_review", "approved", "correction_needed", "issuing", "issue_failed", "needs_reconciliation"];

type IssueRequestRow = {
  id: string;
  reference: string;
  user_id: string;
  selected_account_id: string | null;
  bin: string;
  initial_amount_usd_cents: string | bigint;
  name_on_card: string;
  email: string;
  date_of_birth: string | Date | null;
  status: string;
  provider_card_id: string | null;
  issuance_started_at: Date | null;
};

type AccountRow = {
  id: string;
  encrypted_api_key: string;
  status: string;
};

type OperationRow = {
  id: string;
  card_request_id: string;
  account_id: string;
  status: string;
  safe_result: Record<string, unknown>;
  created_at: Date;
};

function cents(value: number) {
  if (!Number.isFinite(value)) throw new ApiError(502, "provider_error", "Kripicard returned an invalid monetary value.");
  return BigInt(Math.round(value * 100));
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function providerDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dob(value: string | Date | null) {
  if (!value) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function requestHash(row: IssueRequestRow) {
  return createHash("sha256").update(JSON.stringify({
    requestId: row.id,
    accountId: row.selected_account_id,
    bin: row.bin,
    amountUsdCents: String(row.initial_amount_usd_cents),
    nameOnCard: row.name_on_card,
    email: row.email,
    dateOfBirth: dob(row.date_of_birth),
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
    `INSERT INTO card_request_events(request_id,from_status,to_status,actor_type,admin_id,note,safe_metadata)
     VALUES($1::uuid,$2,$3,'admin',$4::uuid,$5,$6::jsonb)`,
    [args.requestId, args.fromStatus, args.toStatus, args.adminId, args.note?.slice(0, 1000) ?? null, JSON.stringify(args.metadata ?? {})],
  );
}

async function notify(db: DatabaseQueryable, requestId: string, status: string) {
  await db.query(
    `INSERT INTO outbox_events(topic,aggregate_type,aggregate_id,event_type,payload,status,available_at)
     VALUES('telegram','card_request',$1::uuid,'card_request.status_changed',$2::jsonb,'pending',now())`,
    [requestId, JSON.stringify({ cardRequestId: requestId, status })],
  );
}

async function audit(db: DatabaseQueryable, args: {
  adminId: string;
  action: string;
  entityId: string;
  requestId: string;
  ip: string | null;
  metadata: Record<string, unknown>;
}) {
  await db.query(
    `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata_redacted,ip,request_id)
     VALUES('admin',$1::uuid,$2,'card_request',$3::uuid,$4::jsonb,$5::inet,$6)`,
    [args.adminId, args.action, args.entityId, JSON.stringify(args.metadata), args.ip, args.requestId],
  );
}

async function lockCapacity(db: DatabaseQueryable, userId: string) {
  const user = await db.query(`SELECT id FROM telegram_users WHERE id=$1::uuid FOR UPDATE`, [userId]);
  if (!user.rows[0]) throw new ApiError(404, "client_not_found", "Telegram client not found.");
  await db.query(`SELECT pg_advisory_xact_lock(hashtext('card-request-capacity:' || $1))`, [userId]);
}

async function assertCapacity(db: DatabaseQueryable, row: IssueRequestRow) {
  const onboarding = await db.query<{ onboarding: boolean; active_cards: number }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM telegram_users
          WHERE id=$1::uuid AND onboarding_card_request_id=$2::uuid
       ) AS onboarding,
       (
         SELECT COUNT(*)::int
           FROM cards c
           JOIN telegram_account_assignments taa ON taa.account_id=c.account_id
          WHERE taa.telegram_user_id=$1::uuid
            AND c.archived_at IS NULL
            AND c.status NOT IN ('closed','expired')
       ) AS active_cards`,
    [row.user_id,row.id],
  );
  if (onboarding.rows[0]?.onboarding) {
    if ((onboarding.rows[0]?.active_cards ?? 0) > 0) {
      throw new ApiError(409, "first_card_already_exists", "This customer already has an active card. First-card onboarding cannot create another one.");
    }
    return;
  }

  const policy = await getCardRequestPolicy(db);
  const counts = await db.query<{ active_cards: number; other_open_requests: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM cards c
          JOIN telegram_account_assignments taa ON taa.account_id=c.account_id
         WHERE taa.telegram_user_id=$1::uuid AND c.archived_at IS NULL AND c.status NOT IN ('closed','expired')) AS active_cards,
       (SELECT COUNT(*)::int FROM card_requests cr
         WHERE cr.user_id=$1::uuid AND cr.id<>$2::uuid AND cr.status=ANY($3::text[])) AS other_open_requests`,
    [row.user_id, row.id, OPEN_STATUSES],
  );
  const used = (counts.rows[0]?.active_cards ?? 0) + (counts.rows[0]?.other_open_requests ?? 0);
  if (used >= policy.platformLimit) {
    throw new ApiError(409, "card_limit_reached", `The client has reached the ${policy.platformLimit}-card platform limit.`);
  }
}

async function loadAccountForIssue(db: DatabaseQueryable, row: IssueRequestRow) {
  if (!row.selected_account_id) throw new ApiError(409, "account_required", "Approve the request with an issuing account before issuance.");
  const result = await db.query<AccountRow>(
    `SELECT a.id,a.encrypted_api_key,a.status
       FROM kripi_accounts a
       JOIN telegram_account_assignments taa ON taa.account_id=a.id
      WHERE a.id=$1::uuid AND taa.telegram_user_id=$2::uuid
        AND a.archived_at IS NULL AND a.status NOT IN ('disabled','archived')
      FOR UPDATE OF a,taa`,
    [row.selected_account_id, row.user_id],
  );
  const account = result.rows[0];
  if (!account) throw new ApiError(409, "account_not_assigned", "The selected Kripicard account is no longer assigned to this client.");
  if (!account.encrypted_api_key.startsWith("v1.")) throw new ApiError(409, "secret_unavailable", "The selected account needs a real encrypted Kripicard API key.");
  return account;
}

async function prepareIssuance(requestId: string, session: AuthSession, request: Request, traceId: string) {
  return withTransaction(async (db) => {
    const locked = await db.query<IssueRequestRow>(`SELECT * FROM card_requests WHERE id=$1::uuid FOR UPDATE`, [requestId]);
    const row = locked.rows[0];
    if (!row) throw new ApiError(404, "not_found", "Card request not found.");
    if (!["approved", "issue_failed"].includes(row.status)) {
      if (row.status === "needs_reconciliation" || row.status === "issuing") {
        throw new ApiError(409, "issuance_unresolved", "This request already has an unresolved issuance operation. Reconcile it instead of creating another card.");
      }
      throw new ApiError(409, "invalid_state", `This request cannot be issued from status ${row.status}.`);
    }

    await lockCapacity(db, row.user_id);
    await assertCapacity(db, row);
    const bins = await getCardRequestBins(db);
    const configuredBin = bins.find((item) => item.bin === row.bin);
    if (!configuredBin) throw new ApiError(409, "unsupported_bin", "The requested BIN is no longer enabled by the verified provider catalogue.");
    if (configuredBin.requiresDob && !row.date_of_birth) throw new ApiError(409, "date_of_birth_required", "This BIN requires a date of birth before issuance.");
    const account = await loadAccountForIssue(db, row);

    const operationKey = `card-create:${row.id}:${randomUUID()}`;
    const created = await db.query<{ id: string }>(
      `INSERT INTO card_operations(account_id,card_request_id,operation_type,amount_usd_cents,idempotency_key,request_hash,provider_status,status,created_by,safe_result)
       VALUES($1::uuid,$2::uuid,'create',$3,$4,$5,'preflight','pending',$6::uuid,'{}'::jsonb)
       RETURNING id`,
      [account.id, row.id, row.initial_amount_usd_cents, operationKey, requestHash(row), session.principal.id],
    );
    const operationId = created.rows[0]!.id;
    await db.query(
      `UPDATE card_requests SET status='issuing',issuance_started_at=now(),last_issue_operation_id=$2::uuid,updated_at=now() WHERE id=$1::uuid`,
      [row.id, operationId],
    );
    await event(db, { requestId: row.id, fromStatus: row.status, toStatus: "issuing", adminId: session.principal.id, metadata: { operationId, accountId: account.id } });
    await audit(db, { adminId: session.principal.id, action: "card_request.issue_started", entityId: row.id, requestId: traceId, ip: requestIp(request), metadata: { reference: row.reference, operationId, accountId: account.id, bin: row.bin, amountUsdCents: String(row.initial_amount_usd_cents) } });
    return { row: { ...row, status: "issuing" }, account, operationId };
  });
}

async function markFailure(args: { operationId: string; request: IssueRequestRow; adminId: string; requestId: string; ip: string | null; code: string; message: string; retryAfterSeconds?: number | null }) {
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE card_operations SET status='failed',provider_status=$2,provider_response_ref=$3,retry_after_seconds=$4,updated_at=now() WHERE id=$1::uuid`,
      [args.operationId, args.code, `error:${args.code}`, args.retryAfterSeconds ?? null],
    );
    await db.query(`UPDATE card_requests SET status='issue_failed',updated_at=now() WHERE id=$1::uuid`, [args.request.id]);
    await event(db, { requestId: args.request.id, fromStatus: "issuing", toStatus: "issue_failed", adminId: args.adminId, note: args.message, metadata: { operationId: args.operationId, providerCode: args.code, retryAfterSeconds: args.retryAfterSeconds ?? null } });
    await notify(db, args.request.id, "issue_failed");
    await audit(db, { adminId: args.adminId, action: "card_request.issue_failed", entityId: args.request.id, requestId: args.requestId, ip: args.ip, metadata: { operationId: args.operationId, providerCode: args.code, retryAfterSeconds: args.retryAfterSeconds ?? null } });
  });
}

async function markNeedsReconciliation(args: { operationId: string; request: IssueRequestRow; adminId: string; requestId: string; ip: string | null; code: string; safeNote: string; httpStatus?: number }) {
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE card_operations SET status='needs_reconciliation',provider_status=$2,provider_http_status=$3,provider_response_ref=$4,updated_at=now() WHERE id=$1::uuid`,
      [args.operationId, args.code, args.httpStatus ?? null, `ambiguous:${args.code}`],
    );
    await db.query(`UPDATE card_requests SET status='needs_reconciliation',updated_at=now() WHERE id=$1::uuid`, [args.request.id]);
    await event(db, { requestId: args.request.id, fromStatus: "issuing", toStatus: "needs_reconciliation", adminId: args.adminId, note: args.safeNote, metadata: { operationId: args.operationId, providerCode: args.code } });
    await notify(db, args.request.id, "needs_reconciliation");
    await audit(db, { adminId: args.adminId, action: "card_request.issue_needs_reconciliation", entityId: args.request.id, requestId: args.requestId, ip: args.ip, metadata: { operationId: args.operationId, providerCode: args.code } });
  });
}

function candidateCard(cards: KripicardListCard[], preIds: string[], row: IssueRequestRow, startedAt: Date) {
  const newCards = cards.filter((card) => !preIds.includes(card.card_id));
  const sameName = newCards.filter((card) => normalizeName(card.name_on_card) === normalizeName(row.name_on_card));
  const recentSameName = sameName.filter((card) => {
    const created = providerDate(card.created_at);
    return !created || created.getTime() >= startedAt.getTime() - 5 * 60_000;
  });
  return recentSameName.length === 1 ? recentSameName[0]! : null;
}

async function persistIssued(args: {
  operationId: string;
  row: IssueRequestRow;
  accountId: string;
  providerCard: { card_id: string; last4?: string | null; last_4?: string | null; status?: string; balance?: number | null; created_at?: string | null; name_on_card?: string | null };
  providerResponse?: KripicardCreateCardResponse | null;
  reconciled: boolean;
  session: AuthSession;
  request: Request;
  requestId: string;
}) {
  const initialCents = BigInt(args.row.initial_amount_usd_cents);
  const providerFeeCents = args.providerResponse ? cents(args.providerResponse.fee) : null;
  try {
    return await withTransaction(async (db) => {
      const cardResult = await db.query<{ id: string }>(
        `INSERT INTO cards(account_id,provider_card_id,last4,bin,cardholder_name,card_email,status,balance_usd_cents,balance_as_of,safe_metadata,synced_at,provider_created_at)
         VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,now(),$9::jsonb,now(),$10)
         ON CONFLICT (account_id,provider_card_id) WHERE provider_card_id IS NOT NULL DO UPDATE SET
           last4=COALESCE(EXCLUDED.last4,cards.last4),bin=COALESCE(EXCLUDED.bin,cards.bin),cardholder_name=COALESCE(EXCLUDED.cardholder_name,cards.cardholder_name),
           card_email=COALESCE(EXCLUDED.card_email,cards.card_email),status=EXCLUDED.status,balance_usd_cents=COALESCE(EXCLUDED.balance_usd_cents,cards.balance_usd_cents),
           balance_as_of=COALESCE(EXCLUDED.balance_as_of,cards.balance_as_of),safe_metadata=cards.safe_metadata||EXCLUDED.safe_metadata,synced_at=now(),archived_at=NULL,updated_at=now()
         RETURNING id`,
        [
          args.accountId,
          args.providerCard.card_id,
          args.providerCard.last_4 ?? args.providerCard.last4 ?? null,
          args.row.bin,
          args.row.name_on_card,
          args.row.email,
          (args.providerCard.status ?? "active").toLowerCase() === "active" ? "active" : "unknown",
          args.providerCard.balance == null ? initialCents : cents(args.providerCard.balance),
          JSON.stringify({ issuedByCardRequestId: args.row.id, reconciledByCardsList: args.reconciled, providerCreateFeeUsdCents: providerFeeCents?.toString() ?? null }),
          providerDate(args.providerCard.created_at),
        ],
      );
      const cardId = cardResult.rows[0]!.id;
      await db.query(
        `UPDATE card_requests SET status='issued',provider_card_id=$2,issued_at=now(),updated_at=now() WHERE id=$1::uuid`,
        [args.row.id, args.providerCard.card_id],
      );
      await db.query(
        `UPDATE card_operations SET card_id=$2::uuid,status='succeeded',provider_status='issued',provider_ref=$3,provider_fee_usd_cents=$4,
            provider_response_ref=$5,safe_result=safe_result||$6::jsonb,updated_at=now() WHERE id=$1::uuid`,
        [args.operationId, cardId, args.providerCard.card_id, providerFeeCents, args.reconciled ? "reconciled_by_cards_list" : "createcard_success", JSON.stringify({ reconciled: args.reconciled, providerCardId: args.providerCard.card_id })],
      );
      await event(db, { requestId: args.row.id, fromStatus: args.reconciled ? "needs_reconciliation" : "issuing", toStatus: "issued", adminId: args.session.principal.id, metadata: { operationId: args.operationId, cardId, providerCardId: args.providerCard.card_id, last4: args.providerCard.last_4 ?? args.providerCard.last4 ?? null, reconciled: args.reconciled } });
      await notify(db, args.row.id, "issued");
      await audit(db, { adminId: args.session.principal.id, action: "card_request.issued", entityId: args.row.id, requestId: args.requestId, ip: requestIp(args.request), metadata: { operationId: args.operationId, cardId, providerCardId: args.providerCard.card_id, reconciled: args.reconciled, providerFeeUsdCents: providerFeeCents?.toString() ?? null } });
      return { requestId: args.row.id, operationId: args.operationId, cardId, providerCardId: args.providerCard.card_id, status: "issued" as const, reconciled: args.reconciled, needsReconciliation: false };
    });
  } catch {
    try {
      await getPool().query(
        `UPDATE card_operations SET status='needs_reconciliation',provider_status='provider_accepted_local_persistence_failed',provider_response_ref='provider_accepted',updated_at=now() WHERE id=$1::uuid`,
        [args.operationId],
      );
      await getPool().query(`UPDATE card_requests SET status='needs_reconciliation',updated_at=now() WHERE id=$1::uuid`, [args.row.id]);
    } catch {
      // Keep the original active operation; the unique index blocks another create attempt.
    }
    throw new ApiError(503, "persistence_error_after_provider_write", "Kripicard may have created the card, but AccAbad could not persist the result. Do not retry createcard; reconcile this request.");
  }
}

async function reconcileWithList(args: {
  operationId: string;
  row: IssueRequestRow;
  account: AccountRow;
  client: KripicardClient;
  session: AuthSession;
  request: Request;
  requestId: string;
}) {
  const op = await getPool().query<OperationRow>(`SELECT id,card_request_id,account_id,status,safe_result,created_at FROM card_operations WHERE id=$1::uuid`, [args.operationId]);
  const operation = op.rows[0];
  if (!operation) throw new ApiError(404, "operation_not_found", "Issuance operation not found.");
  const preIds = Array.isArray(operation.safe_result?.preProviderCardIds) ? operation.safe_result.preProviderCardIds.filter((value): value is string => typeof value === "string") : [];
  const response = await args.client.listCards();
  const match = candidateCard(response.data, preIds, args.row, operation.created_at);
  if (!match) {
    return { requestId: args.row.id, operationId: args.operationId, status: "needs_reconciliation" as const, reconciled: false, needsReconciliation: true };
  }
  return persistIssued({ operationId: args.operationId, row: args.row, accountId: args.account.id, providerCard: match, providerResponse: null, reconciled: true, session: args.session, request: args.request, requestId: args.requestId });
}

export async function issueApprovedCardRequest(requestId: string, session: AuthSession, request: Request, traceId: string) {
  const env = parseServerEnv(process.env);
  if (!env.ENABLE_LIVE_PROVIDER_WRITES || !env.ENABLE_KRIPICARD_CARD_CREATION) {
    throw new ApiError(503, "feature_disabled", "Kripicard card creation is disabled by deployment configuration.");
  }
  if (!await runtimeControlEnabled("provider_writes") || !await runtimeControlEnabled("card_creation")) {
    throw new ApiError(503, "runtime_kill_switch", "Kripicard card creation is disabled by an emergency runtime control.");
  }
  await assertProviderMoneyReadiness("card_create");

  let prepared;
  try {
    prepared = await prepareIssuance(requestId, session, request, traceId);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError(409, "issuance_in_progress", "This card request already has an unresolved create-card operation. Reconcile it first.");
    }
    throw error;
  }
  const { row, account, operationId } = prepared;
  const client = new KripicardClient({ apiKey: decryptSecret(account.encrypted_api_key) });

  // Safe pre-write snapshot: if this read fails, no purchase was attempted.
  let before;
  try {
    before = await client.listCards();
    await getPool().query(
      `UPDATE card_operations SET safe_result=$2::jsonb,provider_status='ready_to_submit',updated_at=now() WHERE id=$1::uuid`,
      [operationId, JSON.stringify({ preProviderCardIds: before.data.map((card) => card.card_id), preCardCount: before.data.length })],
    );
  } catch (error) {
    const code = error instanceof KripicardError ? `preflight_${error.kind}` : "preflight_error";
    await markFailure({ operationId, request: row, adminId: session.principal.id, requestId: traceId, ip: requestIp(request), code, message: "Could not read the provider card list before issuance. No create-card request was sent." });
    throw new ApiError(502, "provider_preflight_failed", "Could not verify the provider card list before issuance. No card creation was attempted.");
  }

  let result: KripicardCreateCardResponse;
  try {
    result = await client.createCard({
      bin: row.bin,
      amount: Number(BigInt(row.initial_amount_usd_cents)) / 100,
      nameOnCard: row.name_on_card,
      email: row.email,
      dateOfBirth: dob(row.date_of_birth),
    });
  } catch (error) {
    const providerError = error instanceof KripicardError ? error : new KripicardError("network", "Kripicard request failed.", undefined, false, { safeToRetry: false });
    if (providerError.kind === "rate_limited") {
      await markFailure({ operationId, request: row, adminId: session.principal.id, requestId: traceId, ip: requestIp(request), code: "rate_limited", message: providerError.message, retryAfterSeconds: providerError.metadata.retryAfterSeconds ?? null });
      throw new ApiError(429, "provider_rate_limited", providerError.message, { retryAfterSeconds: providerError.metadata.retryAfterSeconds ?? null, scope: providerError.metadata.rateLimitScope ?? null });
    }
    if (providerError.kind === "provider_rejected" && providerError.metadata.safeToRetry === true) {
      await markFailure({ operationId, request: row, adminId: session.principal.id, requestId: traceId, ip: requestIp(request), code: providerError.metadata.providerCode ?? "provider_rejected", message: providerError.message });
      throw new ApiError(422, "provider_rejected", providerError.message);
    }

    const ambiguousCode = providerError.kind;
    await markNeedsReconciliation({ operationId, request: row, adminId: session.principal.id, requestId: traceId, ip: requestIp(request), code: ambiguousCode, safeNote: "Kripicard did not return a safely retryable result. AccAbad will not send createcard again until reconciliation.", httpStatus: providerError.status });
    try {
      const reconciled = await reconcileWithList({ operationId, row, account, client, session, request, requestId: traceId });
      if (reconciled.status === "issued") return reconciled;
    } catch {
      // Preserve the unresolved state. A failed reconciliation read must never cause another createcard call.
    }
    return { requestId: row.id, operationId, status: "needs_reconciliation" as const, reconciled: false, needsReconciliation: true, providerOutcome: ambiguousCode };
  }

  return persistIssued({
    operationId,
    row,
    accountId: account.id,
    providerCard: { card_id: result.card_id, last_4: result.last_4, status: "active", balance: result.amount, name_on_card: row.name_on_card },
    providerResponse: result,
    reconciled: false,
    session,
    request,
    requestId: traceId,
  });
}

export async function reconcileCardIssuance(requestId: string, session: AuthSession, request: Request, traceId: string) {
  const result = await getPool().query<IssueRequestRow & { encrypted_api_key: string; account_status: string; operation_id: string; operation_account_id: string }>(
    `SELECT cr.*,a.encrypted_api_key,a.status AS account_status,co.id AS operation_id,co.account_id AS operation_account_id
       FROM card_requests cr
       JOIN card_operations co ON co.id=cr.last_issue_operation_id
       JOIN kripi_accounts a ON a.id=co.account_id
      WHERE cr.id=$1::uuid AND cr.status='needs_reconciliation' AND co.operation_type='create'`,
    [requestId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(409, "nothing_to_reconcile", "This request does not have an unresolved create-card operation.");
  if (!row.encrypted_api_key.startsWith("v1.")) throw new ApiError(409, "secret_unavailable", "The issuing account no longer has a usable encrypted API key.");
  if (["disabled", "archived"].includes(row.account_status)) throw new ApiError(409, "account_unavailable", "The issuing account is disabled or archived.");
  const account: AccountRow = { id: row.operation_account_id, encrypted_api_key: row.encrypted_api_key, status: row.account_status };
  const client = new KripicardClient({ apiKey: decryptSecret(row.encrypted_api_key) });
  return reconcileWithList({ operationId: row.operation_id, row, account, client, session, request, requestId: traceId });
}
